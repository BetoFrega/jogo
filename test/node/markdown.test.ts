import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/game/markdown.ts";
import { renderPlaceholders } from "../../src/game/render.ts";

describe("renderMarkdown", () => {
  it("splits paragraphs on blank lines and keeps single newlines as <br>", () => {
    expect(renderMarkdown("Linha um\nlinha dois\n\n\nOutro parágrafo.\r\n")).toBe("<p>Linha um<br>linha dois</p><p>Outro parágrafo.</p>");
  });

  it("renders bold and italic inline, leaving lone asterisks alone", () => {
    expect(renderMarkdown("**CONTRATADA:** Merenda *Ltda.* e 2 * 3 = 6")).toBe(
      "<p><strong>CONTRATADA:</strong> Merenda <em>Ltda.</em> e 2 * 3 = 6</p>",
    );
  });

  it("renders headings, rules and blockquotes", () => {
    expect(renderMarkdown("# Diário\n## Atos\n### Portaria\ntexto\n---\n> citada\n> **duas**\n>\n> três\nfim")).toBe(
      "<h1>Diário</h1><h2>Atos</h2><h3>Portaria</h3><p>texto</p><hr>" +
        "<blockquote><p>citada<br><strong>duas</strong></p><p>três</p></blockquote><p>fim</p>",
    );
  });

  it("renders a GFM table with header, separator and rows", () => {
    expect(renderMarkdown("Antes\n| Item | Valor |\n|------|------:|\n| *Merenda* | 4.800 |\n| Leite |\n\nDepois")).toBe(
      "<p>Antes</p><table><thead><tr><th>Item</th><th>Valor</th></tr></thead>" +
        "<tbody><tr><td><em>Merenda</em></td><td>4.800</td></tr><tr><td>Leite</td><td></td></tr></tbody></table><p>Depois</p>",
    );
  });

  it("keeps a pipe line without a separator as plain text", () => {
    expect(renderMarkdown("a | b\nc | d")).toBe("<p>a | b<br>c | d</p>");
  });

  it("escapes raw HTML instead of injecting it", () => {
    expect(renderMarkdown('<script>alert("x")</script> & \'y\'\n> <b>q</b>')).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;</p><blockquote><p>&lt;b&gt;q&lt;/b&gt;</p></blockquote>",
    );
  });

  it("escapes a malicious handle substituted into the body", async () => {
    const body = await renderPlaceholders("Oi, **{{player.handle}}**.", '<img src=x onerror="alert(1)">', async () => "");
    expect(renderMarkdown(body)).toBe("<p>Oi, <strong>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</strong>.</p>");
  });
});
