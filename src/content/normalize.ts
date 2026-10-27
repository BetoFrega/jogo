/**
 * The single normalization used by the compiler (index keys, aliases, answers)
 * and by the Worker (queries, answers, passwords). See docs/content-format.md.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}
