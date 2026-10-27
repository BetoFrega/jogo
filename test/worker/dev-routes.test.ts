import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../../src/index.tsx";

const fetchWith = (path: string, overrides: Record<string, string>, init?: RequestInit) =>
  app.fetch(new Request(`http://localhost${path}`, init), { ...(env as object), ...overrides });

describe("dev-only routes", () => {
  it("expose the last magic link only in development", async () => {
    expect((await fetchWith("/dev/last-link", { ENVIRONMENT: "development" })).status).toBe(200);
    expect((await fetchWith("/dev/last-link", { ENVIRONMENT: "production" })).status).toBe(404);
  });

  it("offline siteverify passes only Cloudflare's always-pass test secret", async () => {
    const verify = (secret: string, environment = "development") =>
      fetchWith("/dev/turnstile-siteverify", { ENVIRONMENT: environment }, { method: "POST", body: JSON.stringify({ secret, response: "x" }) });
    expect(await (await verify("1x0000000000000000000000000000000AA")).json()).toEqual({ success: true, "error-codes": [] });
    expect(await (await verify("2x0000000000000000000000000000000AA")).json()).toEqual({ success: false, "error-codes": ["invalid-input-secret"] });
    expect((await verify("1x0000000000000000000000000000000AA", "production")).status).toBe(404);
  });
});
