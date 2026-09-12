-- Eski (Reddit-uslubidagi) jamoalar/post/ovoz/izoh funksionalligini D1'ga qaytarish.
-- 0001_init.sql allaqachon remote'da qo'llangan — shu sababli bu yerda faqat QO'SHISH
-- qilinadi (ALTER TABLE ADD COLUMN yoki yangi CREATE TABLE), hech qachon eski jadval
-- ta'riflari o'zgartirilmaydi.
--
-- Ikkita oqim endi bitta bazada yashaydi:
--   - Murojaat -> AI -> klaster -> yechim (0001_init.sql, taqdimotga asoslangan)
--   - Jamoalar -> post -> ovoz -> izoh (bu fayl, eski Node/Postgres ilovadan tiklangan)
-- AI ikkalasiga ham ulanadi: murojaatlarda avvalgidek, postlarda esa fon rejimida
-- yorliqlash (posts.ai_topic) sifatida.

-- ── users: eski Reddit-uslub statistikasi (murojaat sxemasida yo'q edi) ──
ALTER TABLE users ADD COLUMN karma INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN followers INTEGER NOT NULL DEFAULT 0;

-- ── jamoalar ──
CREATE TABLE communities (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  rules         TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#C8922A',
  owner_id      TEXT NOT NULL REFERENCES users(id),
  avatar        TEXT,
  banner        TEXT,
  members       INTEGER NOT NULL DEFAULT 0,
  views         INTEGER NOT NULL DEFAULT 0,
  is_private    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE UNIQUE INDEX idx_communities_slug_lower ON communities (lower(slug));

CREATE TABLE memberships (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id  TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, community_id)
);

CREATE TABLE community_roles (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id  TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'admin',
  PRIMARY KEY (user_id, community_id)
);

CREATE TABLE community_requests (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id  TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE (user_id, community_id)
);

-- ── postlar ──
CREATE TABLE posts (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id   TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL DEFAULT '',
  link           TEXT,
  image          TEXT,
  video          TEXT,
  audio          TEXT,
  type           TEXT NOT NULL DEFAULT 'text',
  flair          TEXT,
  score          INTEGER NOT NULL DEFAULT 1,
  upvotes        INTEGER NOT NULL DEFAULT 1,
  downvotes      INTEGER NOT NULL DEFAULT 0,
  comment_count  INTEGER NOT NULL DEFAULT 0,
  ai_topic       TEXT,                              -- AI fon-rejim yorlig'i (bo'sh = hali/ AI o'chiq)
  ai_status      TEXT NOT NULL DEFAULT 'pending',    -- pending | done | failed
  created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_posts_community ON posts (community_id, created_at);
CREATE INDEX idx_posts_user      ON posts (user_id, created_at);
CREATE INDEX idx_posts_created   ON posts (created_at DESC);
CREATE INDEX idx_posts_ai_topic  ON posts (ai_topic);

CREATE TABLE post_votes (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id  TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  vote     INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE saved_posts (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id   TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  saved_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, post_id)
);

-- "comments" nomi allaqachon klaster-muhokamasi jadvaliga tegishli (0001_init.sql) —
-- shuning uchun eski post-izohlari (parent_id/depth bilan threaded) alohida nom oladi.
CREATE TABLE post_comments (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   TEXT,
  body        TEXT NOT NULL,
  score       INTEGER NOT NULL DEFAULT 1,
  depth       INTEGER NOT NULL DEFAULT 0,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX idx_post_comments_post   ON post_comments (post_id, score);
CREATE INDEX idx_post_comments_parent ON post_comments (parent_id);

CREATE TABLE post_comment_votes (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id  TEXT NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  vote        INTEGER NOT NULL,
  PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE follows (
  follower_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE polls (
  id             TEXT PRIMARY KEY,
  post_id        TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question       TEXT NOT NULL,
  options        TEXT NOT NULL,   -- JSON massiv
  duration_days  INTEGER NOT NULL DEFAULT 3,
  ends_at        INTEGER NOT NULL,
  created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE poll_votes (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poll_id       TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_index  INTEGER NOT NULL,
  PRIMARY KEY (user_id, poll_id)
);

-- ── notifications/reports kengaytmasi: eski post/izoh turlariga bog'lash ──
-- (REFERENCES qo'shilmadi — SQLite'da ALTER ... ADD COLUMN orqali qo'shilgan
-- ustunlarda FK cheklovi ba'zi versiyalarda kutilmagancha ishlaydi; yaxlitlik
-- ilova darajasida ta'minlanadi, xuddi shu fayldagi boshqa ixtiyoriy maydonlar kabi)
ALTER TABLE notifications ADD COLUMN post_id TEXT;
ALTER TABLE notifications ADD COLUMN post_comment_id TEXT;
ALTER TABLE reports ADD COLUMN post_id TEXT;
ALTER TABLE reports ADD COLUMN post_comment_id TEXT;

-- ── Telegram bot muloqot holati ──
-- Eski ilovada xotiradagi `pendingLinks` Map edi (bitta doimiy Node jarayoni
-- faraz qilingan). Webhook modelida har update alohida so'rov bo'lgani uchun
-- holat D1'da saqlanadi.
CREATE TABLE tg_bot_state (
  chat_id     TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);
