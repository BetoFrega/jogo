// Usage: npm run compile -- <sourceDir> <outDir> --version <N>
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CompileError, compile } from "../compiler/compile.ts";

const args = process.argv.slice(2);
const vi = args.indexOf("--version");
const version = vi >= 0 ? Number(args[vi + 1]) : NaN;
const [sourceDir, outDir] = args.filter((_, i) => i !== vi && i !== vi + 1);

if (!sourceDir || !outDir || !Number.isInteger(version) || version < 1) {
  console.error("usage: npm run compile -- <sourceDir> <outDir> --version <N>");
  process.exit(2);
}

try {
  const files = compile(sourceDir, version, (w) => console.log(`warning: ${w}`));
  rmSync(join(outDir, "content", `v${version}`), { recursive: true, force: true });
  for (const [path, text] of files) {
    const target = join(outDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  console.log(`compiled ${files.size} files into ${outDir} (v${version})`);
} catch (e) {
  if (e instanceof CompileError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
