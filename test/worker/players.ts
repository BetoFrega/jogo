import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { createAuth } from "../../src/auth.ts";
import type { Env } from "../../src/env.ts";
import app from "../../src/index.tsx";
import { lastDevMailSent } from "../../src/mail.ts";

export const testEnv = env as unknown as Env;
export const BASE = "http://localhost";
export const get = (path: string, cookie: string) => app.fetch(new Request(BASE + path, { headers: { cookie } }), testEnv);
export const postForm = (path: string, cookie: string, fields: Record<string, string>) =>
  app.fetch(
    new Request(BASE + path, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    }),
    testEnv,
  );

/** Real magic-link sign-in (server API, so no captcha) + handle creation; returns the session cookie. */
export async function newPlayer(email: string, handle: string): Promise<string> {
  await createAuth(testEnv).api.signInMagicLink({ body: { email, callbackURL: "/" }, headers: new Headers() });
  const link = lastDevMailSent()!.text.match(/https?:\/\/\S+/)![0];
  const verified = await app.fetch(new Request(link), testEnv);
  const cookie = verified.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const created = await postForm("/identidade", cookie, { handle });
  expect([created.status, created.headers.get("location")]).toEqual([302, "/correio"]);
  return cookie;
}
