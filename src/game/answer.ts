// Answer validation: one answer per question block, each checked against that
// block's fact; accepted only when every block matches. Never reports which failed.
// People and orgs arrive already resolved (resolve.ts); comparison here is exact.
import { normalize } from "../content/normalize.ts";
import type { Fact, FactObject, Graph, PersonRef, Question } from "../content/types.ts";
import { canonicalNumber } from "./resolve.ts";

export interface ComposedFact {
  subject: PersonRef;
  relation: string;
  object: FactObject;
  number?: string;
}

/** What the player filled in one block: only the block's fields; the rest comes from the fact. */
export type ComposedBlock = Partial<ComposedFact>;

const person = (p: PersonRef) => `${normalize(p.first)}|${normalize(p.last)}`;
const object = (o: FactObject) => ("org" in o ? `org:${normalize(o.org)}` : `p:${person(o)}`);

function matches(fact: Fact, symmetric: boolean, c: ComposedFact): boolean {
  if (c.relation !== fact.relation) return false;
  if (fact.number !== undefined && canonicalNumber(c.number ?? "") !== canonicalNumber(fact.number)) return false;
  const direct = person(c.subject) === person(fact.subject) && object(c.object) === object(fact.object);
  if (direct) return true;
  if (!symmetric || "org" in fact.object || "org" in c.object) return false;
  return person(c.subject) === person(fact.object) && person(c.object) === person(fact.subject);
}

export function isAccepted(graph: Graph, question: Question, answers: ComposedBlock[]): boolean {
  if (answers.length !== question.blocks.length) return false;
  const symmetric = new Set(graph.relations.filter((r) => r.symmetric).map((r) => r.id));
  return question.blocks.every((block, i) => {
    const fact = graph.facts.find((f) => f.id === block.fact)!;
    const a = answers[i];
    const composed: ComposedFact = {
      subject: a.subject ?? fact.subject,
      relation: a.relation ?? fact.relation,
      object: a.object ?? fact.object,
      number: a.number ?? fact.number,
    };
    return matches(fact, symmetric.has(fact.relation), composed);
  });
}
