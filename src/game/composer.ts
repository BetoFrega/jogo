// Boundary: turns the reply form into one composed answer per question block,
// or says, per field, why it can't. Each block shows only its own fields.
import type { Block, BlockField, Graph } from "../content/types.ts";
import type { ComposedBlock } from "./answer.ts";
import { canonicalNumber, personName, resolveOrg, resolvePerson, type Resolution } from "./resolve.ts";

/** Field name -> typed value, as echoed back into the form. */
export type ComposerValues = Record<string, string>;
export type ComposerParse = { kind: "ok"; answers: ComposedBlock[] } | { kind: "errors"; errors: Record<string, string> };

export const fieldName = (row: number, field: BlockField) => `f${row}_${field}`;

export function composerValues(form: Record<string, string | File | (string | File)[]>, blocks: Block[]): ComposerValues {
  const values: ComposerValues = {};
  blocks.forEach((b, i) => {
    for (const f of b.fields) {
      const v = form[fieldName(i, f)];
      if (typeof v === "string") values[fieldName(i, f)] = v;
    }
  });
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
export function parseComposer(values: ComposerValues, blocks: Block[], graph: Graph, collectedOrgs: string[]): ComposerParse {
  const orgs = graph.orgs.filter((o) => collectedOrgs.includes(o.id));
  const relations = new Set(graph.relations.map((r) => r.id));
  const errors: Record<string, string> = {};
  const answers = blocks.map((block, i) => {
    const asks = (f: BlockField) => block.fields.includes(f);
    const v = (f: BlockField) => (values[fieldName(i, f)] ?? "").trim();
    const fail = (f: BlockField, msg: string) => (errors[fieldName(i, f)] = msg);
    const answer: ComposedBlock = {};

    if (asks("who")) {
      const who = v("who") ? resolvePerson(graph.phonebook, v("who")) : null;
      if (!who) fail("who", REQUIRED);
      else if (who.kind !== "ok") fail("who", personError(who));
      else answer.subject = { first: who.value.first, last: who.value.last };
    }

    if (asks("rel")) {
      if (!relations.has(v("rel"))) fail("rel", REQUIRED);
      else answer.relation = v("rel");
    }

    if (asks("obj")) {
      if (!v("obj")) fail("obj", REQUIRED);
      else {
        const person = resolvePerson(graph.phonebook, v("obj"));
        const org = resolveOrg(orgs, v("obj"));
        if (person.kind === "ok" && org.kind === "ok") fail("obj", `Há uma pessoa e uma entidade com esse nome: ${personName(person.value)}, ${org.value.name}.`);
        else if (person.kind === "ok") answer.object = { first: person.value.first, last: person.value.last };
        else if (org.kind === "ok") answer.object = { org: org.value.id };
        else fail("obj", objectError(person, org));
      }
    }

    if (asks("num")) {
      if (canonicalNumber(v("num")) === "") fail("num", REQUIRED);
      else answer.number = v("num");
    }
    return answer;
  });
  return Object.keys(errors).length ? { kind: "errors", errors } : { kind: "ok", answers };
}
