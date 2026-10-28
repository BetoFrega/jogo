// Boundary: turns the reply form into composed facts, or says, per field, why it can't.
// Rows are order-free; the first `numbered` rows carry a Número field, one per
// question fact that has a number, so the form shape never says which fact is which.
import type { Graph, Question } from "../content/types.ts";
import type { ComposedFact } from "./answer.ts";
import { canonicalNumber, personName, resolveOrg, resolvePerson, type Resolution } from "./resolve.ts";

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

const FIELDS = ["who", "rel", "obj", "num"] as const;
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

/**
 * "Com quem" is one field for a person or an entity: the name is looked up in the
 * phonebook and among the orgs the player has collected, and must land on exactly one.
 */
function objectError(person: Resolution<unknown>, org: Resolution<unknown>): string {
  const names = [person, org].flatMap((r) => (r.kind === "ambiguous" ? r.names : []));
  return names.length
    ? `Há mais de um nome parecido: ${names.join(", ")}. Escreva o nome como consta na lista ou nos documentos.`
    : "Não consta na lista telefônica nem nos documentos que você leu.";
}

/** `collectedOrgs`: only orgs the player met in a document resolve, so typing never reveals the case's orgs. */
export function parseComposer(values: ComposerValues, layout: ComposerLayout, graph: Graph, collectedOrgs: string[]): ComposerParse {
  const orgs = graph.orgs.filter((o) => collectedOrgs.includes(o.id));
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
    if (!v("obj")) fail("obj", REQUIRED);
    else {
      const person = resolvePerson(graph.phonebook, v("obj"));
      const org = resolveOrg(orgs, v("obj"));
      if (person.kind === "ok" && org.kind === "ok") fail("obj", `Há uma pessoa e uma entidade com esse nome: ${personName(person.value)}, ${org.value.name}.`);
      else if (person.kind === "ok") object = { first: person.value.first, last: person.value.last };
      else if (org.kind === "ok") object = { org: org.value.id };
      else fail("obj", objectError(person, org));
    }

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

