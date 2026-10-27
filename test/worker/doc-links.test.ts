import { describe, expect, it } from "vitest";
import { get, newPlayer } from "./players.ts";

async function searchLink(cookie: string): Promise<string> {
  const html = await (await get("/busca/diario?q=portaria%200493", cookie)).text();
  return html.match(/href="(\/doc\/ato-0493\?s=[A-Za-z0-9_-]{16})"/)![1];
}

describe("signed doc links", () => {
  it("open with this player's link and 404 exactly like an unknown id otherwise", async () => {
    const alice = await newPlayer("alice@example.com", "alice");
    const bob = await newPlayer("bob@example.com", "bob");
    const aliceLink = await searchLink(alice);

    const ok = await get(aliceLink, alice);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("RESOLVE nomear Rui Exemplo");

    const unknown = await get("/doc/nao-existe", alice);
    const unknownBody = await unknown.text();
    expect(unknown.status).toBe(404);
    for (const [path, cookie] of [
      ["/doc/ato-0493", alice], // no signature
      ["/doc/ato-0493?s=AAAAAAAAAAAAAAAA", alice], // forged
      [aliceLink, bob], // another player's link
      [aliceLink.replace("ato-0493", "ato-0101"), alice], // signature for a different doc
    ]) {
      const res = await get(path, cookie);
      expect([path, res.status, await res.text()]).toEqual([path, 404, unknownBody]);
    }
  });
});

describe("doc body", () => {
  it("is rendered from Markdown inside the paper", async () => {
    const carol = await newPlayer("carol@example.com", "carol");
    const html = await (await get("/busca/diario?q=Merenda%20Exemplo%20Ltda", carol)).text();
    const link = html.match(/href="(\/doc\/contrato-12\?s=[A-Za-z0-9_-]{16})"/)![1];
    const page = await (await get(link, carol)).text();
    expect(page).toContain(
      '<div class="paper"><p><strong>CONTRATANTE:</strong> Prefeitura de Vila Exemplo. <strong>CONTRATADA:</strong> Merenda Exemplo Ltda.<br>' +
        "OBJETO: fornecimento de merenda escolar. Assina pela Secretaria de Compras:<br>Rui Exemplo.</p>" +
        "<table><thead><tr><th>Item</th><th>Quantidade</th><th>Valor</th></tr></thead>" +
        "<tbody><tr><td>Merenda escolar</td><td>1.200</td><td>Cr$ 4.800.000</td></tr></tbody></table>" +
        "<blockquote><p><em>Publicado por ordem da Prefeita.</em></p></blockquote><hr></div>",
    );
  });
});
