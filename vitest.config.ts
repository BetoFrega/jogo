import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { compile } from "./compiler/compile.ts";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  // The fixture bundle is compiled in Node and handed to the Worker tests,
  // which load it into their isolated R2 bucket.
  const bundle = Object.fromEntries(compile("fixtures/content", 1));
  return {
    test: {
      projects: [
        { test: { name: "node", include: ["test/node/**/*.test.ts"], environment: "node" } },
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  TEST_BUNDLE: bundle,
                  ENVIRONMENT: "development",
                  EMAIL_TRANSPORT: "console",
                  GATE_SECRET_V1: "test-gate-secret",
                  DOC_LINK_SECRET: "test-doc-link-secret",
                  BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789",
                  BETTER_AUTH_URL: "http://localhost",
                  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
                  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
                },
              },
            }),
          ],
          test: { name: "workers", include: ["test/worker/**/*.test.ts"], setupFiles: ["test/worker/setup.ts"] },
        },
      ],
    },
  };
});
