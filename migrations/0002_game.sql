-- Player state. Times are epoch milliseconds. user_id references Better Auth's "user".
CREATE TABLE player (
  user_id TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);

CREATE TABLE seen_doc (
  user_id TEXT NOT NULL REFERENCES player (user_id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, doc_id)
);

CREATE TABLE collected_term (
  user_id TEXT NOT NULL REFERENCES player (user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('number', 'org')),
  value TEXT NOT NULL,
  collected_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, value)
);

CREATE TABLE gate_unlock (
  user_id TEXT NOT NULL REFERENCES player (user_id) ON DELETE CASCADE,
  gate_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, gate_id)
);

-- A letter in the player's mailbox; visible only once respond_at <= now.
CREATE TABLE mail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES player (user_id) ON DELETE CASCADE,
  mail_id TEXT NOT NULL,
  respond_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX mail_user_respond_at ON mail (user_id, respond_at);

CREATE TABLE answer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES player (user_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  facts TEXT NOT NULL,
  accepted INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX answer_user_created_at ON answer (user_id, created_at);
