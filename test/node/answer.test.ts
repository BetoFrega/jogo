import { describe, expect, it } from "vitest";
import { compile } from "../../compiler/compile.ts";
import type { Graph } from "../../src/content/types.ts";
import { isAccepted, type ComposedFact } from "../../src/game/answer.ts";

const graph: Graph = JSON.parse(compile("fixtures/content", 1).get("content/v1/graph.json")!);
const q1 = graph.questions.find((q) => q.id === "q1")!;
const q2 = graph.questions.find((q) => q.id === "q2")!;

const nomeacao: ComposedFact = {
  subject: { first: "Marta", last: "Exemplo" },
  relation: "nomeou",
  object: { first: "Rui", last: "Exemplo" },
  number: "0493",
};
const conjuge: ComposedFact = { subject: { first: "Rui", last: "Exemplo" }, relation: "conjuge", object: { first: "Ana", last: "Teste" } };

describe("isAccepted", () => {
  it("accepts the exact set in any order, ignoring case and accents", () => {
    expect(isAccepted(graph, q1, [nomeacao, conjuge])).toBe(true);
    expect(isAccepted(graph, q1, [{ ...conjuge, subject: { first: "RUÍ", last: "exemplo" } }, nomeacao])).toBe(true);
  });

  it("accepts a symmetric relation in either direction but not an asymmetric one", () => {
    const flipped: ComposedFact = { ...conjuge, subject: conjuge.object as ComposedFact["subject"], object: conjuge.subject };
    expect(isAccepted(graph, q1, [nomeacao, flipped])).toBe(true);
    const flippedNomeacao: ComposedFact = { ...nomeacao, subject: { first: "Rui", last: "Exemplo" }, object: { first: "Marta", last: "Exemplo" } };
    expect(isAccepted(graph, q1, [flippedNomeacao, conjuge])).toBe(false);
  });

  it("rejects the batch when any single fact is wrong", () => {
    expect(isAccepted(graph, q1, [{ ...nomeacao, number: "1250" }, conjuge])).toBe(false);
    expect(isAccepted(graph, q1, [{ ...nomeacao, number: undefined }, conjuge])).toBe(false);
    expect(isAccepted(graph, q1, [nomeacao, { ...conjuge, object: { first: "Ana", last: "Exemplo" } }])).toBe(false);
  });

  it("rejects wrong set sizes and duplicates", () => {
    expect(isAccepted(graph, q1, [nomeacao])).toBe(false);
    expect(isAccepted(graph, q1, [nomeacao, nomeacao])).toBe(false);
    expect(isAccepted(graph, q1, [nomeacao, conjuge, conjuge])).toBe(false);
  });

  it("compares numbers without leading zeros or a leading nº, but never fuzzily", () => {
    expect(isAccepted(graph, q1, [{ ...nomeacao, number: "nº 493" }, conjuge])).toBe(true);
    expect(isAccepted(graph, q1, [{ ...nomeacao, number: "00493" }, conjuge])).toBe(true);
    expect(isAccepted(graph, q1, [{ ...nomeacao, number: "0439" }, conjuge])).toBe(false);
  });

  it("matches org objects by id", () => {
    const socia: ComposedFact = { subject: { first: "Ana", last: "Teste" }, relation: "socio_de", object: { org: "org-merenda" } };
    const pagamento: ComposedFact = { subject: { first: "Rui", last: "Exemplo" }, relation: "autorizou_pagamento", object: { org: "org-merenda" }, number: "1250" };
    expect(isAccepted(graph, q2, [pagamento, socia])).toBe(true);
    expect(isAccepted(graph, q2, [pagamento, { ...socia, object: { org: "org-obras" } }])).toBe(false);
  });
});
