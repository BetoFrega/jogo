// Answer validation: a submitted set of composed facts is accepted only when
// it equals the question's fact set exactly. Never reports which fact failed.
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

export function isAccepted(graph: Graph, question: Question, submitted: ComposedFact[]): boolean {
  const facts = question.facts.map((id) => graph.facts.find((f) => f.id === id)!);
  if (submitted.length !== facts.length) return false;
  const symmetric = new Set(graph.relations.filter((r) => r.symmetric).map((r) => r.id));
  const used = new Array<boolean>(facts.length).fill(false);
  // Tiny sets (a handful of facts): exhaustive matching is fine and exact.
  const assign = (i: number): boolean => {
    if (i === submitted.length) return true;
    for (let j = 0; j < facts.length; j++) {
      if (used[j] || !matches(facts[j], symmetric.has(facts[j].relation), submitted[i])) continue;
      used[j] = true;
      if (assign(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return assign(0);
}
