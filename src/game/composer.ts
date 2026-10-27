// Boundary: turns the reply form into composed facts, or says, per field, why it can't.
// Rows are order-free; the first `numbered` rows carry a Número field, one per
// question fact that has a number, so the form shape never says which fact is which.
import type { Graph, Question } from "../content/types.ts";
import type { ComposedFact } from "./answer.ts";
import { canonicalNumber, resolveOrg, resolvePerson, type Resolution } from "./resolve.ts";

export interface ComposerLayout {
  slots: number;
  /** Rows 0..numbered-1 show the Número field. */
  numbered: number;
}

export function composerLayout(graph: Graph, question: Question): ComposerLayout {
  const numbered = question.facts.filter((id) => graph.facts.find((f) => f.id === id)!.number !== undefined).length;
  return { slots: question.facts.length, numbered };
}

/** Field name -> typed value, as echoed back into the form. */
export type ComposerValues = Record<string, string>;
export type ComposerParse = { kind: "ok"; facts: ComposedFact[] } | { kind: "errors"; errors: Record<string, string> };

const FIELDS = ["who", "rel", "obj", "org", "num"] as const;
export const fieldName = (row: number, field: (typeof FIELDS)[number]) => `f${row}_${field}`;

export function composerValues(form: Record<string, string | File | (string | File)[]>, layout: ComposerLayout): ComposerValues {
  const values: ComposerValues = {};
  for (let i = 0; i < layout.slots; i++)
    for (const f of FIELDS) {
      const v = form[fieldName(i, f)];
      if (typeof v === "string") values[fieldName(i, f)] = v;
    }
  return values;
}

const REQUIRED = "Obrigatório.";

function personError(r: Resolution<unknown>): string {
  return r.kind === "ambiguous"
    ? `Há mais de uma pessoa na lista telefônica com nome parecido: ${r.names.join(", ")}. Escreva o nome como consta na lista.`
    : "Nome não consta na lista telefônica.";
}

function orgError(r: Resolution<unknown>): string {
  return r.kind === "ambiguous"
    ? `Há mais de uma entidade com nome parecido: ${r.names.join(", ")}. Escreva o nome como consta nos documentos.`
    : "Entidade não encontrada.";
}

export function parseComposer(values: ComposerValues, layout: ComposerLayout, graph: Graph): ComposerParse {
  const relations = new Set(graph.relations.map((r) => r.id));
  const errors: Record<string, string> = {};
  const facts: ComposedFact[] = [];
  for (let i = 0; i < layout.slots; i++) {
    const v = (f: (typeof FIELDS)[number]) => (values[fieldName(i, f)] ?? "").trim();
    const fail = (f: (typeof FIELDS)[number], msg: string) => (errors[fieldName(i, f)] = msg);

    const who = v("who") ? resolvePerson(graph.phonebook, v("who")) : null;
    if (!who) fail("who", REQUIRED);
    else if (who.kind !== "ok") fail("who", personError(who));

    if (!relations.has(v("rel"))) fail("rel", REQUIRED);

    let object: ComposedFact["object"] | null = null;
    if (v("obj") && v("org")) fail("obj", "Preencha só um: pessoa ou entidade.");
    else if (v("obj")) {
      const r = resolvePerson(graph.phonebook, v("obj"));
      if (r.kind === "ok") object = { first: r.value.first, last: r.value.last };
      else fail("obj", personError(r));
    } else if (v("org")) {
      const r = resolveOrg(graph.orgs, v("org"));
      if (r.kind === "ok") object = { org: r.value.id };
      else fail("org", orgError(r));
    } else fail("obj", "Preencha a pessoa ou a entidade.");

    const numbered = i < layout.numbered;
    if (numbered && canonicalNumber(v("num")) === "") fail("num", REQUIRED);

    if (who?.kind === "ok" && object && relations.has(v("rel")))
      facts.push({
        subject: { first: who.value.first, last: who.value.last },
        relation: v("rel"),
        object,
        ...(numbered ? { number: v("num") } : {}),
      });
  }
  return Object.keys(errors).length ? { kind: "errors", errors } : { kind: "ok", facts };
}

