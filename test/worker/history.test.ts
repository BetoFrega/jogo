import { describe, expect, it } from "vitest";
import * as state from "../../src/game/state.ts";
import { get, newPlayer, testEnv } from "./players.ts";

const DIARIO = "Diário Oficial de Vila Exemplo";
const FORUM = "Fórum Vila Exemplo";
const INTRANET = "Intranet da Prefeitura";

/** The "Histórico" panel of a page, as [href, title, source, current] rows; or the empty-state text. */
async function history(path: string, cookie: string): Promise<string[][] | string> {
  const res = await get(path, cookie);
  expect(res.status).toBe(200);
  const html = await res.text();
  const panel = html.match(/<aside class="window history"[\s\S]*?<\/aside>/)![0];
  const rows = [...panel.matchAll(/<li><a href="([^"]+)"( aria-current="page")?>([^<]*)<\/a><span class="src" title="([^"]*)">([^<]*)<\/span><\/li>/g)];
  if (rows.length === 0) return panel.match(/<p class="notice">([^<]*)<\/p>/)![1];
  return rows.map((r) => {
    expect(r[4]).toBe(r[5]); // the full name is kept as a tooltip when CSS cuts it short
    return [r[1], r[3], r[4], r[2] ? "current" : ""];
  });
}

async function searchLink(cookie: string, engine: string, q: string, docId: string): Promise<string> {
  const html = await (await get(`/busca/${engine}?q=${encodeURIComponent(q)}`, cookie)).text();
  return html.match(new RegExp(`href="(/doc/${docId}\\?s=[A-Za-z0-9_-]{16})"`))![1];
}

async function userId(handle: string): Promise<string> {
  return (await testEnv.DB.prepare("SELECT user_id FROM player WHERE handle = ?").bind(handle).first<{ user_id: string }>())!.user_id;
}

describe("Histórico panel", () => {
  it("lists this player's opened docs, most recent first, with their own working links", async () => {
    const hana = await newPlayer("hana@example.com", "hana");
    const ivo = await newPlayer("ivo@example.com", "ivo");

    // Empty before any doc is opened, on every fiction page.
    expect(await history("/", hana)).toBe("Nenhum documento consultado.");
    expect(await history("/lista", hana)).toBe("Nenhum documento consultado.");

    const ato = await searchLink(hana, "diario", "portaria 0493", "ato-0493");
    const merenda = await searchLink(hana, "forum", "merenda", "forum-merenda");
    // The doc page itself already shows the doc it records, marked as current.
    expect(await history(ato, hana)).toEqual([[ato, "Portaria nº 0493/93", DIARIO, "current"]]);
    expect(await history(merenda, hana)).toEqual([
      [merenda, "merenda das escolas", FORUM, "current"],
      [ato, "Portaria nº 0493/93", DIARIO, ""],
    ]);

    // Reopening moves the doc to the top.
    expect(await history(ato, hana)).toEqual([
      [ato, "Portaria nº 0493/93", DIARIO, "current"],
      [merenda, "merenda das escolas", FORUM, ""],
    ]);
    expect(await history("/correio", hana)).toEqual([
      [ato, "Portaria nº 0493/93", DIARIO, ""],
      [merenda, "merenda das escolas", FORUM, ""],
    ]);

    // Intranet docs use the same plain link as the intranet listing.
    await state.unlockGate(testEnv.DB, await userId("hana"), "prefeitura", Date.now());
    expect((await history("/doc/memorando-interno", hana))[0]).toEqual(["/doc/memorando-interno", "Memorando: uso do terminal", INTRANET, "current"]);

    // Every history link opens for its owner (opening them top to bottom reverses the list).
    for (const [href] of (await history("/", hana)) as string[][]) expect([href, (await get(href, hana)).status]).toEqual([href, 200]);

    // Another player sees none of it, and gets their own signature for the same doc.
    expect(await history("/", ivo)).toBe("Nenhum documento consultado.");
    const ivoAto = await searchLink(ivo, "diario", "portaria 0493", "ato-0493");
    expect(ivoAto).not.toBe(ato);
    expect(await history(ivoAto, ivo)).toEqual([[ivoAto, "Portaria nº 0493/93", DIARIO, "current"]]);
    expect((await get(ato, ivo)).status).toBe(404);
    expect(((await history("/", hana)) as string[][]).map((r) => r[0])).toEqual([merenda, ato, "/doc/memorando-interno"]);
  });

  it("skips docs that are no longer in the current content", async () => {
    const jade = await newPlayer("jade@example.com", "jade");
    const ato = await searchLink(jade, "diario", "portaria 0493", "ato-0493");
    await get(ato, jade);
    await testEnv.DB.prepare("INSERT INTO seen_doc (user_id, doc_id, seen_at) VALUES (?, 'doc-removido', ?)")
      .bind(await userId("jade"), Date.now() + 60_000)
      .run();
    expect(await history("/", jade)).toEqual([[ato, "Portaria nº 0493/93", DIARIO, ""]]);
  });
});
