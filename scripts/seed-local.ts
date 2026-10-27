// Uploads a compiled bundle into the LOCAL R2 bucket used by `wrangler dev`.
// Usage: npm run seed:local -- <outDir>
// content/current is written last so the Worker never sees a half-uploaded version.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const BUCKET = "jogo-content";
const outDir = process.argv[2];
if (!outDir || !existsSync(join(outDir, "content", "current"))) {
  console.error("usage: npm run seed:local -- <outDir>   (outDir must contain content/current)");
  process.exit(2);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(join(outDir, "content"))
  .map((p) => ({ path: p, key: relative(outDir, p).split(sep).join("/") }))
  .sort((a, b) => Number(a.key === "content/current") - Number(b.key === "content/current"));

for (const { path, key } of files) {
  const contentType = key.endsWith(".json") ? "application/json" : "text/plain";
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--local", "--file", path, "--content-type", contentType],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  console.log(`put ${key}`);
}
console.log(`seeded ${files.length} objects into local R2 bucket ${BUCKET}`);
