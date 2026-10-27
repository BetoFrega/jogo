# jogo

A browser investigation game set in 1994. The player is a reporter: letters
from the editor arrive in an in-game mailbox, the player searches fictional
archives, unlocks an intranet with a per-player password, and answers by
composing facts. This repository holds **code only**; the story lives in a
private content repository and reaches the game as a compiled bundle in R2.
The only content here is `fixtures/content/`, a tiny made-up case.

Stack: Cloudflare Workers + Hono (server-rendered `hono/jsx`, plain forms),
D1 for player state, R2 for content, Better Auth (magic link, optional
Google) for accounts.

## Run locally

Requires Node 24+ (scripts run TypeScript natively).

```sh
npm install
cp .dev.vars.example .dev.vars          # dev secrets and Turnstile test keys
npm run dev:fixture                     # migrate local D1, compile + seed the fixture, wrangler dev
```

`dev:fixture` is the same as running these steps one by one:

```sh
npm run db:migrate:local                                   # wrangler d1 migrations apply DB --local
npm run compile -- fixtures/content .build/fixture --version 1
npm run seed:local -- .build/fixture                       # uploads into local R2, content/current last
npm run dev                                                # wrangler dev on http://localhost:8787
```

Sign in at <http://localhost:8787/entrar>. With `EMAIL_TRANSPORT=console`, the
magic link is logged and shown at <http://localhost:8787/dev/last-link>
(development only). The Turnstile widget uses Cloudflare's always-pass test
keys. If your machine cannot reach `challenges.cloudflare.com` (offline or
sandboxed), set `TURNSTILE_VERIFY_URL=http://localhost:8787/dev/turnstile-siteverify`
in `.dev.vars`; that dev-only endpoint accepts only the always-pass test secret.

Other commands: `npm test` (vitest: Node project for compiler/pure logic,
Workers project for D1/R2 behaviour), `npm run typecheck`.

## Configuration

`wrangler.jsonc` top level is production. Local dev overrides vars via `.dev.vars`.

| Name | Kind | Purpose |
| --- | --- | --- |
| `DB` | D1 binding | Auth tables + player state |
| `CONTENT` | R2 binding | Compiled content bundle |
| `EMAIL` | Email Service binding | Sends magic links when `EMAIL_TRANSPORT=cloudflare` |
| `ENVIRONMENT` | var | `development` enables `/dev/*` routes and the console transport |
| `EMAIL_TRANSPORT` | var | `console` (dev only) or `cloudflare` |
| `MAIL_FROM` | var | Sender address for magic links |
| `BETTER_AUTH_URL` | var | Public origin, e.g. `https://jogo.example` |
| `TURNSTILE_SITE_KEY` | var | Turnstile widget key |
| `BETTER_AUTH_SECRET` | secret | Better Auth signing secret |
| `TURNSTILE_SECRET_KEY` | secret | Turnstile secret |
| `DOC_LINK_SECRET` | secret | HMAC key for signed doc links (`/doc/:id?s=`). Changing it only invalidates links already on screen |
| `GATE_SECRET_V1` | secret | HMAC key for intranet passwords. Changing it changes every player's password |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secret, optional | Enable "Entrar com Google" when both are set |
| `TURNSTILE_VERIFY_URL` | dev only, optional | Siteverify override, ignored outside development |

## Database migrations

`migrations/` is applied by `wrangler d1 migrations apply DB`.

- `0001_auth.sql` is **generated** from the Better Auth options in
  `src/auth.ts` by `npm run gen:auth-sql` (it builds the schema against an
  in-memory `node:sqlite` database). After upgrading `better-auth` or changing
  plugins, regenerate it, compare, and put any difference in a **new**
  migration file. Never edit an applied migration.
- `0002_game.sql` holds the game tables: `player`, `seen_doc`,
  `collected_term`, `gate_unlock`, `mail` (with `respond_at`), `answer`.

## Content: how the private repo uses the compiler

The contract is [`docs/content-format.md`](docs/content-format.md). The
private repo checks out this repo (or installs it as a dev dependency) and runs:

```sh
npm run compile -- <path/to/source> <out-dir> --version <N>
```

The compiler uses the same `normalize()` as the Worker, runs every content
check, and exits non-zero with a list of problems if any fail. Try it with
`npm run compile -- fixtures/broken-content .build/broken --version 1`. On
success, `<out-dir>/content/` holds the bundle. Upload every
`content/v<N>/...` object to the R2 bucket first, then `content/current`
(`seed:local` does this for local R2), so players never see a half-uploaded
version.

## Layout

```
compiler/compile.ts      source -> bundle, all checks
scripts/                 compile, seed-local, gen-auth-sql CLIs
src/index.tsx            Hono routes (meta layer + fiction)
src/auth.ts, mail.ts     Better Auth config, sendMail() transports
src/content/             normalize (shared), bundle types, R2 loader
src/game/                search, gate passwords, answer check, composer form, D1 state
src/views/               pages (JSX) and the single stylesheet
fixtures/                fake content case + a deliberately broken one
test/node, test/worker   vitest projects
```
