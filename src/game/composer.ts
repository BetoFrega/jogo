// Boundary: turns the reply form into composed facts, or says why it can't.
import type { Graph } from "../content/types.ts";
import type { ComposedFact } from "./answer.ts";

export function composerNames(graph: Graph) {
  const uniqSorted = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return {
    firsts: uniqSorted(graph.phonebook.map((p) => p.first)),
    lasts: uniqSorted(graph.phonebook.map((p) => p.last)),
  };
}

export function parseComposerForm(
  form: Record<string, string | File | (string | File)[]>,
  slots: number,
  graph: Graph,
): ComposedFact[] | null {
  const { firsts, lasts } = composerNames(graph);
  const relations = new Set(graph.relations.map((r) => r.id));
  const field = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
  const facts: ComposedFact[] = [];
  for (let i = 0; i < slots; i++) {
    const [first, last, rel, ofirst, olast, org, num] = ["first", "last", "rel", "ofirst", "olast", "org", "num"].map((k) => field(`f${i}_${k}`));
    if (!firsts.includes(first) || !lasts.includes(last) || !relations.has(rel)) return null;
    const personObject = ofirst !== "" || olast !== "";
    if (personObject === (org !== "")) return null; // exactly one kind of object
    if (personObject && (!firsts.includes(ofirst) || !lasts.includes(olast))) return null;
    facts.push({
      subject: { first, last },
      relation: rel,
      object: personObject ? { first: ofirst, last: olast } : { org },
      ...(num ? { number: num } : {}),
    });
  }
  return facts;
}
