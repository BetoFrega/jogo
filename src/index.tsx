import { Hono, type Context } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createMiddleware } from "hono/factory";
import { createAuth, MAGIC_LINK_PATH, type Auth } from "./auth.ts";
import { getDoc, getMail, loadContent, type Content } from "./content/store.ts";
import { GATE_ENGINE_PREFIX } from "./content/types.ts";
import type { Env } from "./env.ts";
import { composerLayout, composerValues, parseComposer, type ComposerValues } from "./game/composer.ts";
import { signDocLink, verifyDocLink } from "./game/doclink.ts";
import { derivePassword, verifyPassword } from "./game/gate.ts";
import { renderMarkdown } from "./game/markdown.ts";
import { renderPlaceholders } from "./game/render.ts";
import { search } from "./game/search.ts";
import * as state from "./game/state.ts";
import { lastDevMailSent } from "./mail.ts";
import { autosaveKey } from "./views/autosave.ts";
import * as V from "./views/pages.tsx";
import { CSS } from "./views/style.ts";

type Vars = { auth: Auth; userId: string; email: string; handle: string; content: Content };
type C = Context<{ Bindings: Env; Variables: Vars }>;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// One Better Auth instance per isolate (env is stable within an isolate).
let authCache: { env: Env; auth: Auth } | null = null;
app.use("*", async (c, next) => {
  if (authCache?.env !== c.env) authCache = { env: c.env, auth: createAuth(c.env) };
  c.set("auth", authCache.auth);
  await next();
});

app.onError((err, c) => {
  console.error(err);
  return c.html(<V.ErrorPage message="Falha inesperada no sistema. Tente novamente em instantes." />, 500);
});

app.get("/estilo.css", (c) => c.body(CSS, 200, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300" }));
app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

// ---------- meta layer: login, account ----------

/** Calls a Better Auth endpoint through its HTTP handler so plugin hooks (captcha, rate limit) run. */
function callAuth(c: C, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const ip = c.req.header("cf-connecting-ip");
  return c.get("auth").handler(
    new Request(new URL(`/api/auth${path}`, c.env.BETTER_AUTH_URL), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(c.env.BETTER_AUTH_URL).origin, ...(ip ? { "cf-connecting-ip": ip } : {}), ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const googleEnabled = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const loginPage = (c: C, status: 200 | 400 | 429, error?: string, email?: string) =>
  c.html(<V.LoginPage siteKey={c.env.TURNSTILE_SITE_KEY} googleEnabled={googleEnabled(c.env)} error={error} email={email} />, status);

app.get("/entrar", async (c) => {
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
  return session ? c.redirect("/") : loginPage(c, 200);
});

app.post("/entrar", async (c) => {
  const form = await c.req.parseBody();
  const email = typeof form.email === "string" ? form.email.trim() : "";
  const captcha = typeof form["cf-turnstile-response"] === "string" ? form["cf-turnstile-response"] : "";
  const res = await callAuth(c, MAGIC_LINK_PATH, { email, callbackURL: "/" }, { "x-captcha-response": captcha });
  if (res.status === 429) return loginPage(c, 429, "Muitas tentativas. Aguarde um minuto e tente de novo.", email);
  if (!res.ok) {
    console.warn("magic link request failed", res.status, await res.text());
    return loginPage(c, 400, "Não foi possível enviar o link. Confira o e-mail e a verificação anti-robô.", email);
  }
  return c.html(<V.CheckInboxPage email={email} devLink={c.env.ENVIRONMENT === "development"} />);
});

app.post("/entrar/google", async (c) => {
  if (!googleEnabled(c.env)) return c.notFound();
  const res = await callAuth(c, "/sign-in/social", { provider: "google", callbackURL: "/" });
  const { url } = (await res.json()) as { url?: string };
  if (!res.ok || !url) throw new Error(`google sign-in failed: ${res.status}`);
  const out = c.redirect(url);
  for (const cookie of res.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
});

app.get("/dev/last-link", (c) => {
  if (c.env.ENVIRONMENT !== "development") return c.notFound();
  return c.html(<V.DevLastLinkPage mail={lastDevMailSent()} />);
});

// Offline stand-in for Turnstile siteverify, mirroring Cloudflare's test secrets:
// the always-pass test secret succeeds, anything else fails. Only reachable in
// development and only used when TURNSTILE_VERIFY_URL points here.
const TURNSTILE_ALWAYS_PASS_SECRET = "1x0000000000000000000000000000000AA";
app.post("/dev/turnstile-siteverify", async (c) => {
  if (c.env.ENVIRONMENT !== "development") return c.notFound();
  const { secret } = (await c.req.json()) as { secret?: string };
  const success = secret === TURNSTILE_ALWAYS_PASS_SECRET;
  return c.json({ success, "error-codes": success ? [] : ["invalid-input-secret"] });
});

const requireUser = createMiddleware<{ Bindings: Env; Variables: Vars }>(async (c, next) => {
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.redirect("/entrar");
  c.set("userId", session.user.id);
  c.set("email", session.user.email);
  await next();
});

app.post("/sair", requireUser, async (c) => {
  const res = await c.get("auth").api.signOut({ headers: c.req.raw.headers, asResponse: true });
  const out = c.redirect("/entrar");
  for (const cookie of res.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
});

app.get("/conta", requireUser, async (c) =>
  c.html(<V.AccountPage email={c.get("email")} handle={await state.getHandle(c.env.DB, c.get("userId"))} />),
);

app.get("/identidade", requireUser, async (c) => {
  if (await state.getHandle(c.env.DB, c.get("userId"))) return c.redirect("/");
  return c.html(<V.HandlePage />);
});

app.post("/identidade", requireUser, async (c) => {
  const form = await c.req.parseBody();
  const handle = typeof form.handle === "string" ? form.handle.trim() : "";
  const content = await loadContent(c.env.CONTENT);
  const result = await state.createPlayer(c.env.DB, content, c.get("userId"), handle, Date.now());
  if (result === "created") return c.redirect("/correio");
  if (result === "taken" && (await state.getHandle(c.env.DB, c.get("userId")))) return c.redirect("/");
  const error = result === "taken" ? "Esse nome já está em uso. Escolha outro." : "Nome inválido. Use de 3 a 16 letras sem acento, números, ponto, hífen ou sublinhado.";
  return c.html(<V.HandlePage error={error} value={handle} />, 400);
});

// ---------- fiction: everything below needs a player ----------

const requirePlayer = createMiddleware<{ Bindings: Env; Variables: Vars }>(async (c, next) => {
  const handle = await state.getHandle(c.env.DB, c.get("userId"));
  if (!handle) return c.redirect("/identidade");
  c.set("handle", handle);
  c.set("content", await loadContent(c.env.CONTENT));
  await next();
});

const game = new Hono<{ Bindings: Env; Variables: Vars }>();
game.use("*", requireUser, requirePlayer);

function gatePasswordFor(c: C) {
  const { graph } = c.get("content");
  return (gateId: string) => {
    const gate = graph.gates.find((g) => g.id === gateId)!;
    return derivePassword(c.env.GATE_SECRET_V1, c.get("userId"), gateId, gate.format, graph.words);
  };
}
/** Where a doc opens: a signed link for engine docs, the plain id for intranet docs (gated by the unlock). */
async function docHref(c: C, doc: { id: string; engine: string }): Promise<string> {
  if (doc.engine.startsWith(GATE_ENGINE_PREFIX)) return `/doc/${doc.id}`;
  return `/doc/${doc.id}?s=${await signDocLink(c.env.DOC_LINK_SECRET, c.get("userId"), doc.id)}`;
}

function sourceName(content: Content, engine: string): string {
  const name = engine.startsWith(GATE_ENGINE_PREFIX)
    ? content.graph.gates.find((g) => `${GATE_ENGINE_PREFIX}${g.id}` === engine)?.name
    : content.manifest.engines.find((e) => e.id === engine)?.name;
  if (name === undefined) throw new Error(`doc engine ${engine} is not in content ${content.version}`);
  return name;
}

/** Opened docs, most recent first; docs missing from the current content version are skipped. */
async function history(c: C): Promise<V.HistoryEntry[]> {
  const content = c.get("content");
  const ids = await state.openedDocIds(c.env.DB, c.get("userId"));
  const docs = await Promise.all(ids.map((id) => getDoc(c.env.CONTENT, content, id)));
  return Promise.all(
    docs.filter((d) => d !== null).map(async (d) => ({ id: d.id, title: d.title, source: sourceName(content, d.engine), href: await docHref(c, d) })),
  );
}

/** Every fiction page renders here, so `Desk` always has the player's history. */
async function desk(c: C, page: JSX.Element, status?: ContentfulStatusCode) {
  return c.html(<V.HistoryContext.Provider value={await history(c)}>{page}</V.HistoryContext.Provider>, status);
}

// Placeholders first, then Markdown, which escapes everything (the handle is user input).
const render = async (c: C, text: string) => renderMarkdown(await renderPlaceholders(text, c.get("handle"), gatePasswordFor(c)));

game.get("/", async (c) => {
  const { manifest, graph } = c.get("content");
  const mail = await state.visibleMail(c.env.DB, c.get("userId"), Date.now());
  return desk(c, <V.DesktopPage handle={c.get("handle")} unread={mail.filter((m) => m.read_at === null).length} engines={manifest.engines} gates={graph.gates} />);
});

game.get("/correio", async (c) => {
  const now = Date.now();
  const rows = await state.visibleMail(c.env.DB, c.get("userId"), now);
  const items = await Promise.all(
    rows.map(async (r) => ({ rowId: r.id, unread: r.read_at === null, mail: await getMail(c.env.CONTENT, c.get("content"), r.mail_id) })),
  );
  const pending = await state.hasPendingReply(c.env.DB, c.get("userId"), now);
  // ?enviado=<question id> after a successful send; only a real question id clears its draft.
  const sent = c.req.query("enviado");
  const clearDraft = c.get("content").graph.questions.some((q) => q.id === sent) ? autosaveKey(c.get("handle"), sent!) : undefined;
  return desk(c, <V.MailboxPage handle={c.get("handle")} items={items} pending={pending} sent={sent !== undefined} clearDraft={clearDraft} />);
});

game.get("/correio/:id{[0-9]+}", async (c) => {
  const now = Date.now();
  const row = await state.openMail(c.env.DB, c.get("userId"), Number(c.req.param("id")), now);
  if (!row) return c.notFound();
  const content = c.get("content");
  const mail = await getMail(c.env.CONTENT, content, row.mail_id);
  const question = mail.question ? { id: mail.question, status: await state.questionStatus(c.env.DB, content, c.get("userId"), mail.question, now) } : undefined;
  return desk(c, <V.LetterPage handle={c.get("handle")} mail={mail} bodyHtml={await render(c, mail.body)} question={question} />);
});

async function composer(c: C, questionId: string, form?: { values: ComposerValues; errors?: Record<string, string>; error: string }) {
  const content = c.get("content");
  const question = content.graph.questions.find((q) => q.id === questionId)!;
  const mail = await getMail(c.env.CONTENT, content, question.mail);
  return desk(
    c,
    <V.ComposerPage
      handle={c.get("handle")}
      questionId={questionId}
      subject={mail.subject}
      layout={composerLayout(content.graph, question)}
      relations={content.graph.relations}
      values={form?.values ?? {}}
      errors={form?.errors ?? {}}
      error={form?.error}
    />,
    form ? 400 : 200,
  );
}

game.get("/responder/:question", async (c) => {
  const id = c.req.param("question");
  const status = await state.questionStatus(c.env.DB, c.get("content"), c.get("userId"), id, Date.now());
  if (status === "unavailable") return c.notFound();
  if (status !== "open") return c.redirect("/correio");
  return composer(c, id);
});

game.post("/responder/:question", async (c) => {
  const id = c.req.param("question");
  const content = c.get("content");
  const question = content.graph.questions.find((q) => q.id === id);
  if (!question) return c.notFound();
  const status = await state.questionStatus(c.env.DB, content, c.get("userId"), id, Date.now());
  if (status === "unavailable") return c.notFound();
  if (status !== "open") return c.redirect("/correio");
  const layout = composerLayout(content.graph, question);
  const values = composerValues(await c.req.parseBody(), layout);
  // Resolution and missing fields are answered here, before submitAnswer: no answer row, no rate-limit use.
  const { orgs } = await state.collectedTerms(c.env.DB, c.get("userId"));
  const parsed = parseComposer(values, layout, content.graph, orgs);
  if (parsed.kind === "errors") return composer(c, id, { values, errors: parsed.errors, error: "Revise os campos marcados. Nada foi enviado à redação." });
  const result = await state.submitAnswer(c.env.DB, content, c.get("userId"), id, parsed.facts, Date.now());
  switch (result.kind) {
    case "submitted":
      return c.redirect(`/correio?enviado=${id}`);
    case "rate_limited":
      return composer(c, id, { values, error: "LINHA OCUPADA. A redação não recebe mais respostas suas nesta hora." });
    case "invalid":
      return composer(c, id, { values, error: "Resposta incompleta." });
    case "not_open":
      return result.status === "unavailable" ? c.notFound() : c.redirect("/correio");
  }
});

async function signedResults(c: C, docIds: string[]) {
  const docs = await Promise.all(docIds.map((id) => getDoc(c.env.CONTENT, c.get("content"), id)));
  return Promise.all(docs.filter((d) => d !== null).map(async (d) => ({ ...d, href: await docHref(c, d) })));
}

game.get("/busca/:engine", async (c) => {
  const content = c.get("content");
  const engine = content.manifest.engines.find((e) => e.id === c.req.param("engine"));
  if (!engine) return c.notFound();
  const query = c.req.query("q");
  if (query === undefined) {
    const helpHtml = engine.help ? renderMarkdown(engine.help) : undefined;
    return desk(c, <V.SearchPage handle={c.get("handle")} engine={engine} query="" helpHtml={helpHtml} outcome={{ kind: "none" }} />);
  }
  const outcome = search(engine, content.indexes[engine.id], query);
  const shown =
    outcome.kind === "results"
      ? { kind: "results" as const, docs: await signedResults(c, outcome.docIds) }
      : outcome;
  return desk(c, <V.SearchPage handle={c.get("handle")} engine={engine} query={query} outcome={shown} />);
});

game.get("/doc/:id", async (c) => {
  const content = c.get("content");
  const userId = c.get("userId");
  const id = c.req.param("id");
  // Every refusal is the same notFound() as an unknown id: no oracle.
  const [doc, signed] = await Promise.all([getDoc(c.env.CONTENT, content, id), verifyDocLink(c.env.DOC_LINK_SECRET, userId, id, c.req.query("s"))]);
  if (!doc) return c.notFound();
  let back = `/busca/${doc.engine}`;
  if (doc.engine.startsWith(GATE_ENGINE_PREFIX)) {
    const gateId = doc.engine.slice(GATE_ENGINE_PREFIX.length);
    if (!(await state.isGateUnlocked(c.env.DB, userId, gateId))) return c.notFound();
    back = `/intranet/${gateId}`;
  } else if (!signed) {
    return c.notFound();
  }
  await state.recordDocOpened(c.env.DB, userId, doc, Date.now());
  return desk(c, <V.DocPage handle={c.get("handle")} doc={doc} bodyHtml={await render(c, doc.body)} back={back} />);
});

game.get("/intranet/:gate", async (c) => {
  const gate = c.get("content").graph.gates.find((g) => g.id === c.req.param("gate"));
  if (!gate) return c.notFound();
  const unlocked = await state.isGateUnlocked(c.env.DB, c.get("userId"), gate.id);
  return desk(c, unlocked ? <V.GateIndexPage handle={c.get("handle")} gate={gate} /> : <V.GateLoginPage handle={c.get("handle")} gate={gate} error={false} />);
});

game.post("/intranet/:gate", async (c) => {
  const { graph } = c.get("content");
  const gate = graph.gates.find((g) => g.id === c.req.param("gate"));
  if (!gate) return c.notFound();
  const form = await c.req.parseBody();
  const input = typeof form.senha === "string" ? form.senha : "";
  if (!(await verifyPassword(input, c.env.GATE_SECRET_V1, c.get("userId"), gate.id, gate.format, graph.words))) {
    return desk(c, <V.GateLoginPage handle={c.get("handle")} gate={gate} error={true} />, 403);
  }
  await state.unlockGate(c.env.DB, c.get("userId"), gate.id, Date.now());
  return c.redirect(`/intranet/${gate.id}`);
});

game.get("/lista", (c) => {
  const entries = [...c.get("content").graph.phonebook].sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`, "pt-BR"));
  return desk(c, <V.PhonebookPage handle={c.get("handle")} entries={entries} />);
});

app.route("/", game);

export default app;
