// Turns what the player typed into a phonebook entry or an org BEFORE judging.
// Typo tolerance lives only here: the judge (answer.ts) compares resolved
// entries exactly, so a name that is itself another entry is never "corrected".
import { normalize } from "../content/normalize.ts";
import type { Org, PhonebookEntry } from "../content/types.ts";

export type Resolution<T> = { kind: "ok"; value: T } | { kind: "ambiguous"; names: string[] } | { kind: "unknown" };

/** Optimal-string-alignment Damerau-Levenshtein distance (adjacent swaps cost 1). */
export function damerauLevenshtein(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

type Close = (a: string, b: string) => boolean;
const typo: Close = (a, b) => damerauLevenshtein(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1);
const same: Close = (a, b) => a === b;

/** `input` is an in-order subsequence of `entry`, token by token. */
function subsequence(input: string[], entry: string[], close: Close): boolean {
  if (input.length === 0) return true;
  if (entry.length < input.length) return false;
  return (close(input[0], entry[0]) && subsequence(input.slice(1), entry.slice(1), close)) || subsequence(input, entry.slice(1), close);
}

/**
 * Typo-tolerant match of normalized names: first and last tokens must match,
 * middle tokens of `entry` may be omitted ("daniela leite" ~ "daniela quaresma leite").
 */
export function nameMatches(input: string, entry: string, close: Close = typo): boolean {
  const i = input.split(" ").filter(Boolean);
  const e = entry.split(" ").filter(Boolean);
  if (i.length === 0 || e.length === 0) return false;
  if (i.length === 1 || e.length === 1) return i.length === e.length && close(i[0], e[0]);
  return close(i[0], e[0]) && close(i.at(-1)!, e.at(-1)!) && subsequence(i.slice(1, -1), e.slice(1, -1), close);
}

function resolve<T>(items: T[], key: (t: T) => string, display: (t: T) => string, typedKey: string): Resolution<T> {
  const pick = (found: T[]): Resolution<T> | null =>
    found.length === 1
      ? { kind: "ok", value: found[0] }
      : found.length > 1
        ? { kind: "ambiguous", names: found.map(display).sort((a, b) => a.localeCompare(b, "pt-BR")) }
        : null;
  if (typedKey === "") return { kind: "unknown" };
  return (
    pick(items.filter((t) => key(t) === typedKey)) ??
    // Spelled right with a middle name left out beats a one-letter neighbour:
    // "daniela leite" is Daniela Quaresma Leite, not Daniel Leite.
    pick(items.filter((t) => nameMatches(typedKey, key(t), same))) ??
    pick(items.filter((t) => nameMatches(typedKey, key(t)))) ?? { kind: "unknown" }
  );
}

export const personName = (p: PhonebookEntry) => `${p.first} ${p.last}`;
const personKey = (p: PhonebookEntry) => normalize(personName(p));

export function resolvePerson(phonebook: PhonebookEntry[], typed: string): Resolution<PhonebookEntry> {
  return resolve(phonebook, personKey, personName, normalize(typed));
}

/** Normalized org name without a trailing company-type suffix ("Ltda.", "S.A."). */
const orgKey = (name: string) => normalize(name).replace(/ (ltda|s a|sa)$/, "");

export function resolveOrg(orgs: Org[], typed: string): Resolution<Org> {
  return resolve(orgs, (o) => orgKey(o.name), (o) => o.name, orgKey(typed));
}

/** Pairs of phonebook entries within typo tolerance of each other (either direction). */
export function similarPhonebookPairs(phonebook: PhonebookEntry[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let a = 0; a < phonebook.length; a++)
    for (let b = a + 1; b < phonebook.length; b++) {
      const [ka, kb] = [personKey(phonebook[a]), personKey(phonebook[b])];
      if (nameMatches(ka, kb) || nameMatches(kb, ka)) pairs.push([personName(phonebook[a]), personName(phonebook[b])]);
    }
  return pairs;
}

/**
 * Canonical form of a typed or authored number. No tolerance: only normalization,
 * a leading "Portaria"/"porta"/"P"/"nº"/"n." dropped, leading zeros dropped per segment and
 * separators dropped ("Portaria nº 087/94" = "87/94" = "8794", "4.471" = "4471").
 */
export function canonicalNumber(s: string): string {
  const tokens = normalize(s).split(" ").filter(Boolean);
  while (tokens.length && ["portaria", "porta", "p", "n", "no"].includes(tokens[0])) tokens.shift();
  return tokens.map((t) => (/^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t)).join("");
}
