import { describe, expect, it } from "vitest";
import { derivePassword, verifyPassword } from "../../src/game/gate.ts";

const WORDS = ["CAJU", "MANGA", "GOIABA", "PITANGA", "ACEROLA", "JAMBO", "CAQUI", "UMBU"];
const SECRET = "test-gate-secret";

describe("gate passwords", () => {
  it("are stable for a given secret, player and gate (golden value)", async () => {
    // If this changes, every issued in-game password changes: bump the secret version instead.
    expect(await derivePassword(SECRET, "user-1", "prefeitura", "WORD-NNNN", WORDS)).toBe("PITANGA-7622");
  });

  it("differ per player and per gate", async () => {
    const a = await derivePassword(SECRET, "user-1", "prefeitura", "WORD-NNNN", WORDS);
    expect(await derivePassword(SECRET, "user-2", "prefeitura", "WORD-NNNN", WORDS)).not.toBe(a);
    expect(await derivePassword(SECRET, "user-1", "camara", "WORD-NNNN", WORDS)).not.toBe(a);
  });

  it("verify by recomputing, normalizing both sides", async () => {
    const pw = await derivePassword(SECRET, "user-1", "prefeitura", "WORD-NNNN", WORDS);
    const sloppy = `  ${pw.toLowerCase().replace("-", " ")} `;
    expect(await verifyPassword(sloppy, SECRET, "user-1", "prefeitura", "WORD-NNNN", WORDS)).toBe(true);
    expect(await verifyPassword(pw, SECRET, "user-2", "prefeitura", "WORD-NNNN", WORDS)).toBe(false);
    expect(await verifyPassword("", SECRET, "user-1", "prefeitura", "WORD-NNNN", WORDS)).toBe(false);
  });
});
