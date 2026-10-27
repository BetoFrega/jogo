// Out-of-fiction account layer: Better Auth on D1 with magic links.
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { captcha, magicLink } from "better-auth/plugins";
import type { Env } from "./env.ts";
import { sendMail } from "./mail.ts";

export const MAGIC_LINK_PATH = "/sign-in/magic-link";

interface AuthConfig {
  database: BetterAuthOptions["database"];
  baseURL: string;
  secret: string;
  turnstileSecretKey: string;
  google?: { clientId: string; clientSecret: string };
  sendMagicLink: (email: string, url: string) => Promise<void>;
}

/** Shared by the Worker and scripts/gen-auth-sql.ts so the schema always matches. */
export function authOptions(c: AuthConfig) {
  return {
    database: c.database,
    baseURL: c.baseURL,
    basePath: "/api/auth",
    secret: c.secret,
    trustedOrigins: [c.baseURL],
    socialProviders: c.google ? { google: c.google } : {},
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    plugins: [
      magicLink({
        storeToken: "hashed",
        expiresIn: 15 * 60,
        sendMagicLink: ({ email, url }) => c.sendMagicLink(email, url),
      }),
      captcha({
        provider: "cloudflare-turnstile",
        secretKey: c.turnstileSecretKey,
        endpoints: [MAGIC_LINK_PATH],
      }),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(env: Env) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : undefined;
  return betterAuth(
    authOptions({
      database: env.DB,
      baseURL: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
      turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
      google,
      sendMagicLink: (email, url) =>
        sendMail(env, {
          to: email,
          subject: "Seu link de acesso",
          text: `Use este link para entrar (vale por 15 minutos):\n\n${url}\n\nSe você não pediu, ignore esta mensagem.`,
        }),
    }),
  );
}

export type Auth = ReturnType<typeof createAuth>;
