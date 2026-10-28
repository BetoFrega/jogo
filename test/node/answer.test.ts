import { describe, expect, it } from "vitest";
import { compile } from "../../compiler/compile.ts";
import type { Graph } from "../../src/content/types.ts";
import { isAccepted, type ComposedBlock, type ComposedFact } from "../../src/game/answer.ts";

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
const irmaos: ComposedFact = { subject: { first: "Beto", last: "Teste" }, relation: "irmao_de", object: { first: "Ana", last: "Teste" } };

describe("isAccepted", () => {
  it("checks each block against its own fact, ignoring case and accents", () => {
    expect(isAccepted(graph, q1, [nomeacao, conjuge, irmaos])).toBe(true);
    expect(isAccepted(graph, q1, [nomeacao, { ...conjuge, subject: { first: "RUÍ", last: "exemplo" } }, irmaos])).toBe(true);
    // Right facts in the wrong blocks are wrong.
    expect(isAccepted(graph, q1, [conjuge, nomeacao, irmaos])).toBe(false);
  });

  it("accepts a symmetric relation in either direction but not an asymmetric one", () => {
    const flipped: ComposedFact = { ...conjuge, subject: conjuge.object as ComposedFact["subject"], object: conjuge.subject };
    expect(isAccepted(graph, q1, [nomeacao, flipped, irmaos])).toBe(true);
    const flippedNomeacao: ComposedFact = { ...nomeacao, subject: { first: "Rui", last: "Exemplo" }, object: { first: "Marta", last: "Exemplo" } };
    expect(isAccepted(graph, q1, [flippedNomeacao, conjuge, irmaos])).toBe(false);
  });

  it("rejects the whole answer when any single block is wrong", () => {
    expect(isAccepted(graph, q1, [{ ...nomeacao, number: "1250" }, conjuge, irmaos])).toBe(false);
    expect(isAccepted(graph, q1, [nomeacao, { ...conjuge, object: { first: "Ana", last: "Exemplo" } }, irmaos])).toBe(false);
  });

  it("rejects a wrong number of blocks", () => {
    expect(isAccepted(graph, q1, [nomeacao, conjuge])).toBe(false);
    expect(isAccepted(graph, q1, [nomeacao, conjuge, irmaos, irmaos])).toBe(false);
  });

  it("compares numbers without leading zeros or a leading nº, but never fuzzily", () => {
    expect(isAccepted(graph, q1, [{ ...nomeacao, number: "nº 493" }, conjuge, irmaos])).toBe(true);
    expect(isAccepted(graph, q1, [{ ...nomeacao, number: "0439" }, conjuge, irmaos])).toBe(false);
  });

  it("takes the parts a block does not ask from its fact, and matches org objects by id", () => {
    const socia: ComposedFact = { subject: { first: "Ana", last: "Teste" }, relation: "socio_de", object: { org: "org-merenda" } };
    const pagamento: ComposedBlock = { relation: "autorizou_pagamento", object: { org: "org-merenda" }, number: "1250" };
    const quemNomeou: ComposedBlock = { subject: nomeacao.subject, object: nomeacao.object, number: "493" };
    expect(isAccepted(graph, q2, [socia, pagamento, quemNomeou])).toBe(true);
    expect(isAccepted(graph, q2, [{ ...socia, object: { org: "org-obras" } }, pagamento, quemNomeou])).toBe(false);
    expect(isAccepted(graph, q2, [socia, { ...pagamento, number: "1251" }, quemNomeou])).toBe(false);
  });
});

describe("question blocks in the compiler", () => {
  it("default to every field the fact has and keep a declared subset", () => {
    expect(q1.blocks.map((b) => b.fields)).toEqual([["who", "rel", "obj", "num"], ["who", "rel", "obj"], ["who", "rel", "obj"]]);
    expect(q2.blocks[1].fields).toEqual(["rel", "obj", "num"]);
  });
});
