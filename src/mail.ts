// Out-of-fiction email (magic links). One interface, two transports.
import type { Env } from "./env.ts";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

// Dev only: the last magic link, shown at /dev/last-link. Lives in isolate
// memory, which is enough for a single local `wrangler dev` process.
let lastDevMail: (OutgoingMail & { at: string }) | null = null;

export function lastDevMailSent() {
  return lastDevMail;
}

export async function sendMail(env: Env, mail: OutgoingMail): Promise<void> {
  if (env.EMAIL_TRANSPORT === "console") {
    if (env.ENVIRONMENT !== "development") throw new Error("console email transport is only allowed in development");
    lastDevMail = { ...mail, at: new Date().toISOString() };
    console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  if (!env.EMAIL) throw new Error("EMAIL_TRANSPORT=cloudflare but the EMAIL binding is missing");
  await env.EMAIL.send({ from: env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
}
