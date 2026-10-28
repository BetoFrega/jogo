// Shapes of the published bundle (content/v<N>/...). Shared by compiler and Worker.

export interface Engine {
  id: string;
  name: string;
  fields: string[];
  max_results: number;
  help?: string; // Markdown shown on the search page before the first query
}

export interface GateDef {
  id: string;
  name: string;
  format: string;
}

export interface Relation {
  id: string;
  label: string;
  symmetric?: boolean;
}

export interface Manifest {
  title: string;
  engines: Engine[];
  gates: GateDef[];
  relations: Relation[];
  reply_delay_seconds: [number, number];
  answers_per_hour: number;
  start_mail: string;
  version: number;
  files: Record<string, string>;
}

export interface PersonRef {
  first: string;
  last: string;
}

export type FactObject = PersonRef | { org: string };

export interface Fact {
  id: string;
  subject: PersonRef;
  relation: string;
  object: FactObject;
  number?: string;
}

/** A field the player fills in a question block. */
export type BlockField = "who" | "rel" | "obj" | "num";
export const BLOCK_FIELDS: readonly BlockField[] = ["who", "rel", "obj", "num"];

/** One asked fact: the parts not in `fields` are given by the `ask` text and taken from the fact when judging. */
export interface Block {
  ask: string;
  fact: string;
  /** Compiled: always explicit, in BLOCK_FIELDS order. */
  fields: BlockField[];
}

export interface Question {
  id: string;
  mail: string;
  blocks: Block[];
  accept_mail: string;
  reject_mail: string;
}

export interface PhonebookEntry {
  first: string;
  last: string;
  address?: string;
  phone?: string;
}

export interface Org {
  id: string;
  name: string;
}

export interface GateListing extends GateDef {
  /** Intranet docs listed once the gate is unlocked. */
  docs: { id: string; title: string; date: string }[];
}

export interface Graph {
  relations: Relation[];
  orgs: Org[];
  facts: Fact[];
  questions: Question[];
  phonebook: PhonebookEntry[];
  gates: GateListing[];
  start_mail: string;
  /** Word list for gate passwords (words.txt). */
  words: string[];
  /** Title and engine of every doc, so lists (the Histórico) need no per-doc fetch. */
  doc_titles: Record<string, { title: string; engine: string }>;
}

export type Index = Record<string, string[]>;

export interface Collect {
  numbers: string[];
  orgs: string[];
}

export interface Doc {
  id: string;
  engine: string;
  title: string;
  author: string;
  date: string;
  body: string;
  collect: Collect;
}

export interface Mail {
  id: string;
  from: string;
  subject: string;
  question?: string;
  body: string;
}

export const GATE_ENGINE_PREFIX = "gate:";
