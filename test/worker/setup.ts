import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

const testEnv = env as unknown as { DB: D1Database; CONTENT: R2Bucket; TEST_MIGRATIONS: D1Migration[]; TEST_BUNDLE: Record<string, string> };

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
for (const [key, text] of Object.entries(testEnv.TEST_BUNDLE)) await testEnv.CONTENT.put(key, text);
