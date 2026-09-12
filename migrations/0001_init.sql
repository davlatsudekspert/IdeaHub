-- MindHub — fuqarolik tashabbuslari platformasi (D1 / SQLite)
-- Eslatma: SQLite'da INTEGER 0/1 orqali boolean, vaqt UNIX soniya (INTEGER)
-- sifatida saqlanadi — bu eski Postgres sxemasi bilan bir xil uslub.
-- Jadvallar bog'liqlik tartibida yozilgan (avval murojaat qilinadigan jadval).

CREATE TABLE regions (
  id    TEXT PRIMARY KEY,   -- slug, masalan 'toshkent-shahar'
  name  TEXT NOT NULL
);

CREATE TABLE schools (
  id          TEXT PRIMARY KEY,
  region_id   TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_schools_region ON schools (region_id);
CREATE UNIQUE INDEX idx_schools_region_name ON schools (region_id, lower(name));

CREATE TABLE categories (
  id     TEXT PRIMARY KEY,   -- slug, masalan 'yol-xavfsizligi'
  name   TEXT NOT NULL,
  color  TEXT NOT NULL DEFAULT '#C8922A',
  icon   TEXT DEFAULT '📌'
);

-- O'xshash murojaatlar birlashtirilgan klaster — "bitta ovoz".
-- Muayyan boshlang'ich murojaatga bog'lanmaydi (mustaqil obyekt),
-- shu sababli problems<->clusters o'zaro bog'liqligi bir tomonlama qoladi.
CREATE TABLE clusters (
  id             TEXT PRIMARY KEY,
  category_id    TEXT REFERENCES categories(id),
  region_id      TEXT REFERENCES regions(id),
  school_id      TEXT REFERENCES schools(id),
  title          TEXT NOT NULL,          -- AI qisqa sarlavhasi
  summary        TEXT DEFAULT '',        -- AI umumlashtiruvi
  status         TEXT NOT NULL DEFAULT 'open',  -- open | solution_proposed | resolved | closed
  problem_count  INTEGER NOT NULL DEFAULT 0,
  support_count  INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  resolved_at    INTEGER
);
CREATE INDEX idx_clusters_category ON clusters (category_id, status);
CREATE INDEX idx_clusters_region   ON clusters (region_id, status);
CREATE INDEX idx_clusters_status   ON clusters (status, support_count DESC);

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  pass            TEXT NOT NULL,
  avatar          TEXT,
  banner          TEXT,
  color           TEXT DEFAULT '#C8922A',
  bio             TEXT DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'leader' | 'admin'
  region_id       TEXT REFERENCES regions(id),    -- foydalanuvchi hududi (leader uchun — boshqaradigan hudud)
  school_id       TEXT REFERENCES schools(id),
  phone           TEXT,
  tg_chat_id      TEXT,
  tg_id           TEXT,
  is_banned       INTEGER NOT NULL DEFAULT 0,
  ban_reason      TEXT,
  ban_expires_at  INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE UNIQUE INDEX idx_users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX idx_users_email_lower    ON users (lower(email));
CREATE INDEX idx_users_region ON users (region_id);

-- Bitta murojaat (o'quvchi/fuqaro yozgan xom muammo)
CREATE TABLE problems (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_id    TEXT REFERENCES regions(id),
  school_id    TEXT REFERENCES schools(id),
  category_id  TEXT REFERENCES categories(id),      -- AI tomonidan belgilanadi
  cluster_id   TEXT REFERENCES clusters(id),         -- AI tomonidan biriktiriladi
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  image        TEXT,                                 -- R2 kaliti (/uploads/...)
  ai_status    TEXT NOT NULL DEFAULT 'pending',       -- pending | done | failed
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_problems_user     ON problems (user_id, created_at);
CREATE INDEX idx_problems_cluster  ON problems (cluster_id);
CREATE INDEX idx_problems_category ON problems (category_id);
CREATE INDEX idx_problems_region   ON problems (region_id, created_at);
CREATE INDEX idx_problems_ai       ON problems (ai_status);

-- "Menda ham shu muammo bor" — klasterni qo'llab-quvvatlash
CREATE TABLE supports (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cluster_id  TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, cluster_id)
);
CREATE INDEX idx_supports_cluster ON supports (cluster_id);

-- Yechim takliflari (AI generatsiya qilgan yoki foydalanuvchi yozgan)
CREATE TABLE solutions (
  id          TEXT PRIMARY KEY,
  cluster_id  TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL = AI taklifi
  source      TEXT NOT NULL DEFAULT 'user',  -- 'ai' | 'user'
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  votes       INTEGER NOT NULL DEFAULT 0,
  is_accepted INTEGER NOT NULL DEFAULT 0,     -- rahbar tomonidan tanlangan yechim
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_solutions_cluster ON solutions (cluster_id, votes DESC);

CREATE TABLE solution_votes (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  solution_id  TEXT NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, solution_id)
);

-- Klaster ostidagi muhokama (fikr-mulohaza)
CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  cluster_id  TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_comments_cluster ON comments (cluster_id, created_at);

CREATE TABLE reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id   TEXT REFERENCES problems(id) ON DELETE CASCADE,
  comment_id   TEXT REFERENCES comments(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  to_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,          -- support | solution | comment | cluster_resolved | message
  cluster_id  TEXT,
  msg         TEXT NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_notifications_to ON notifications (to_id, created_at);

-- ── Real vaqtli aloqa (saqlanadi: xabar, ovozli xabar, rasm) ──
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'text',  -- text | voice | image
  image_url   TEXT,
  audio_url   TEXT,
  duration    TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_messages_pair    ON messages (from_id, to_id, created_at);
CREATE INDEX idx_messages_unread  ON messages (to_id, is_read);

CREATE TABLE push_tokens (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token    TEXT NOT NULL,
  PRIMARY KEY (user_id, token)
);

CREATE TABLE reset_tokens (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE verify_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE tg_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
