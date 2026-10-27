import { describe, expect, it } from "vitest";
import { compile } from "../../compiler/compile.ts";
import type { Graph } from "../../src/content/types.ts";
import { canonicalNumber, resolveOrg, resolvePerson } from "../../src/game/resolve.ts";

const graph: Graph = JSON.parse(compile("fixtures/content", 1).get("content/v1/graph.json")!);
const person = (typed: string) => {
  const r = resolvePerson(graph.phonebook, typed);
  return r.kind === "ok" ? `${r.value.first} ${r.value.last}` : r;
};
const org = (typed: string) => {
  const r = resolveOrg(graph.orgs, typed);
  return r.kind === "ok" ? r.value.id : r;
};

describe("resolvePerson", () => {
  it("resolves the exact full name, ignoring case and accents", () => {
    expect(person("MARTA exémplo")).toBe("Marta Exemplo");
    expect(person("Beatriz Quaresma Teste")).toBe("Beatriz Quaresma Teste");
  });

  it("accepts one typo per token when a single entry is close", () => {
    expect(person("Marta Exenplo")).toBe("Marta Exemplo");
    expect(person("Mrata Exemplo")).toBe("Marta Exemplo"); // adjacent swap
    expect(person("Beatriz Quarema Teste")).toBe("Beatriz Quaresma Teste");
  });

  it("allows two typos only in tokens of 8+ letters", () => {
    expect(person("Beatris Quarezna Teste")).toBe("Beatriz Quaresma Teste");
    expect(person("Marta Exanpla")).toEqual({ kind: "unknown" });
  });

  it("accepts a full name with the middle surname omitted", () => {
    expect(person("Beatriz Teste")).toBe("Beatriz Quaresma Teste");
    expect(person("Beatriz Quaresma")).toEqual({ kind: "unknown" }); // the last surname is never dropped
  });

  it("refuses a typo that is close to more than one entry", () => {
    expect(person("Ruj Exemplo")).toEqual({ kind: "ambiguous", names: ["Rui Exemplo", "Ruy Exemplo"] });
  });

  it("never corrects an exact entry into its look-alike", () => {
    expect(person("Ruy Exemplo")).toBe("Ruy Exemplo");
    expect(person("Rui Exemplo")).toBe("Rui Exemplo");
  });

  it("reports names that are not in the phonebook", () => {
    expect(person("Joana Exemplo")).toEqual({ kind: "unknown" });
    expect(person("Marta")).toEqual({ kind: "unknown" });
  });
});

describe("resolveOrg", () => {
  it("matches the name with or without the company-type suffix, and one typo", () => {
    expect(org("Merenda Exemplo Ltda.")).toBe("org-merenda");
    expect(org("merenda exemplo")).toBe("org-merenda");
    expect(org("Obras Teste SA")).toBe("org-obras");
    expect(org("Merenda Exenplo")).toBe("org-merenda");
  });

  it("reports unknown entities", () => {
    expect(org("Padaria Exemplo")).toEqual({ kind: "unknown" });
  });
});

describe("canonicalNumber", () => {
  it("equates leading zeros per segment and drops a leading nº / n. / Portaria", () => {
    expect(canonicalNumber("087/94")).toBe("87 94");
    expect(canonicalNumber("87/94")).toBe("87 94");
    expect(canonicalNumber("nº 0493")).toBe("493");
    expect(canonicalNumber("N. 493")).toBe("493");
    expect(canonicalNumber("Portaria nº 0493")).toBe("493");
    expect(canonicalNumber("0")).toBe("0");
  });

  it("does nothing fuzzy", () => {
    expect(canonicalNumber("0439")).toBe("439");
    expect(canonicalNumber("493/93")).toBe("493 93");
  });
});
