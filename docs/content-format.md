# Content format

The contract between this public repository (code) and the private content
repository. The private repo holds **source** files in the layout below and runs
this repo's compiler (`npm run compile -- <source-dir> <out-dir>`), then uploads
`<out-dir>` to R2. Nothing in this repo may contain real story content; it ships
only `fixtures/content/`, a tiny made-up case used by tests and local dev.

## Normalization

One function, `normalize(s)`, used by the compiler (index keys, aliases, answers)
and by the Worker (queries, answers, passwords):

1. Unicode NFD, drop combining marks (accents).
2. Lowercase.
3. Replace every character that is not `[a-z0-9]` with a space.
4. Collapse runs of spaces, trim.

`Licitação 04/93` → `licitacao 04 93`. Search is an exact match of the
normalized query against normalized index keys. No substring, prefix or fuzzy.

## Source layout

```
<source>/
  manifest.yaml
  phonebook.yaml
  graph.yaml
  docs/**/*.md
  mail/**/*.md
  words.txt            # word list for gate passwords, one per line
```

### manifest.yaml

```yaml
title: "Caso 1"
engines:
  - id: diario              # stable id, used in URLs and doc frontmatter
    name: "Diário Oficial de Exemplo"   # fictional display name
    fields: [pessoa, numero_ato, empresa]   # frontmatter keys this engine indexes
    max_results: 5          # more matches → "limit exceeded" error, no count
  - id: forum
    name: "Fórum Exemplo"
    fields: [autor, assunto]
    max_results: 5
gates:
  - id: prefeitura
    name: "Intranet da Prefeitura"
    format: "WORD-NNNN"     # WORD from words.txt (uppercased), N digits
relations:                  # fixed list shown in the composer, distractors included
  - { id: conjuge, label: "é cônjuge de", symmetric: true }
  - { id: nomeou, label: "nomeou" }
reply_delay_seconds: [30, 60]
answers_per_hour: 20
start_mail: carta-01        # delivered on first login
```

### phonebook.yaml

The fixed name source for the composer. Real cast and red herrings alike.

```yaml
- { first: "Marta", last: "Exemplo", address: "Rua A, 10", phone: "21-0001" }
```

### graph.yaml

```yaml
orgs:                       # organizations; become composable once collected
  - { id: org-merenda, name: "Merenda Exemplo Ltda." }
facts:
  - id: f-nomeacao
    subject: { first: "Marta", last: "Exemplo" }      # a phonebook person
    relation: nomeou
    object: { first: "Rui", last: "Exemplo" }         # person, or { org: org-merenda }
    number: "0493"          # optional; must be collected to be composable
questions:
  - id: q1
    mail: carta-01          # the letter that asks it
    facts: [f-nomeacao, f-outro]   # all required, order-free, accepted as a batch
    accept_mail: carta-02   # delivered after the reply delay when accepted
    reject_mail: recusa-q1  # delivered after the delay when rejected (reusable)
```

A submitted answer is a list of composed facts. It is accepted only when the set
of submitted facts equals the question's set exactly (same size, every fact
matched). Facts compare by normalized subject first+last, relation id, normalized
object (person names or org id) and normalized number (when the fact has one).
Symmetric relations match in either direction. The verdict never says which
fact failed.

### docs/**/*.md

```markdown
---
id: ato-0493                # unique, [a-z0-9-]
engine: diario              # an engine id, or "gate:<gate id>" for intranet pages
title: "Portaria nº 0493/93"
author: "Gabinete do Prefeito"
date: "1993-03-14"
fields:                     # values indexed by the engine (keys from engine.fields)
  pessoa: ["Rui Exemplo"]
  numero_ato: ["0493/93"]
aliases:                    # extra normalized keys pointing at this doc
  "0493/93": ["portaria 0493"]
collect:                    # collected by the player when the doc is opened
  numbers: ["0493"]
  orgs: [org-merenda]
evidence: [f-nomeacao]      # facts this doc proves (checked for solvability)
---
Body in Markdown. Placeholders: {{player.handle}}, {{gate:prefeitura}}.
```

Intranet docs (`engine: gate:<id>`) are not searchable; they are listed once the
player unlocked that gate.

### mail/**/*.md

```markdown
---
id: carta-01
from: "Editor Exemplo"
subject: "Uma conversa"
question: q1                # optional: the reply composer opens for this question
---
Oi, {{player.handle}}, ...
```

## Compiler checks (fail loud, non-zero exit)

- Unique ids; every reference resolves (engine, gate, relation, fact, org, mail, question).
- Every fact subject/object person exists in the phonebook.
- Every fact used by a question has at least one evidence doc.
- Every `{{gate:x}}` and `{{player.handle}}` placeholder is known.
- Forbidden-terms check: `<source>/forbidden.txt` (optional, one normalized term
  per line) must not appear in any text.

## Published bundle (R2)

```
content/current                   → "v<N>" (plain text)
content/v<N>/manifest.json        → manifest + { version, files: { path: sha256 } }
content/v<N>/index/<engine>.json  → { "<normalized key>": ["doc-id", ...] }
content/v<N>/graph.json           → { relations, orgs, facts, questions, phonebook, gates, start_mail }
content/v<N>/docs/<id>.json       → { id, engine, title, author, date, body, collect }
content/v<N>/mail/<id>.json       → { id, from, subject, question?, body }
```

The version `N` is the compiler's `--version` argument. The Worker reads
`content/current`, loads manifest, indexes and graph once per isolate and per
version, and fetches docs and mail on demand.
