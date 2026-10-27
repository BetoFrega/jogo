import { normalize } from "../content/normalize.ts";
import type { Engine, Index } from "../content/types.ts";

export type SearchOutcome =
  | { kind: "empty_query" }
  | { kind: "too_many" } // diegetic limit error; the count is never revealed
  | { kind: "results"; docIds: string[] };

/** Exact match of the normalized query against normalized index keys. */
export function search(engine: Engine, index: Index, query: string): SearchOutcome {
  const key = normalize(query);
  if (!key) return { kind: "empty_query" };
  const docIds = index[key] ?? [];
  if (docIds.length > engine.max_results) return { kind: "too_many" };
  return { kind: "results", docIds };
}
