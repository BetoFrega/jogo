// Server-rendered pages. Player-facing text is Brazilian Portuguese; inside the
// fiction (1994) never name real technologies.
import { createContext, useContext, type Child } from "hono/jsx";
import type { Doc, Engine, GateListing, Mail, PhonebookEntry, Relation } from "../content/types.ts";
import { fieldName, type ComposerLayout, type ComposerValues } from "../game/composer.ts";
import type { QuestionStatus } from "../game/state.ts";
import { AUTOSAVE_JS, autosaveKey } from "./autosave.ts";

// ---------- shells ----------

export function MetaPage(props: { title: string; children: Child; head?: Child }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <link rel="stylesheet" href="/estilo.css" />
        {props.head}
      </head>
      <body class="meta">
        <main class="card">{props.children}</main>
      </body>
    </html>
  );
}

/** One opened doc in the "Histórico" panel. */
export interface HistoryEntry {
  id: string;
  title: string;
  /** Engine or intranet name. */
  source: string;
  href: string;
}

/** The player's history, provided once per response by the route layer (see `desk()` in index.tsx). */
export const HistoryContext = createContext<HistoryEntry[] | null>(null);

export function Desk(props: { title: string; handle: string; children: Child; refreshSeconds?: number; currentDocId?: string }) {
  const history = useContext(HistoryContext);
  if (!history) throw new Error("Desk rendered without HistoryContext: render fiction pages through desk() in index.tsx");
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {props.refreshSeconds ? <meta http-equiv="refresh" content={String(props.refreshSeconds)} /> : null}
        <title>{props.title}</title>
        <link rel="stylesheet" href="/estilo.css" />
      </head>
      <body class="fiction">
        <div class="taskbar">
          <a href="/">
            <b>Área de trabalho</b>
          </a>
          <span>
            Repórter: <b>{props.handle}</b> · <a href="/conta">Conta</a>
          </span>
        </div>
        <div class="desk">
          <div class="main">{props.children}</div>
          <HistoryPanel entries={history} currentDocId={props.currentDocId} />
        </div>
      </body>
    </html>
  );
}

function HistoryPanel(props: { entries: HistoryEntry[]; currentDocId?: string }) {
  return (
    <aside class="window history" aria-labelledby="historico">
      <div class="titlebar">
        <span id="historico">Histórico</span>
      </div>
      <div class="content">
        {props.entries.length === 0 ? (
          <p class="notice">Nenhum documento consultado.</p>
        ) : (
          <ul class="plain">
            {props.entries.map((e) => (
              <li>
                <a href={e.href} aria-current={e.id === props.currentDocId ? "page" : undefined}>
                  {e.title}
                </a>
                <span class="src" title={e.source}>
                  {e.source}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

const CLOSE_JS = "if (document.referrer.indexOf(location.origin + '/') === 0) { history.back(); return false; }";

export function Win(props: { title: string; children: Child }) {
  return (
    <section class="window">
      <div class="titlebar">
        <span>{props.title}</span>
        {/* Back to the previous page of this site; plain link to the desk without JS or when arriving from elsewhere. */}
        <a href="/" aria-label="Fechar" onclick={CLOSE_JS}>
          ×
        </a>
      </div>
      <div class="content">{props.children}</div>
    </section>
  );
}

// ---------- meta layer ----------

export function LoginPage(props: { siteKey: string; googleEnabled: boolean; error?: string; email?: string }) {
  return (
    <MetaPage title="Entrar" head={<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>}>
      <h1>Entrar no jogo</h1>
      <p class="muted">Enviaremos um link de acesso para o seu e-mail. Não usamos senhas.</p>
      {props.error ? <p class="error">{props.error}</p> : null}
      <form method="post" action="/entrar">
        <label for="email">E-mail</label>
        <input id="email" type="email" name="email" required autocomplete="email" value={props.email ?? ""} />
        <div class="cf-turnstile" data-sitekey={props.siteKey} style="margin-top:12px"></div>
        <button type="submit">Enviar link de acesso</button>
      </form>
      {props.googleEnabled ? (
        <form method="post" action="/entrar/google">
          <button type="submit" class="secondary">
            Entrar com Google
          </button>
        </form>
      ) : null}
    </MetaPage>
  );
}

export function CheckInboxPage(props: { email: string; devLink: boolean }) {
  return (
    <MetaPage title="Verifique seu e-mail">
      <h1>Verifique seu e-mail</h1>
      <p>
        Se <b>{props.email}</b> for um endereço válido, um link de acesso chegará em instantes. Ele vale por 15 minutos.
      </p>
      {props.devLink ? (
        <p class="muted">
          Desenvolvimento: veja o link em <a href="/dev/last-link">/dev/last-link</a>.
        </p>
      ) : null}
    </MetaPage>
  );
}

export function DevLastLinkPage(props: { mail: { to: string; text: string; at: string } | null }) {
  const url = props.mail?.text.match(/https?:\/\/\S+/)?.[0];
  return (
    <MetaPage title="Último link (dev)">
      <h1>Último link enviado (dev)</h1>
      {props.mail && url ? (
        <>
          <p class="muted">
            Para {props.mail.to} em {props.mail.at}
          </p>
          <p>
            <a id="magic-link" href={url}>
              {url}
            </a>
          </p>
        </>
      ) : (
        <p>Nenhum link enviado desde que o servidor iniciou.</p>
      )}
    </MetaPage>
  );
}

export function AccountPage(props: { email: string; handle: string | null }) {
  return (
    <MetaPage title="Sua conta">
      <h1>Sua conta</h1>
      <p>
        E-mail: <b>{props.email}</b>
      </p>
      {props.handle ? (
        <p>
          Identidade no jogo: <b>{props.handle}</b>
        </p>
      ) : null}
      <p>
        <a href="/">Voltar ao jogo</a>
      </p>
      <form method="post" action="/sair">
        <button type="submit" class="secondary">
          Sair
        </button>
      </form>
    </MetaPage>
  );
}

export function HandlePage(props: { error?: string; value?: string }) {
  return (
    <MetaPage title="Sua identidade">
      <h1>Quem é você na redação?</h1>
      <p class="muted">
        Escolha o nome pelo qual você será conhecido(a) no jogo. De 3 a 16 caracteres: letras sem acento, números, ponto, hífen ou
        sublinhado. Não dá para trocar depois.
      </p>
      {props.error ? <p class="error">{props.error}</p> : null}
      <form method="post" action="/identidade">
        <input type="text" name="handle" required minlength={3} maxlength={16} pattern="[A-Za-z0-9_.\-]{3,16}" value={props.value ?? ""} style="width:100%;padding:10px;border:1px solid #d4d4d8;border-radius:8px" />
        <button type="submit">Começar</button>
      </form>
    </MetaPage>
  );
}

// ---------- fiction ----------

export function DesktopPage(props: { handle: string; unread: number; engines: Engine[]; gates: GateListing[] }) {
  return (
    <Desk title="Área de trabalho" handle={props.handle}>
      <nav class="icons">
        <a class="icon" href="/correio">
          <span class="glyph">✉</span>
          <span class="label">Correio{props.unread ? ` (${props.unread})` : ""}</span>
        </a>
        {props.engines.map((e) => (
          <a class="icon" href={`/busca/${e.id}`}>
            <span class="glyph">?</span>
            <span class="label">{e.name}</span>
          </a>
        ))}
        {props.gates.map((g) => (
          <a class="icon" href={`/intranet/${g.id}`}>
            <span class="glyph">▣</span>
            <span class="label">{g.name}</span>
          </a>
        ))}
        <a class="icon" href="/lista">
          <span class="glyph">☎</span>
          <span class="label">Lista telefônica</span>
        </a>
      </nav>
    </Desk>
  );
}

export function MailboxPage(props: {
  handle: string;
  items: { rowId: number; mail: Mail; unread: boolean }[];
  pending: boolean;
  sent: boolean;
  /** Autosave key of the composer draft to drop after a successful send. */
  clearDraft?: string;
}) {
  return (
    <Desk title="Correio" handle={props.handle} refreshSeconds={props.pending ? 10 : undefined}>
      <Win title="Correio — Caixa de entrada">
        {props.sent ? (
          <p class="notice" data-autosave-clear={props.clearDraft}>
            Resposta enviada à redação.
          </p>
        ) : null}
        {props.pending ? <p class="notice">
            Aguardando retorno da redação
            <span class="dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p> : null}
        <ul class="plain">
          {props.items.map((i) => (
            <li class={i.unread ? "unread" : ""}>
              <a href={`/correio/${i.rowId}`}>{i.mail.subject}</a> — {i.mail.from}
            </li>
          ))}
        </ul>
        {props.clearDraft ? <Script js={AUTOSAVE_JS} /> : null}
      </Win>
    </Desk>
  );
}

const STATUS_TEXT: Record<Exclude<QuestionStatus, "open">, string> = {
  solved: "Pauta encerrada.",
  awaiting_reply: "Resposta enviada. Aguardando retorno da redação.",
  unavailable: "",
};

export function LetterPage(props: { handle: string; mail: Mail; bodyHtml: string; question?: { id: string; status: QuestionStatus } }) {
  const q = props.question;
  return (
    <Desk title={props.mail.subject} handle={props.handle}>
      <Win title={`Carta — ${props.mail.subject}`}>
        <p>
          <b>De:</b> {props.mail.from}
          <br />
          <b>Assunto:</b> {props.mail.subject}
        </p>
        <div class="paper" dangerouslySetInnerHTML={{ __html: props.bodyHtml }} />
        {q ? (
          <p>
            {q.status === "open" ? (
              <a class="button" href={`/responder/${q.id}`}>
                Responder
              </a>
            ) : (
              <span class="notice">{STATUS_TEXT[q.status]}</span>
            )}
          </p>
        ) : null}
        <p>
          <a href="/correio">« Voltar à caixa de entrada</a>
        </p>
      </Win>
    </Desk>
  );
}

function Script(props: { js: string }) {
  return <script dangerouslySetInnerHTML={{ __html: props.js }} />;
}

/** One labelled field with its error message beside it. */
function Field(props: { label: string; required?: boolean; name: string; error?: string; children: Child }) {
  return (
    <div class="row">
      <label for={props.name}>
        {props.label}
        {props.required ? <span class="req"> *</span> : null}:
      </label>
      {props.children}
      {props.error ? (
        <span class="error" id={`${props.name}_err`}>
          {props.error}
        </span>
      ) : null}
    </div>
  );
}

export function ComposerPage(props: {
  handle: string;
  questionId: string;
  subject: string;
  from: string;
  /** The letter that asks the question, so the player answers without leaving the form. */
  letterHtml: string;
  layout: ComposerLayout;
  relations: Relation[];
  values: ComposerValues;
  errors: Record<string, string>;
  error?: string;
}) {
  const { slots, numbered } = props.layout;
  const text = (name: string, label: string, required: boolean) => (
    <input
      type="text"
      id={name}
      name={name}
      value={props.values[name] ?? ""}
      aria-label={label}
      autocomplete="off"
      required={required}
      aria-invalid={props.errors[name] ? "true" : undefined}
      aria-describedby={props.errors[name] ? `${name}_err` : undefined}
    />
  );
  return (
    <Desk title="Responder" handle={props.handle}>
      <Win title={`Responder — ${props.subject}`}>
        <details class="letter" open>
          <summary>
            Carta de {props.from}: {props.subject}
          </summary>
          <div class="paper" dangerouslySetInnerHTML={{ __html: props.letterHtml }} />
        </details>
        <p>
          Monte {slots === 1 ? "o fato" : `os ${slots} fatos`} que respondem à pergunta, em qualquer ordem. A redação avalia a resposta inteira.
          {numbered > 0
            ? numbered === slots
              ? " Todos os fatos levam número."
              : ` ${numbered === 1 ? "O primeiro quadro é para o fato" : `Os ${numbered} primeiros quadros são para os fatos`} que levam número.`
            : null}
        </p>
        <p>
          Escreva os nomes como constam na lista telefônica, e as entidades como constam nos documentos. Campos com <span class="req">*</span> são
          obrigatórios.
        </p>
        {props.error ? <p class="error">{props.error}</p> : null}
        <form method="post" action={`/responder/${props.questionId}`} data-autosave={autosaveKey(props.handle, props.questionId)}>
          {Array.from({ length: slots }, (_, i) => {
            const n = (f: Parameters<typeof fieldName>[1]) => fieldName(i, f);
            return (
              <fieldset>
                <legend>
                  Fato {i + 1}
                  {i < numbered ? " — com número" : ""}
                </legend>
                <Field label="Quem (nome completo)" required name={n("who")} error={props.errors[n("who")]}>
                  {text(n("who"), "Quem", true)}
                </Field>
                <Field label="Relação" required name={n("rel")} error={props.errors[n("rel")]}>
                  <select id={n("rel")} name={n("rel")} aria-label="Relação" required>
                    <option value="">(relação)</option>
                    {props.relations.map((r) => (
                      <option value={r.id} selected={props.values[n("rel")] === r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Com quem (pessoa ou entidade)" required name={n("obj")} error={props.errors[n("obj")]}>
                  {text(n("obj"), "Com quem", true)}
                </Field>
                {i < numbered ? (
                  <Field label="Número" required name={n("num")} error={props.errors[n("num")]}>
                    {text(n("num"), "Número", true)}
                  </Field>
                ) : null}
              </fieldset>
            );
          })}
          <button type="submit">Enviar à redação</button>
        </form>
        <Script js={AUTOSAVE_JS} />
      </Win>
    </Desk>
  );
}

export function SearchPage(props: {
  handle: string;
  engine: Engine;
  query: string;
  helpHtml?: string;
  outcome: { kind: "none" } | { kind: "empty_query" } | { kind: "too_many" } | { kind: "results"; docs: (Doc & { href: string })[] };
}) {
  const o = props.outcome;
  return (
    <Desk title={props.engine.name} handle={props.handle}>
      <Win title={props.engine.name}>
        <form method="get" action={`/busca/${props.engine.id}`} class="row">
          <label for="q">Consulta:</label>
          <input id="q" type="search" name="q" value={props.query} autofocus />
          <button type="submit">Consultar</button>
        </form>
        {o.kind === "none" && props.helpHtml ? <div class="paper" dangerouslySetInnerHTML={{ __html: props.helpHtml }} /> : null}
        {o.kind === "empty_query" ? <p class="error">DIGITE UM TERMO DE CONSULTA.</p> : null}
        {o.kind === "too_many" ? (
          <p class="error">
            SISTEMA EM FASE DE IMPLANTAÇÃO. A EXIBIÇÃO DE RESPOSTAS COM MAIS DE {props.engine.max_results} REGISTROS AINDA ESTÁ EM DESENVOLVIMENTO. REFINE A CONSULTA.
          </p>
        ) : null}
        {o.kind === "results" && o.docs.length === 0 ? <p class="error">NENHUM REGISTRO ENCONTRADO.</p> : null}
        {o.kind === "results" && o.docs.length > 0 ? (
          <ul class="plain">
            {o.docs.map((d) => (
              <li>
                <a href={d.href}>{d.title}</a> — {d.author}, {d.date}
              </li>
            ))}
          </ul>
        ) : null}
      </Win>
    </Desk>
  );
}

export function DocPage(props: { handle: string; doc: Doc; bodyHtml: string; back: string }) {
  return (
    <Desk title={props.doc.title} handle={props.handle} currentDocId={props.doc.id}>
      <Win title={props.doc.title}>
        <p>
          <b>{props.doc.author}</b> — {props.doc.date}
        </p>
        <div class="paper" dangerouslySetInnerHTML={{ __html: props.bodyHtml }} />
        <p>
          <a href={props.back}>« Voltar</a>
        </p>
      </Win>
    </Desk>
  );
}

export function GateLoginPage(props: { handle: string; gate: GateListing; error: boolean }) {
  return (
    <Desk title={props.gate.name} handle={props.handle}>
      <Win title={props.gate.name}>
        <p class="notice">ACESSO RESTRITO A SERVIDORES AUTORIZADOS.</p>
        {props.error ? <p class="error">SENHA INVÁLIDA. TENTATIVA REGISTRADA.</p> : null}
        <form method="post" action={`/intranet/${props.gate.id}`} class="row">
          <label for="senha">Senha:</label>
          <input id="senha" type="password" name="senha" required autocomplete="off" />
          <button type="submit">Entrar</button>
        </form>
      </Win>
    </Desk>
  );
}

export function GateIndexPage(props: { handle: string; gate: GateListing }) {
  return (
    <Desk title={props.gate.name} handle={props.handle}>
      <Win title={props.gate.name}>
        <p class="notice">ACESSO AUTORIZADO.</p>
        <ul class="plain">
          {props.gate.docs.map((d) => (
            <li>
              <a href={`/doc/${d.id}`}>{d.title}</a> — {d.date}
            </li>
          ))}
        </ul>
      </Win>
    </Desk>
  );
}

export function PhonebookPage(props: { handle: string; entries: PhonebookEntry[] }) {
  return (
    <Desk title="Lista telefônica" handle={props.handle}>
      <Win title="Lista telefônica">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Endereço</th>
              <th>Telefone</th>
            </tr>
          </thead>
          <tbody>
            {props.entries.map((p) => (
              <tr>
                <td>
                  {p.last}, {p.first}
                </td>
                <td>{p.address ?? ""}</td>
                <td>{p.phone ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Win>
    </Desk>
  );
}

export function ErrorPage(props: { message: string }) {
  return (
    <MetaPage title="Erro">
      <h1>Algo deu errado</h1>
      <p>{props.message}</p>
      <p>
        <a href="/">Voltar</a>
      </p>
    </MetaPage>
  );
}
