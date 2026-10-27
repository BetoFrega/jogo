/** Cloudflare Email Service binding (plain-text subset we use). */
export interface EmailBinding {
  send(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  CONTENT: R2Bucket;
  EMAIL?: EmailBinding;

  ENVIRONMENT: "development" | "production";
  EMAIL_TRANSPORT: "console" | "cloudflare";
  MAIL_FROM: string;
  BETTER_AUTH_URL: string;
  TURNSTILE_SITE_KEY: string;

  // secrets
  BETTER_AUTH_SECRET: string;
  GATE_SECRET_V1: string;
  DOC_LINK_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  /** Development only: override Turnstile siteverify (offline/sandboxed machines). */
  TURNSTILE_VERIFY_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
