import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createAuth } from "../../src/auth.ts";
import type { Env } from "../../src/env.ts";
import app from "../../src/index.tsx";
import { lastDevMailSent } from "../../src/mail.ts";

const testEnv = env as unknown as Env;
const BASE = "http://localhost";
const get = (path: string, cookie: string) => app.fetch(new Request(BASE + path, { headers: { cookie } }), testEnv);

/** Real magic-link sign-in (server API, so no captcha) + handle creation; returns the session cookie. */
async function newPlayer(email: string, handle: string): Promise<string> {
  await createAuth(testEnv).api.signInMagicLink({ body: { email, callbackURL: "/" }, headers: new Headers() });
  const link = lastDevMailSent()!.text.match(/https?:\/\/\S+/)![0];
  const verified = await app.fetch(new Request(link), testEnv);
  const cookie = verified.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const created = await app.fetch(
    new Request(`${BASE}/identidade`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: `handle=${handle}` }),
    testEnv,
  );
  expect(created.status).toBe(302);
  return cookie;
}

async function searchLink(cookie: string): Promise<string> {
  const html = await (await get("/busca/diario?q=portaria%200493", cookie)).text();
  return html.match(/href="(\/doc\/ato-0493\?s=[A-Za-z0-9_-]{16})"/)![1];
}

describe("signed doc links", () => {
  it("open with this player's link and 404 exactly like an unknown id otherwise", async () => {
    const alice = await newPlayer("alice@example.com", "alice");
    const bob = await newPlayer("bob@example.com", "bob");
    const aliceLink = await searchLink(alice);

    const ok = await get(aliceLink, alice);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("RESOLVE nomear Rui Exemplo");

    const unknown = await get("/doc/nao-existe", alice);
    const unknownBody = await unknown.text();
    expect(unknown.status).toBe(404);
    for (const [path, cookie] of [
      ["/doc/ato-0493", alice], // no signature
      ["/doc/ato-0493?s=AAAAAAAAAAAAAAAA", alice], // forged
      [aliceLink, bob], // another player's link
      [aliceLink.replace("ato-0493", "ato-0101"), alice], // signature for a different doc
    ]) {
      const res = await get(path, cookie);
      expect([path, res.status, await res.text()]).toEqual([path, 404, unknownBody]);
    }
  });
});
