import { cpSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompileError, compile } from "../../compiler/compile.ts";

const FIXTURE = "fixtures/content";

/** Copies the good fixture, applies `mutate`, compiles, returns the problems. */
function problemsAfter(mutate: (dir: string) => void): string[] {
  const dir = mkdtempSync(join(tmpdir(), "content-"));
  cpSync(FIXTURE, dir, { recursive: true });
  mutate(dir);
  try {
    compile(dir, 1);
  } catch (e) {
    if (e instanceof CompileError) return e.problems;
    throw e;
  }
  return [];
}

const edit = (dir: string, file: string, from: string, to: string) => {
  const p = join(dir, file);
  const text = readFileSync(p, "utf8");
  if (!text.includes(from)) throw new Error(`test setup: "${from}" not in ${file}`);
  writeFileSync(p, text.replace(from, to));
};

describe("compile (good fixture)", () => {
  const files = compile(FIXTURE, 7);
  const json = (path: string) => JSON.parse(files.get(`content/v7/${path}`)!);

  it("points content/current at the version", () => {
    expect(files.get("content/current")).toBe("v7");
  });

  it("indexes normalized field values and aliases per engine", () => {
    const diario = json("index/diario.json");
    expect(diario["marta exemplo"]).toEqual(["ato-0101", "ato-0202", "ato-0493"]);
    expect(diario["0493 93"]).toEqual(["ato-0493"]);
    expect(diario["portaria 0493"]).toEqual(["ato-0493"]);
    expect(diario["merenda exemplo ltda"]).toEqual(["contrato-12"]);
    expect(json("index/forum.json")["festa"]).toEqual(["forum-casamento", "forum-merenda"]);
  });

  it("keeps intranet docs out of every index and lists them under their gate", () => {
    const allIds = [...Object.values(json("index/diario.json")), ...Object.values(json("index/forum.json"))].flat();
    expect(allIds).not.toContain("pagamento-1250");
    expect(json("graph.json").gates[0].docs.map((d: { id: string }) => d.id).sort()).toEqual(["memorando-interno", "pagamento-1250"]);
  });

  it("records a sha256 for every other file in the manifest", () => {
    const manifest = json("manifest.json");
    expect(manifest.version).toBe(7);
    expect(Object.keys(manifest.files).sort()).toEqual(
      [...files.keys()]
        .filter((k) => k.startsWith("content/v7/") && !k.endsWith("manifest.json"))
        .map((k) => k.slice("content/v7/".length))
        .sort(),
    );
    expect(manifest.files["docs/ato-0493.json"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("emits docs without source-only fields", () => {
    expect(json("docs/ato-0493.json")).toEqual({
      id: "ato-0493",
      engine: "diario",
      title: "Portaria nº 0493/93",
      author: "Gabinete da Prefeita",
      date: "1993-03-14",
      body: "A PREFEITA DE VILA EXEMPLO, Marta Exemplo, no uso de suas atribuições,\nRESOLVE nomear Rui Exemplo para o cargo de Secretário de Compras.\n\nPortaria nº 0493/93.",
      collect: { numbers: ["0493"], orgs: [] },
    });
  });
});

describe("compile checks (broken fixtures)", () => {
  it("rejects duplicate ids", () => {
    expect(problemsAfter((d) => edit(d, "docs/diario/ato-0101.md", "id: ato-0101", "id: ato-0202"))).toContain('duplicate doc id "ato-0202"');
  });

  it("rejects unresolved references", () => {
    const problems = problemsAfter((d) => {
      edit(d, "graph.yaml", "relation: nomeou", "relation: demitiu");
      edit(d, "graph.yaml", "accept_mail: carta-02", "accept_mail: carta-99");
      edit(d, "docs/forum/casamento.md", "engine: forum", "engine: jornal");
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'fact f-nomeacao: unknown relation "demitiu"',
        'question q1: unknown accept_mail "carta-99"',
        'docs/forum/casamento.md: unknown engine "jornal"',
      ]),
    );
  });

  it("rejects fact people missing from the phonebook", () => {
    expect(problemsAfter((d) => edit(d, "graph.yaml", '{ first: "Rui", last: "Exemplo" }\n    number', '{ first: "Rui", last: "Inventado" }\n    number'))).toContain(
      'fact f-nomeacao: object "Rui Inventado" is not in the phonebook',
    );
  });

  it("rejects question facts without evidence", () => {
    expect(problemsAfter((d) => edit(d, "docs/forum/casamento.md", "evidence: [f-conjuge]\n", ""))).toContain(
      "fact f-conjuge: used by a question but no doc lists it as evidence",
    );
  });

  it("rejects unknown placeholders", () => {
    expect(problemsAfter((d) => appendFileSync(join(d, "mail/recusa.md"), "\n{{gate:cofre}} {{player.nome}}\n"))).toEqual([
      "mail/recusa.md: unknown placeholder {{gate:cofre}}",
      "mail/recusa.md: unknown placeholder {{player.nome}}",
    ]);
  });

  it("rejects forbidden terms as whole normalized words", () => {
    expect(problemsAfter((d) => edit(d, "mail/carta-03.md", "A matéria sai amanhã.", "Mande pela Internet."))).toEqual([
      'mail/carta-03.md: contains forbidden term "internet"',
    ]);
    // "webster" contains "web" but is not the word "web".
    expect(problemsAfter((d) => edit(d, "mail/carta-03.md", "A matéria sai amanhã.", "Ligue para o Webster."))).toEqual([]);
  });
});
