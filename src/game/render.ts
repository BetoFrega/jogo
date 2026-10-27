// Fills {{player.handle}} and {{gate:<id>}} for one player. The compiler has
// already rejected unknown placeholders, so anything else is left untouched.
const PLACEHOLDER_RE = /\{\{\s*(player\.handle|gate:[a-z0-9-]+)\s*\}\}/g;

export async function renderPlaceholders(
  text: string,
  handle: string,
  gatePassword: (gateId: string) => Promise<string>,
): Promise<string> {
  const gateIds = new Set([...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]).filter((n) => n.startsWith("gate:")).map((n) => n.slice(5)));
  const passwords = new Map(await Promise.all([...gateIds].map(async (id) => [id, await gatePassword(id)] as const)));
  return text.replace(PLACEHOLDER_RE, (_, name: string) => (name === "player.handle" ? handle : passwords.get(name.slice(5))!));
}
