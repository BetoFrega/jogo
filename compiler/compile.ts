// Compiles a content source directory into the R2 bundle described in
// docs/content-format.md. Pure with respect to output: returns the files to
// write (path -> text); the CLI in scripts/compile.ts writes them.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { normalize } from "../src/content/normalize.ts";
import { similarPhonebookPairs } from "../src/game/resolve.ts";
import {
  GATE_ENGINE_PREFIX,
  type Doc,
  type Engine,
  type Fact,
  type GateDef,
  type GateListing,
  type Graph,
  type Index,
  type Mail,
  type Manifest,
  type Org,
  type PersonRef,
  type PhonebookEntry,
  type Question,
  type Relation,
} from "../src/content/types.ts";

export class CompileError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`content check failed (${problems.length}):\n- ${problems.join("\n- ")}`);
    this.problems = problems;
  }
}

const ID_RE = /^[a-z0-9-]+$/;
const PLACEHOLDER_RE = /\{\{\s*([^}]*?)\s*\}\}/g;

interface SourceDoc extends Doc {
  fields: Record<string, string[]>;
  aliases: Record<string, string[]>;
  evidence: string[];
  file: string;
}

interface SourceMail extends Mail {
  file: string;
}

/**
 * `warn` receives non-fatal notes for the content author (the CLI prints them);
 * they never fail the build.
 */
export function compile(sourceDir: string, version: number, warn: (message: string) => void = () => {}): Map<string, string> {
  const problems: string[] = [];
  const fail = (msg: string) => problems.push(msg);

  const manifestSrc = readYaml(join(sourceDir, "manifest.yaml")) as Omit<Manifest, "version" | "files">;
  const phonebook = (readYaml(join(sourceDir, "phonebook.yaml")) ?? []) as PhonebookEntry[];
  const graphSrc = (readYaml(join(sourceDir, "graph.yaml")) ?? {}) as {
    orgs?: Org[];
    facts?: Fact[];
    questions?: Question[];
  };
  const words = readLines(join(sourceDir, "words.txt"));
  const forbiddenPath = join(sourceDir, "forbidden.txt");
  const forbidden = existsSync(forbiddenPath) ? readLines(forbiddenPath).map(normalize).filter(Boolean) : [];

  const engines: Engine[] = manifestSrc.engines ?? [];
  const gates: GateDef[] = manifestSrc.gates ?? [];
  const relations: Relation[] = manifestSrc.relations ?? [];
  const orgs = graphSrc.orgs ?? [];
  const facts = graphSrc.facts ?? [];
  const questions = graphSrc.questions ?? [];

  const docs = listMarkdown(join(sourceDir, "docs")).map((f) => parseDoc(sourceDir, f));
  const mails = listMarkdown(join(sourceDir, "mail")).map((f) => parseMail(sourceDir, f));

  // --- unique ids ---
  checkUnique("engine", engines.map((e) => e.id), fail);
  checkUnique("gate", gates.map((g) => g.id), fail);
  checkUnique("relation", relations.map((r) => r.id), fail);
  checkUnique("org", orgs.map((o) => o.id), fail);
  checkUnique("fact", facts.map((f) => f.id), fail);
  checkUnique("question", questions.map((q) => q.id), fail);
  checkUnique("doc", docs.map((d) => d.id), fail);
  checkUnique("mail", mails.map((m) => m.id), fail);
  checkUnique(
    "phonebook person",
    phonebook.map((p) => personKey(p)),
    fail,
  );
  for (const d of docs) if (!ID_RE.test(d.id ?? "")) fail(`${d.file}: doc id "${d.id}" must match [a-z0-9-]`);
  for (const m of mails) if (!ID_RE.test(m.id ?? "")) fail(`${m.file}: mail id "${m.id}" must match [a-z0-9-]`);
  if (words.length === 0) fail("words.txt is empty");
  if (!Array.isArray(manifestSrc.reply_delay_seconds) || manifestSrc.reply_delay_seconds.length !== 2)
    fail("manifest: reply_delay_seconds must be [min, max]");
  if (!(manifestSrc.answers_per_hour > 0)) fail("manifest: answers_per_hour must be > 0");

  const engineById = new Map(engines.map((e) => [e.id, e]));
  const gateIds = new Set(gates.map((g) => g.id));
  const relationIds = new Set(relations.map((r) => r.id));
  const orgIds = new Set(orgs.map((o) => o.id));
  const factIds = new Set(facts.map((f) => f.id));
  const mailIds = new Set(mails.map((m) => m.id));
  const questionIds = new Set(questions.map((q) => q.id));
  const people = new Set(phonebook.map(personKey));

  for (const g of gates) {
    const format = g.format ?? "";
    const wellFormed = /^(WORD|N|[^A-Za-z0-9])+$/.test(format) && /WORD|N/.test(format);
    if (!wellFormed) fail(`gate ${g.id}: format "${format}" must be made of WORD, N and separators`);
  }

  // --- references ---
  if (!mailIds.has(manifestSrc.start_mail)) fail(`manifest: start_mail "${manifestSrc.start_mail}" is not a mail`);
  for (const f of facts) {
    if (!relationIds.has(f.relation)) fail(`fact ${f.id}: unknown relation "${f.relation}"`);
    if (!people.has(personKey(f.subject))) fail(`fact ${f.id}: subject ${fmtPerson(f.subject)} is not in the phonebook`);
    if ("org" in f.object) {
      if (!orgIds.has(f.object.org)) fail(`fact ${f.id}: unknown org "${f.object.org}"`);
    } else if (!people.has(personKey(f.object))) {
      fail(`fact ${f.id}: object ${fmtPerson(f.object)} is not in the phonebook`);
    }
  }
  for (const q of questions) {
    if (!mailIds.has(q.mail)) fail(`question ${q.id}: unknown mail "${q.mail}"`);
    if (!mailIds.has(q.accept_mail)) fail(`question ${q.id}: unknown accept_mail "${q.accept_mail}"`);
    if (!mailIds.has(q.reject_mail)) fail(`question ${q.id}: unknown reject_mail "${q.reject_mail}"`);
    if (!q.facts?.length) fail(`question ${q.id}: needs at least one fact`);
    for (const fid of q.facts ?? []) if (!factIds.has(fid)) fail(`question ${q.id}: unknown fact "${fid}"`);
  }
  for (const m of mails) if (m.question && !questionIds.has(m.question)) fail(`${m.file}: unknown question "${m.question}"`);

  for (const d of docs) {
    const gateId = d.engine?.startsWith(GATE_ENGINE_PREFIX) ? d.engine.slice(GATE_ENGINE_PREFIX.length) : null;
    if (gateId !== null) {
      if (!gateIds.has(gateId)) fail(`${d.file}: unknown gate "${gateId}"`);
      if (Object.keys(d.fields).length || Object.keys(d.aliases).length)
        fail(`${d.file}: intranet docs are not searchable; remove fields/aliases`);
    } else {
      const engine = engineById.get(d.engine);
      if (!engine) fail(`${d.file}: unknown engine "${d.engine}"`);
      else {
        for (const key of Object.keys(d.fields))
          if (!engine.fields.includes(key)) fail(`${d.file}: field "${key}" is not indexed by engine ${engine.id}`);
        const values = new Set(Object.values(d.fields).flat());
        for (const key of Object.keys(d.aliases))
          if (!values.has(key)) fail(`${d.file}: alias key "${key}" is not one of the doc's field values`);
      }
    }
    for (const o of d.collect.orgs) if (!orgIds.has(o)) fail(`${d.file}: collects unknown org "${o}"`);
    for (const e of d.evidence) if (!factIds.has(e)) fail(`${d.file}: evidence references unknown fact "${e}"`);
  }

  // --- solvability ---
  const evidenced = new Set(docs.flatMap((d) => d.evidence));
  const collectableNumbers = new Set(docs.flatMap((d) => d.collect.numbers.map(normalize)));
  const collectableOrgs = new Set(docs.flatMap((d) => d.collect.orgs));
  const factById = new Map(facts.map((f) => [f.id, f]));
  for (const fid of new Set(questions.flatMap((q) => q.facts ?? []))) {
    const f = factById.get(fid);
    if (!f) continue;
    if (!evidenced.has(fid)) fail(`fact ${fid}: used by a question but no doc lists it as evidence`);
    if (f.number !== undefined && !collectableNumbers.has(normalize(String(f.number))))
      fail(`fact ${fid}: number "${f.number}" is not collected by any doc`);
    if ("org" in f.object && !collectableOrgs.has(f.object.org))
      fail(`fact ${fid}: org "${f.object.org}" is not collected by any doc`);
  }

  // --- placeholders ---
  const usedGates = new Set<string>();
  for (const item of [...docs, ...mails]) {
    for (const m of item.body.matchAll(PLACEHOLDER_RE)) {
      const name = m[1];
      if (name === "player.handle") continue;
      if (name.startsWith("gate:") && gateIds.has(name.slice(5))) {
        usedGates.add(name.slice(5));
        continue;
      }
      fail(`${item.file}: unknown placeholder {{${name}}}`);
    }
  }
  for (const g of gates)
    if (docs.some((d) => d.engine === GATE_ENGINE_PREFIX + g.id) && !usedGates.has(g.id))
      fail(`gate ${g.id}: has intranet docs but no {{gate:${g.id}}} placeholder reveals its password`);

  // --- forbidden terms ---
  if (forbidden.length) {
    const texts: [string, string][] = [
      ["manifest.yaml", JSON.stringify(manifestSrc)],
      ["graph.yaml", JSON.stringify(graphSrc)],
      ["phonebook.yaml", JSON.stringify(phonebook)],
      ...docs.map((d): [string, string] => [d.file, [d.title, d.author, d.date, d.body, JSON.stringify(d.fields), JSON.stringify(d.aliases)].join(" ")]),
      ...mails.map((m): [string, string] => [m.file, [m.from, m.subject, m.body].join(" ")]),
    ];
    for (const [file, text] of texts) {
      const hay = ` ${normalize(text)} `;
      for (const term of forbidden) if (hay.includes(` ${term} `)) fail(`${file}: contains forbidden term "${term}"`);
    }
  }

  // --- indexes ---
  const indexes: Record<string, Index> = {};
  for (const e of engines) indexes[e.id] = {};
  for (const d of docs) {
    const index = indexes[d.engine];
    if (!index) continue;
    const keys = new Set<string>();
    for (const values of Object.values(d.fields)) for (const v of values) keys.add(normalize(String(v)));
    for (const aliases of Object.values(d.aliases)) for (const a of aliases) keys.add(normalize(String(a)));
    for (const k of keys) {
      if (!k) {
        fail(`${d.file}: a field value or alias normalizes to an empty key`);
        continue;
      }
      (index[k] ??= []).push(d.id);
    }
  }

  if (problems.length) throw new CompileError(problems);

  // --- warnings: names a typo can't tell apart (the composer asks the player to disambiguate) ---
  for (const [a, b] of similarPhonebookPairs(phonebook))
    warn(`phonebook: "${a}" and "${b}" are within typo tolerance; a typo near either is refused as ambiguous`);

  // --- output ---
  const out = new Map<string, string>();
  const prefix = `content/v${version}/`;
  const put = (path: string, value: unknown) => out.set(prefix + path, JSON.stringify(value));

  for (const [id, index] of Object.entries(indexes)) put(`index/${id}.json`, index);
  const gateListings: GateListing[] = gates.map((g) => ({
    ...g,
    docs: docs
      .filter((d) => d.engine === GATE_ENGINE_PREFIX + g.id)
      .map((d) => ({ id: d.id, title: d.title, date: d.date })),
  }));
  const graph: Graph = {
    relations,
    orgs,
    facts: facts.map((f) => (f.number === undefined ? f : { ...f, number: String(f.number) })),
    questions,
    phonebook,
    gates: gateListings,
    start_mail: manifestSrc.start_mail,
    words,
  };
  put("graph.json", graph);
  for (const d of docs) {
    const doc: Doc = { id: d.id, engine: d.engine, title: d.title, author: d.author, date: d.date, body: d.body, collect: d.collect };
    put(`docs/${d.id}.json`, doc);
  }
  for (const m of mails) {
    const mail: Mail = { id: m.id, from: m.from, subject: m.subject, body: m.body, ...(m.question ? { question: m.question } : {}) };
    put(`mail/${m.id}.json`, mail);
  }
  const files: Record<string, string> = {};
  for (const [path, text] of out) files[path.slice(prefix.length)] = createHash("sha256").update(text).digest("hex");
  const manifest: Manifest = { ...manifestSrc, version, files };
  put("manifest.json", manifest);
  out.set("content/current", `v${version}`);
  return out;
}

function readYaml(path: string): unknown {
  if (!existsSync(path)) throw new CompileError([`missing ${path}`]);
  return parseYaml(readFileSync(path, "utf8"));
}

function readLines(path: string): string[] {
  if (!existsSync(path)) throw new CompileError([`missing ${path}`]);
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listMarkdown(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function splitFrontmatter(sourceDir: string, path: string): { file: string; meta: Record<string, any>; body: string } {
  const file = relative(sourceDir, path);
  const text = readFileSync(path, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new CompileError([`${file}: missing --- frontmatter ---`]);
  return { file, meta: (parseYaml(m[1]) ?? {}) as Record<string, any>, body: m[2].trim() };
}

function parseDoc(sourceDir: string, path: string): SourceDoc {
  const { file, meta, body } = splitFrontmatter(sourceDir, path);
  const strList = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const fields: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(meta.fields ?? {})) fields[k] = strList(v);
  const aliases: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(meta.aliases ?? {})) aliases[k] = strList(v);
  return {
    file,
    id: meta.id,
    engine: meta.engine,
    title: String(meta.title ?? ""),
    author: String(meta.author ?? ""),
    date: String(meta.date ?? ""),
    body,
    fields,
    aliases,
    collect: { numbers: strList(meta.collect?.numbers), orgs: strList(meta.collect?.orgs) },
    evidence: strList(meta.evidence),
  };
}

function parseMail(sourceDir: string, path: string): SourceMail {
  const { file, meta, body } = splitFrontmatter(sourceDir, path);
  return {
    file,
    id: meta.id,
    from: String(meta.from ?? ""),
    subject: String(meta.subject ?? ""),
    ...(meta.question ? { question: String(meta.question) } : {}),
    body,
  };
}

function checkUnique(kind: string, ids: string[], fail: (m: string) => void) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(`duplicate ${kind} id "${id}"`);
    seen.add(id);
  }
}

function personKey(p: PersonRef): string {
  return `${normalize(p.first ?? "")}|${normalize(p.last ?? "")}`;
}

function fmtPerson(p: PersonRef): string {
  return `"${p.first} ${p.last}"`;
}
