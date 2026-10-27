import { describe, expect, it } from "vitest";
import { normalize } from "../../src/content/normalize.ts";

describe("normalize", () => {
  it("matches the contract example", () => {
    expect(normalize("Licitação 04/93")).toBe("licitacao 04 93");
  });
  it("drops accents, punctuation and collapses whitespace", () => {
    expect(normalize("  Ação   Pública—São JOÃO!! ")).toBe("acao publica sao joao");
    expect(normalize("Merenda Exemplo Ltda.")).toBe("merenda exemplo ltda");
  });
  it("returns empty for symbol-only input", () => {
    expect(normalize(" ./- ")).toBe("");
  });
});
