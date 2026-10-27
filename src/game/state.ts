// Player state in D1. Every function takes `now` (epoch ms) so time-dependent
// rules (mail delay, answer rate limit) are testable.
import type { Content } from "../content/store.ts";
import type { Doc } from "../content/types.ts";
import { isAccepted, type ComposedFact } from "./answer.ts";

const HOUR_MS = 60 * 60 * 1000;
export const HANDLE_RE = /^[A-Za-z0-9_.-]{3,16}$/;

// ---------- player ----------

export async function getHandle(db: D1Database, userId: string): Promise<string | null> {
  const row = await db.prepare("SELECT handle FROM player WHERE user_id = ?").bind(userId).first<{ handle: string }>();
  return row?.handle ?? null;
}

export type CreatePlayerResult = "created" | "invalid" | "taken";

/** Creates the in-fiction identity and delivers the first letter immediately. */
export async function createPlayer(
  db: D1Database,
  content: Content,
  userId: string,
  handle: string,
  now: number,
): Promise<CreatePlayerResult> {
  if (!HANDLE_RE.test(handle)) return "invalid";
  try {
    await db.batch([
      db.prepare("INSERT INTO player (user_id, handle, created_at) VALUES (?, ?, ?)").bind(userId, handle, now),
      db.prepare("INSERT INTO mail (user_id, mail_id, respond_at) VALUES (?, ?, ?)").bind(userId, content.graph.start_mail, now),
    ]);
    return "created";
  } catch (e) {
    if (String(e).includes("UNIQUE")) return "taken";
    throw e;
  }
}

// ---------- mail ----------

export interface MailRow {
  id: number;
  mail_id: string;
  respond_at: number;
  read_at: number | null;
}

export async function visibleMail(db: D1Database, userId: string, now: number): Promise<MailRow[]> {
  const { results } = await db
    .prepare("SELECT id, mail_id, respond_at, read_at FROM mail WHERE user_id = ? AND respond_at <= ? ORDER BY respond_at DESC, id DESC")
    .bind(userId, now)
    .all<MailRow>();
  return results;
}

export async function openMail(db: D1Database, userId: string, rowId: number, now: number): Promise<MailRow | null> {
  const row = await db
    .prepare("SELECT id, mail_id, respond_at, read_at FROM mail WHERE id = ? AND user_id = ? AND respond_at <= ?")
    .bind(rowId, userId, now)
    .first<MailRow>();
  if (row && row.read_at === null) {
    await db.prepare("UPDATE mail SET read_at = ? WHERE id = ?").bind(now, rowId).run();
  }
  return row;
}

export async function hasPendingReply(db: D1Database, userId: string, now: number): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS x FROM mail WHERE user_id = ? AND respond_at > ? LIMIT 1").bind(userId, now).first();
  return row !== null;
}

// ---------- docs and collected terms ----------

export async function recordDocOpened(db: D1Database, userId: string, doc: Doc, now: number): Promise<void> {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO seen_doc (user_id, doc_id, seen_at) VALUES (?, ?, ?)").bind(userId, doc.id, now),
    ...doc.collect.numbers.map((n) =>
      db.prepare("INSERT OR IGNORE INTO collected_term (user_id, kind, value, collected_at) VALUES (?, 'number', ?, ?)").bind(userId, n, now),
    ),
    ...doc.collect.orgs.map((o) =>
      db.prepare("INSERT OR IGNORE INTO collected_term (user_id, kind, value, collected_at) VALUES (?, 'org', ?, ?)").bind(userId, o, now),
    ),
  ]);
}

export async function collectedTerms(db: D1Database, userId: string): Promise<{ numbers: string[]; orgs: string[] }> {
  const { results } = await db
    .prepare("SELECT kind, value FROM collected_term WHERE user_id = ? ORDER BY value")
    .bind(userId)
    .all<{ kind: "number" | "org"; value: string }>();
  return {
    numbers: results.filter((r) => r.kind === "number").map((r) => r.value),
    orgs: results.filter((r) => r.kind === "org").map((r) => r.value),
  };
}

// ---------- gates ----------

export async function isGateUnlocked(db: D1Database, userId: string, gateId: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 AS x FROM gate_unlock WHERE user_id = ? AND gate_id = ?").bind(userId, gateId).first()) !== null;
}

export async function unlockGate(db: D1Database, userId: string, gateId: string, now: number): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO gate_unlock (user_id, gate_id, unlocked_at) VALUES (?, ?, ?)").bind(userId, gateId, now).run();
}

// ---------- answers ----------

export type QuestionStatus = "open" | "solved" | "awaiting_reply" | "unavailable";

/** Whether the player may answer `questionId` right now (rate limit aside). */
export async function questionStatus(db: D1Database, content: Content, userId: string, questionId: string, now: number): Promise<QuestionStatus> {
  const q = content.graph.questions.find((x) => x.id === questionId);
  if (!q) return "unavailable";
  const asked = await db
    .prepare("SELECT 1 AS x FROM mail WHERE user_id = ? AND mail_id = ? AND respond_at <= ?")
    .bind(userId, q.mail, now)
    .first();
  if (!asked) return "unavailable";
  const solved = await db
    .prepare("SELECT 1 AS x FROM answer WHERE user_id = ? AND question_id = ? AND accepted = 1")
    .bind(userId, questionId)
    .first();
  if (solved) {
    // Accepted but the editor's reply has not arrived yet: still "awaiting".
    return (await hasPendingReply(db, userId, now)) ? "awaiting_reply" : "solved";
  }
  return (await hasPendingReply(db, userId, now)) ? "awaiting_reply" : "open";
}

export type SubmitResult =
  | { kind: "submitted" }
  | { kind: "rate_limited" }
  | { kind: "invalid" } // wrong slot count
  | { kind: "not_open"; status: QuestionStatus };

export async function submitAnswer(
  db: D1Database,
  content: Content,
  userId: string,
  questionId: string,
  facts: ComposedFact[],
  now: number,
  random: () => number = Math.random,
): Promise<SubmitResult> {
  const status = await questionStatus(db, content, userId, questionId, now);
  if (status !== "open") return { kind: "not_open", status };
  const question = content.graph.questions.find((x) => x.id === questionId)!;

  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM answer WHERE user_id = ? AND created_at > ?")
    .bind(userId, now - HOUR_MS)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= content.manifest.answers_per_hour) return { kind: "rate_limited" };

  if (facts.length !== question.facts.length) return { kind: "invalid" };

  const accepted = isAccepted(content.graph, question, facts);
  const [min, max] = content.manifest.reply_delay_seconds;
  const delaySeconds = min + Math.floor(random() * (max - min + 1));
  await db.batch([
    db
      .prepare("INSERT INTO answer (user_id, question_id, facts, accepted, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(userId, questionId, JSON.stringify(facts), accepted ? 1 : 0, now),
    db
      .prepare("INSERT INTO mail (user_id, mail_id, respond_at) VALUES (?, ?, ?)")
      .bind(userId, accepted ? question.accept_mail : question.reject_mail, now + delaySeconds * 1000),
  ]);
  return { kind: "submitted" };
}
