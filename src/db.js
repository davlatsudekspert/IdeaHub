'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// DATA_DIR o'zgaruvchisini ishlatish
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ma'lumotlar bazasini to'g'ri joyga yaratish
const dbPath = path.join(DATA_DIR, 'ideahub.db');
console.log('📦 Database path:', dbPath); // Log qo'shildi

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    pass TEXT NOT NULL,
    avatar TEXT,
    banner TEXT,
    color TEXT DEFAULT '#C8922A',
    bio TEXT DEFAULT '',
    karma INTEGER DEFAULT 0,
    followers INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    rules TEXT DEFAULT '',
    color TEXT DEFAULT '#C8922A',
    owner_id TEXT NOT NULL,
    avatar TEXT,
    banner TEXT,
    members INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(owner_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS memberships (
    user_id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    PRIMARY KEY(user_id, community_id)
  );
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    community_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    link TEXT,
    image TEXT,
    video TEXT,
    audio TEXT,
    type TEXT DEFAULT 'text',
    score INTEGER DEFAULT 1,
    upvotes INTEGER DEFAULT 1,
    downvotes INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    flair TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(community_id) REFERENCES communities(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS post_votes (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    PRIMARY KEY(user_id, post_id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_id TEXT,
    body TEXT NOT NULL,
    score INTEGER DEFAULT 1,
    depth INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS comment_votes (
    user_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    PRIMARY KEY(user_id, comment_id)
  );
  CREATE TABLE IF NOT EXISTS saved_posts (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    saved_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY(user_id, post_id)
  );
  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    PRIMARY KEY(follower_id, following_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    image_url TEXT,
    audio_url TEXT,
    duration TEXT,
    is_read INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );
  -- Add columns if they don't exist (migration)
  CREATE TABLE IF NOT EXISTS _meta (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    to_id TEXT NOT NULL,
    from_id TEXT,
    type TEXT NOT NULL,
    post_id TEXT,
    comment_id TEXT,
    msg TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    post_id TEXT,
    comment_id TEXT,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL UNIQUE,
    question TEXT NOT NULL,
    options TEXT NOT NULL, -- JSON array
    duration_days INTEGER DEFAULT 3,
    ends_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS poll_votes (
    user_id TEXT NOT NULL,
    poll_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    PRIMARY KEY(user_id, poll_id)
  );
  CREATE TABLE IF NOT EXISTS push_tokens (
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    PRIMARY KEY(user_id, token)
  );
  CREATE TABLE IF NOT EXISTS reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0
  );
`);

// Migrations for existing databases
try { db.exec('ALTER TABLE posts ADD COLUMN video TEXT'); } catch {}
try { db.exec('ALTER TABLE posts ADD COLUMN audio TEXT'); } catch {}
try { db.exec('ALTER TABLE communities ADD COLUMN avatar TEXT'); } catch {}
try { db.exec('ALTER TABLE communities ADD COLUMN banner TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN followers INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE messages ADD COLUMN type TEXT DEFAULT \'text\''); } catch {}
try { db.exec('ALTER TABLE messages ADD COLUMN image_url TEXT'); } catch {}
try { db.exec('ALTER TABLE messages ADD COLUMN audio_url TEXT'); } catch {}
try { db.exec('ALTER TABLE messages ADD COLUMN duration TEXT'); } catch {}

const Q = {
  /* users */
  uById:      db.prepare('SELECT id,username,name,email,color,bio,avatar,banner,karma,followers,is_admin,is_banned,ban_reason,created_at FROM users WHERE id=?'),
  uByIdFull:  db.prepare('SELECT * FROM users WHERE id=?'),
  uByLogin:   db.prepare('SELECT * FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)'),
  uBySlug:    db.prepare('SELECT id,username,name,color,bio,avatar,banner,karma,followers,is_admin,is_banned,created_at FROM users WHERE lower(username)=lower(?) OR id=?'),
  uByUsername:db.prepare('SELECT id,username,name,email FROM users WHERE lower(username)=lower(?)'),
  uSearch:    db.prepare('SELECT id,username,name,color,avatar,karma FROM users WHERE lower(username) LIKE ? OR lower(name) LIKE ? LIMIT 20'),
  uInsert:    db.prepare('INSERT INTO users(id,username,name,email,pass,color) VALUES(?,?,?,?,?,?)'),
  uExists:    db.prepare('SELECT id FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)'),
  uUpdProf:   db.prepare('UPDATE users SET name=?,bio=? WHERE id=?'),
  uUpdPass:   db.prepare('UPDATE users SET pass=? WHERE id=?'),
  uUpdAv:     db.prepare('UPDATE users SET avatar=? WHERE id=?'),
  uUpdBanner: db.prepare('UPDATE users SET banner=? WHERE id=?'),
  uKarma:     db.prepare('UPDATE users SET karma=karma+? WHERE id=?'),
  uFollowers: db.prepare('UPDATE users SET followers=(SELECT COUNT(*) FROM follows WHERE following_id=id) WHERE id=?'),
  uAll:       db.prepare('SELECT id,username,name,email,color,avatar,karma,is_admin,is_banned,ban_reason,created_at FROM users ORDER BY created_at DESC LIMIT 100'),
  uBan:       db.prepare('UPDATE users SET is_banned=1,ban_reason=? WHERE id=?'),
  uUnban:     db.prepare('UPDATE users SET is_banned=0,ban_reason=NULL WHERE id=?'),
  uMakeAdmin: db.prepare('UPDATE users SET is_admin=1 WHERE id=?'),
  uRemAdmin:  db.prepare('UPDATE users SET is_admin=0 WHERE id=?'),

  /* communities */
  comAll:    db.prepare('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id ORDER BY c.members DESC LIMIT 60'),
  comById:   db.prepare('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id WHERE c.id=?'),
  comBySlug: db.prepare('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id WHERE lower(c.slug)=lower(?)'),
  comSearch: db.prepare('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id WHERE lower(c.slug) LIKE ? OR lower(c.name) LIKE ? LIMIT 20'),
  comInsert: db.prepare('INSERT INTO communities(id,slug,name,description,color,owner_id) VALUES(?,?,?,?,?,?)'),
  comUpdate: db.prepare('UPDATE communities SET name=?,description=?,rules=?,color=? WHERE id=?'),
  comDelete: db.prepare('DELETE FROM communities WHERE id=?'),
  comIncMem: db.prepare('UPDATE communities SET members=members+1 WHERE id=?'),
  comDecMem: db.prepare('UPDATE communities SET members=MAX(0,members-1) WHERE id=?'),
  comTop:    db.prepare('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id ORDER BY c.members DESC LIMIT 10'),
  comMine:   db.prepare('SELECT c.*,u.username as oname FROM communities c JOIN users u ON c.owner_id=u.id JOIN memberships m ON m.community_id=c.id WHERE m.user_id=? ORDER BY c.members DESC'),

  /* memberships */
  memCheck:  db.prepare('SELECT 1 FROM memberships WHERE user_id=? AND community_id=?'),
  memJoin:   db.prepare('INSERT OR IGNORE INTO memberships(user_id,community_id) VALUES(?,?)'),
  memLeave:  db.prepare('DELETE FROM memberships WHERE user_id=? AND community_id=?'),

  /* posts */
  pHot:    db.prepare('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id ORDER BY p.score DESC,p.created_at DESC LIMIT 25 OFFSET ?'),
  pNew:    db.prepare('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id ORDER BY p.created_at DESC LIMIT 25 OFFSET ?'),
  pCom:    db.prepare('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE lower(c.slug)=lower(?) ORDER BY p.score DESC,p.created_at DESC LIMIT 25 OFFSET ?'),
  pComNew: db.prepare('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE lower(c.slug)=lower(?) ORDER BY p.created_at DESC LIMIT 25 OFFSET ?'),
  pByUser: db.prepare('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT 25'),
  pOne:    db.prepare('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE p.id=?'),
  pInsert: db.prepare('INSERT INTO posts(id,user_id,community_id,title,body,link,image,video,audio,type,flair) VALUES(?,?,?,?,?,?,?,?,?,?,?)'),
  pDelete: db.prepare('DELETE FROM posts WHERE id=?'),
  pUpdate: db.prepare('UPDATE posts SET title=?,body=? WHERE id=? AND user_id=?'),
  pOwner:  db.prepare('SELECT user_id,community_id FROM posts WHERE id=?'),
  pScore:  db.prepare('UPDATE posts SET score=?,upvotes=?,downvotes=? WHERE id=?'),
  pIncCmt: db.prepare('UPDATE posts SET comment_count=comment_count+1 WHERE id=?'),
  pSearch: db.prepare('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id WHERE lower(p.title) LIKE ? OR lower(p.body) LIKE ? ORDER BY p.score DESC LIMIT 20'),
  pSaved:  db.prepare('SELECT p.*,u.username,u.color,u.avatar,c.slug as cslug,c.name as cname,c.color as ccolor FROM posts p JOIN users u ON p.user_id=u.id JOIN communities c ON p.community_id=c.id JOIN saved_posts sp ON sp.post_id=p.id WHERE sp.user_id=? ORDER BY sp.saved_at DESC'),

  /* post votes */
  pvGet:    db.prepare('SELECT vote FROM post_votes WHERE user_id=? AND post_id=?'),
  pvUpsert: db.prepare('INSERT INTO post_votes(user_id,post_id,vote) VALUES(?,?,?) ON CONFLICT(user_id,post_id) DO UPDATE SET vote=excluded.vote'),
  pvDelete: db.prepare('DELETE FROM post_votes WHERE user_id=? AND post_id=?'),
  pvCount:  db.prepare('SELECT COALESCE(SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END),0) as up,COALESCE(SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END),0) as dn FROM post_votes WHERE post_id=?'),

  /* saved */
  svCheck:  db.prepare('SELECT 1 FROM saved_posts WHERE user_id=? AND post_id=?'),
  svInsert: db.prepare('INSERT OR IGNORE INTO saved_posts(user_id,post_id) VALUES(?,?)'),
  svDelete: db.prepare('DELETE FROM saved_posts WHERE user_id=? AND post_id=?'),

  /* comments */
  cmByPost: db.prepare('SELECT cm.*,u.username,u.color,u.avatar FROM comments cm JOIN users u ON cm.user_id=u.id WHERE cm.post_id=? ORDER BY cm.score DESC,cm.created_at ASC'),
  cmInsert: db.prepare('INSERT INTO comments(id,post_id,user_id,parent_id,body,depth) VALUES(?,?,?,?,?,?)'),
  cmOne:    db.prepare('SELECT cm.*,u.username,u.color,u.avatar FROM comments cm JOIN users u ON cm.user_id=u.id WHERE cm.id=?'),
  cmOwner:  db.prepare('SELECT user_id,post_id FROM comments WHERE id=?'),
  cmDelete: db.prepare("UPDATE comments SET is_deleted=1,body='[o''chirildi]' WHERE id=?"),
  cmScore:  db.prepare('UPDATE comments SET score=? WHERE id=?'),
  cmDepth:  db.prepare('SELECT depth FROM comments WHERE id=?'),

  /* comment votes */
  cvGet:    db.prepare('SELECT vote FROM comment_votes WHERE user_id=? AND comment_id=?'),
  cvUpsert: db.prepare('INSERT INTO comment_votes(user_id,comment_id,vote) VALUES(?,?,?) ON CONFLICT(user_id,comment_id) DO UPDATE SET vote=excluded.vote'),
  cvDelete: db.prepare('DELETE FROM comment_votes WHERE user_id=? AND comment_id=?'),
  cvCount:  db.prepare('SELECT COALESCE(SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END),0) as up,COALESCE(SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END),0) as dn FROM comment_votes WHERE comment_id=?'),

  /* follows */
  fwCheck:    db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?'),
  fwInsert:   db.prepare('INSERT OR IGNORE INTO follows(follower_id,following_id) VALUES(?,?)'),
  fwDelete:   db.prepare('DELETE FROM follows WHERE follower_id=? AND following_id=?'),
  fwFollowers:db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id=?'),
  fwFollowing:db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id=?'),

  /* messages */
  msgConvos:   db.prepare('SELECT DISTINCT CASE WHEN from_id=? THEN to_id ELSE from_id END as oid FROM messages WHERE from_id=? OR to_id=?'),
  msgThread:   db.prepare('SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY created_at ASC LIMIT 100'),
  msgInsert:   db.prepare('INSERT INTO messages(id,from_id,to_id,body,type,image_url,audio_url,duration) VALUES(?,?,?,?,?,?,?,?)'),
  msgMarkRead: db.prepare('UPDATE messages SET is_read=1 WHERE from_id=? AND to_id=?'),
  msgLast:     db.prepare('SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY created_at DESC LIMIT 1'),
  msgUnread:   db.prepare('SELECT COUNT(*) as c FROM messages WHERE to_id=? AND is_read=0'),

  /* notifications */
  nInsert:   db.prepare('INSERT INTO notifications(id,to_id,from_id,type,post_id,comment_id,msg) VALUES(?,?,?,?,?,?,?)'),
  nAll:      db.prepare('SELECT n.*,u.username as fn,u.color as fc,u.avatar as fa FROM notifications n LEFT JOIN users u ON n.from_id=u.id WHERE n.to_id=? ORDER BY n.created_at DESC LIMIT 60'),
  nMarkRead: db.prepare('UPDATE notifications SET is_read=1 WHERE to_id=?'),
  nUnread:   db.prepare('SELECT COUNT(*) as c FROM notifications WHERE to_id=? AND is_read=0'),

  /* polls */
  pollInsert:  db.prepare('INSERT INTO polls(id,post_id,question,options,duration_days,ends_at) VALUES(?,?,?,?,?,?)'),
  pollGet:     db.prepare('SELECT * FROM polls WHERE post_id=?'),
  pollGetById: db.prepare('SELECT * FROM polls WHERE id=?'),
  pollVoteGet: db.prepare('SELECT option_index FROM poll_votes WHERE user_id=? AND poll_id=?'),
  pollVoteIns: db.prepare('INSERT OR IGNORE INTO poll_votes(user_id,poll_id,option_index) VALUES(?,?,?)'),
  pollVoteCnt: db.prepare('SELECT option_index,COUNT(*) as cnt FROM poll_votes WHERE poll_id=? GROUP BY option_index'),
  pollTotalVotes: db.prepare('SELECT COUNT(*) as c FROM poll_votes WHERE poll_id=?'),

  /* push tokens */
  pushIns:    db.prepare('INSERT OR IGNORE INTO push_tokens(user_id,token) VALUES(?,?)'),
  pushDel:    db.prepare('DELETE FROM push_tokens WHERE user_id=? AND token=?'),
  pushByUser: db.prepare('SELECT token FROM push_tokens WHERE user_id=?'),

  /* followers list for notifications */
  fwFollowersList: db.prepare('SELECT follower_id FROM follows WHERE following_id=?'),
  fwFollowersCount: db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id=?'),

  /* community update with image */
  comUpdateFull: db.prepare('UPDATE communities SET name=?,description=?,rules=?,color=?,avatar=?,banner=? WHERE id=?'),

  /* reports */
  rpInsert:  db.prepare('INSERT INTO reports(id,reporter_id,post_id,comment_id,reason) VALUES(?,?,?,?,?)'),
  rpAll:     db.prepare("SELECT r.*,u.username as rname FROM reports r JOIN users u ON r.reporter_id=u.id WHERE r.status='pending' ORDER BY r.created_at DESC LIMIT 50"),
  rpResolve: db.prepare('UPDATE reports SET status=? WHERE id=?'),

  /* reset tokens */
  rtInsert:  db.prepare('INSERT INTO reset_tokens(token,user_id,expires_at) VALUES(?,?,?)'),
  rtGet:     db.prepare('SELECT * FROM reset_tokens WHERE token=? AND used=0 AND expires_at>unixepoch()'),
  rtUse:     db.prepare('UPDATE reset_tokens SET used=1 WHERE token=?'),
  rtClean:   db.prepare('DELETE FROM reset_tokens WHERE expires_at<unixepoch() OR used=1'),

  /* admin */
  adminStats: db.prepare("SELECT (SELECT COUNT(*) FROM users) as users,(SELECT COUNT(*) FROM posts) as posts,(SELECT COUNT(*) FROM comments) as comments,(SELECT COUNT(*) FROM communities) as communities,(SELECT COUNT(*) FROM reports WHERE status='pending') as reports"),
};

/* ── Seed ── */
const SECRET = 'ideahub_secret_2025';
function hmac(s) { return crypto.createHmac('sha256', SECRET).update(s).digest('hex'); }

(function seed() {
  const SYS = 'u_system';
  if (!Q.uById.get(SYS)) {
    Q.uInsert.run(SYS, 'ideahub', 'IdeaHub', 'system@ideahub.uz', hmac('_sys_'), '#C8922A');
    db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(SYS);
  }
  const COMS = [
    { id:'c_tech',  slug:'texnologiya', name:'Texnologiya', desc:"IT, dasturlash, AI haqida.",        color:'#4D8FFF' },
    { id:'c_sport', slug:'sport',       name:'Sport',       desc:"Futbol, kurash, boks va boshqalar.", color:'#46C97A' },
    { id:'c_uzb',   slug:'ozbekiston',  name:"O'zbekiston", desc:"Vatanimiz haqida.",                  color:'#C8922A' },
    { id:'c_music', slug:'musiqa',      name:'Musiqa',      desc:"O'zbek va jahon musiqasi.",          color:'#9B6FD4' },
    { id:'c_ilm',   slug:'ilm',         name:'Ilm-Fan',     desc:"Fan, ta'lim, kitoblar.",             color:'#3AADCC' },
    { id:'c_kulgu', slug:'kulgu',       name:'Kulgu',       desc:"Kulgili kontent, hazillar.",         color:'#E8703A' },
  ];
  for (const c of COMS) {
    if (!Q.comById.get(c.id)) {
      Q.comInsert.run(c.id, c.slug, c.name, c.desc, c.color, SYS);
    }
  }
})();

module.exports = { db, Q, hmac, SECRET };