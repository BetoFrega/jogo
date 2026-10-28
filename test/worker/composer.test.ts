import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { get, newPlayer, postForm } from "./players.ts";

const DB = (env as unknown as { DB: D1Database }).DB;
let n = 0;

async function player() {
  const handle = `comp${++n}`;
  const cookie = await newPlayer(`${handle}@example.com`, handle);
  return { handle, cookie };
}

/** q1 = { Marta Exemplo nomeou Rui Exemplo, nº 0493 } + { Rui Exemplo é cônjuge de Ana Teste }. */
const q1Right = {
  f0_who: "Marta Exemplo", f0_rel: "nomeou", f0_obj: "Rui Exemplo", f0_num: "0493",
  f1_who: "Ana Teste", f1_rel: "conjuge", f1_obj: "Rui Exemplo",
};

async function answers(handle: string) {
  const { results } = await DB.prepare("SELECT a.accepted, a.facts FROM answer a JOIN player p ON p.user_id = a.user_id WHERE p.handle = ? ORDER BY a.id")
    .bind(handle)
    .all<{ accepted: number; facts: string }>();
  return results;
}

describe("composer form", () => {
  it("works without the script: typed names with a typo, an omitted zero and nº are resolved and judged", async () => {
    const { handle, cookie } = await player();
    const res = await postForm("/responder/q1", cookie, { ...q1Right, f0_who: "marta exenplo", f0_num: "nº 493", f1_obj: "RUI EXEMPLO" });
    expect([res.status, res.headers.get("location")]).toEqual([302, "/correio?enviado=q1"]);
    const rows = await answers(handle);
    expect(rows.map((r) => r.accepted)).toEqual([1]);
    expect(JSON.parse(rows[0].facts)[0].subject).toEqual({ first: "Marta", last: "Exemplo" });

    const mailbox = await (await get("/correio?enviado=q1", cookie)).text();
    expect(mailbox).toContain(`<p class="notice" data-autosave-clear="jogo:composer:${handle}:q1">Resposta enviada à redação.</p>`);
    const forged = await (await get("/correio?enviado=x%22%3E", cookie)).text();
    expect(forged).toContain('<p class="notice">Resposta enviada à redação.</p>');
  });

  it("judges an exact look-alike entry as itself, never as the expected person", async () => {
    const { handle, cookie } = await player();
    const res = await postForm("/responder/q1", cookie, { ...q1Right, f0_obj: "Ruy Exemplo", f1_obj: "Ruy Exemplo" });
    expect(res.status).toBe(302);
    expect((await answers(handle)).map((r) => r.accepted)).toEqual([0]);
  });

  it("re-shows unknown, ambiguous or missing fields beside each field with the typed values, without recording or rate-limiting the attempt", async () => {
    const { handle, cookie } = await player();
    {
      // Número only on rows for facts that have a number; required markers; autosave hook.
      const res = await get("/responder/q1", cookie);
      expect(res.status).toBe(200);
      const html = await res.text();
      // The asking letter is on the form itself, with placeholders filled.
      expect(html).toContain("<summary>Carta de Editor Exemplo: Primeira pauta</summary>");
      expect(html).toContain(`Oi, ${handle}. Bem-vindo à redação.`);
      expect(html).toContain("<legend>Fato 1 — com número</legend>");
      expect(html).toContain("<legend>Fato 2</legend>");
      expect(html).toContain('name="f0_num"');
      expect(html).not.toContain('name="f1_num"');
      expect(html).toContain('<input type="text" id="f0_who" name="f0_who" value="" aria-label="Quem" autocomplete="off" required=""');
      expect(html).toContain(`<form method="post" action="/responder/q1" data-autosave="jogo:composer:${handle}:q1">`);
      expect(html).toContain('<script>(function () {');
    }
    for (let i = 0; i < 7; i++) {
      // answers_per_hour is 5 in the fixture
      const res = await postForm("/responder/q1", cookie, { ...q1Right, f0_obj: "Ruj Exemplo" });
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('value="Ruj Exemplo"');
      expect(html).toContain(
        '<span class="error" id="f0_obj_err">Há mais de um nome parecido: Rui Exemplo, Ruy Exemplo. Escreva o nome como consta na lista ou nos documentos.</span>',
      );
    }
    {
      const res = await postForm("/responder/q1", cookie, { ...q1Right, f0_who: "Joana Exemplo", f0_num: "nº", f1_obj: "Padaria Central", f1_rel: "" });
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('<span class="error" id="f0_who_err">Nome não consta na lista telefônica.</span>');
      expect(html).toContain('<span class="error" id="f0_num_err">Obrigatório.</span>');
      expect(html).toContain('<span class="error" id="f1_obj_err">Não consta na lista telefônica nem nos documentos que você leu.</span>');
      expect(html).toContain('<span class="error" id="f1_rel_err">Obrigatório.</span>');
      expect(html).toContain('value="Padaria Central"');
    }
    expect(await answers(handle)).toEqual([]);
    expect((await postForm("/responder/q1", cookie, q1Right)).status).toBe(302);
  });

  it("accepts a middle surname left out", async () => {
    const { handle, cookie } = await player();
    // Beatriz Quaresma Teste is a red herring: resolved, then judged wrong.
    const res = await postForm("/responder/q1", cookie, { ...q1Right, f1_who: "Beatriz Teste" });
    expect([res.status, res.headers.get("location")]).toEqual([302, "/correio?enviado=q1"]);
    const [row] = await answers(handle);
    expect(JSON.parse(row.facts)[1].subject).toEqual({ first: "Beatriz", last: "Quaresma Teste" });
  });
});
