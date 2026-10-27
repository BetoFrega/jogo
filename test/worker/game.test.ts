import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { getDoc, loadContent, type Content } from "../../src/content/store.ts";
import type { ComposedFact } from "../../src/game/answer.ts";
import { search } from "../../src/game/search.ts";
import {
  collectedTerms,
  createPlayer,
  recordDocOpened,
  submitAnswer,
  visibleMail,
} from "../../src/game/state.ts";

const { DB, CONTENT } = env as unknown as { DB: D1Database; CONTENT: R2Bucket };
const T0 = Date.UTC(1994, 2, 1);
let content: Content;
let userId: string;
let n = 0;

beforeEach(async () => {
  content = await loadContent(CONTENT);
  userId = `user-${++n}`;
  await DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, '', ?, 1, 0, 0)`)
    .bind(userId, `${userId}@example.com`)
    .run();
  expect(await createPlayer(DB, content, userId, `Reporter${n}`, T0)).toBe("created");
});

const mailIds = async (now: number) => (await visibleMail(DB, userId, now)).map((m) => m.mail_id);

async function openDocs(...ids: string[]) {
  for (const id of ids) await recordDocOpened(DB, userId, (await getDoc(CONTENT, content, id))!, T0);
}

const q1Right: ComposedFact[] = [
  { subject: { first: "Marta", last: "Exemplo" }, relation: "nomeou", object: { first: "Rui", last: "Exemplo" }, number: "0493" },
  { subject: { first: "Ana", last: "Teste" }, relation: "conjuge", object: { first: "Rui", last: "Exemplo" } },
];

describe("search over the published fixture", () => {
  it("returns exact normalized matches only", () => {
    const diario = content.manifest.engines.find((e) => e.id === "diario")!;
    expect(search(diario, content.indexes.diario, "PORTARIA 0493")).toEqual({ kind: "results", docIds: ["ato-0493"] });
    expect(search(diario, content.indexes.diario, "Merenda Exemplo Ltda")).toEqual({ kind: "results", docIds: ["contrato-12"] });
    expect(search(diario, content.indexes.diario, "Merenda")).toEqual({ kind: "results", docIds: [] });
  });

  it("reports the limit error without a count when matches exceed max_results", () => {
    const diario = content.manifest.engines.find((e) => e.id === "diario")!;
    expect(search(diario, content.indexes.diario, "marta exemplo")).toEqual({ kind: "too_many" });
    expect(search(diario, content.indexes.diario, "rui exemplo")).toEqual({ kind: "results", docIds: ["ato-0493", "contrato-12"] });
  });
});

describe("handle and first letter", () => {
  it("delivers start_mail immediately and refuses a taken handle", async () => {
    expect(await mailIds(T0)).toEqual(["carta-01"]);
    expect(await createPlayer(DB, content, "someone-else", `reporter${n}`, T0)).toBe("taken");
  });
});

describe("opening docs", () => {
  it("collects the doc's numbers and orgs", async () => {
    await openDocs("ato-0493", "contrato-12");
    expect(await collectedTerms(DB, userId)).toEqual({ numbers: ["0493"], orgs: ["org-merenda"] });
  });
});

describe("answers", () => {
  it("delivers the accept mail only after the random delay", async () => {
    await openDocs("ato-0493");
    expect(await submitAnswer(DB, content, userId, "q1", q1Right, T0, () => 0.99)).toEqual({ kind: "submitted" });
    // fixture reply_delay_seconds is [2, 4]; random 0.99 -> 4 s
    expect(await mailIds(T0 + 3999)).toEqual(["carta-01"]);
    expect(await mailIds(T0 + 4000)).toEqual(["carta-02", "carta-01"]);
  });

  it("delivers the reject mail for a wrong batch and lets the player retry", async () => {
    await openDocs("ato-0493");
    const wrong = [q1Right[0], { ...q1Right[1], object: { first: "Beto", last: "Teste" } }];
    expect(await submitAnswer(DB, content, userId, "q1", wrong, T0, () => 0)).toEqual({ kind: "submitted" });
    expect(await submitAnswer(DB, content, userId, "q1", q1Right, T0 + 1000, () => 0)).toEqual({ kind: "not_open", status: "awaiting_reply" });
    expect(await mailIds(T0 + 2000)).toEqual(["recusa", "carta-01"]);
    expect(await submitAnswer(DB, content, userId, "q1", q1Right, T0 + 2000, () => 0)).toEqual({ kind: "submitted" });
    expect(await mailIds(T0 + 4000)).toEqual(["carta-02", "recusa", "carta-01"]);
    expect(await submitAnswer(DB, content, userId, "q1", q1Right, T0 + 5000, () => 0)).toEqual({ kind: "not_open", status: "solved" });
  });

  it("refuses numbers or orgs the player has not collected", async () => {
    expect(await submitAnswer(DB, content, userId, "q1", q1Right, T0, () => 0)).toEqual({ kind: "invalid" });
    expect(await mailIds(T0 + 10_000)).toEqual(["carta-01"]);
  });

  it("refuses a question whose letter has not arrived", async () => {
    expect(await submitAnswer(DB, content, userId, "q2", [], T0, () => 0)).toEqual({ kind: "not_open", status: "unavailable" });
  });

  it("rate-limits answers per player per hour", async () => {
    await openDocs("ato-0493");
    const wrong = [q1Right[0], q1Right[0]];
    let t = T0;
    for (let i = 0; i < content.manifest.answers_per_hour; i++) {
      expect(await submitAnswer(DB, content, userId, "q1", wrong, t, () => 0)).toEqual({ kind: "submitted" });
      t += 5000; // past the reply delay
    }
    expect(await submitAnswer(DB, content, userId, "q1", q1Right, t, () => 0)).toEqual({ kind: "rate_limited" });
    expect(await submitAnswer(DB, content, userId, "q1", q1Right, T0 + 60 * 60 * 1000 + 1, () => 0)).toEqual({ kind: "submitted" });
  });
});
