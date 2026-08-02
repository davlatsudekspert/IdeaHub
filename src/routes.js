'use strict';
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const { Q, hmac } = require('./db');
const { verifyToken, makeToken, uid } = require('./helpers');
const ws = require('./ws');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD   = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD)) fs.mkdirSync(UPLOAD, { recursive: true });

/* ── helpers ── */
function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function getAuth(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  return tok ? verifyToken(tok) : null;
}
// Returns user id if authed and not banned, else sends error and returns null
async function getAuthNotBanned(req, res) {
  const u2 = getAuth(req);
  if (!u2) { json(res, { error: 'Unauthorized' }, 401); return null; }
  const user = await Q.uById(u2);
  if (!user) { json(res, { error: 'Topilmadi' }, 404); return null; }
  if (user.is_banned) { json(res, { error: `Hisob bloklangan: ${user.ban_reason || ''}`, banned: true }, 403); return null; }
  return u2;
}
async function readBody(req) {
  return new Promise((ok, err) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } });
    req.on('error', err);
  });
}
async function parseMultipart(req) {
  return new Promise((ok, err) => {
    const ct = req.headers['content-type'] || '';
    const bm = ct.match(/boundary=(.+)/);
    if (!bm) return ok({ fields: {}, files: {} });
    const boundary = Buffer.from('--' + bm[1]);
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('error', err);
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const parts = [];
      let start = 0;
      while (true) {
        const idx = body.indexOf(boundary, start);
        if (idx === -1) break;
        if (start > 0) parts.push(body.slice(start, idx - 2));
        start = idx + boundary.length + 2;
      }
      const fields = {};
      const files  = {};
      for (const part of parts) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const header = part.slice(0, headerEnd).toString();
        const data   = part.slice(headerEnd + 4);
        const nameM  = header.match(/name="([^"]+)"/);
        const fileM  = header.match(/filename="([^"]+)"/);
        const ctM    = header.match(/Content-Type: (.+)/);
        if (!nameM) continue;
        const name = nameM[1];
        if (fileM && data.length > 0) {
          const filename = fileM[1];
          const ext = path.extname(filename).toLowerCase() || '.bin';
          files[name] = { data, ext, mime: (ctM ? ctM[1].trim() : 'application/octet-stream'), filename };
        } else {
          fields[name] = data.toString().trim();
        }
      }
      ok({ fields, files });
    });
  });
}
function saveFile(fileObj, allowedExts) {
  if (!fileObj || !fileObj.data || fileObj.data.length === 0) return null;
  const ext = fileObj.ext.toLowerCase();
  if (allowedExts && !allowedExts.includes(ext)) return null;
  const fn = uid() + ext;
  fs.writeFileSync(path.join(UPLOAD, fn), fileObj.data);
  return `/uploads/${fn}`;
}
function ago(ts) {
  const d = Math.floor(Date.now()/1000) - ts;
  if (d < 60) return d + 's';
  if (d < 3600) return Math.floor(d/60) + 'm';
  if (d < 86400) return Math.floor(d/3600) + 's';
  return Math.floor(d/86400) + 'k';
}
async function fmtPost(p, uid2) {
  const myVote = uid2 ? (await Q.pvGet(uid2, p.id))?.vote || 0 : 0;
  const saved  = uid2 ? !!(await Q.svCheck(uid2, p.id)) : false;
  // Add poll if exists
  let poll = null;
  try {
    const pollRow = await Q.pollGet(p.id);
    if (pollRow) {
      const options = JSON.parse(pollRow.options);
      const counts  = await Q.pollVoteCnt(pollRow.id);
      const total   = (await Q.pollTotalVotes(pollRow.id)).c;
      const myVoteIdx = uid2 ? (await Q.pollVoteGet(uid2, pollRow.id))?.option_index ?? -1 : -1;
      const countsMap = {};
      counts.forEach(r => { countsMap[r.option_index] = r.cnt; });
      poll = {
        id: pollRow.id,
        question: pollRow.question,
        options: options.map((opt, i) => ({
          text: opt,
          votes: countsMap[i] || 0,
          pct: total > 0 ? Math.round((countsMap[i]||0)/total*100) : 0
        })),
        total,
        my_vote: myVoteIdx,
        ends_at: pollRow.ends_at,
        ended: pollRow.ends_at < Math.floor(Date.now()/1000)
      };
    }
  } catch {}
  return { ...p, my_vote: myVote, saved, poll, ago: ago(p.created_at) };
}
async function fmtCmt(c, uid2) {
  const myVote = uid2 ? (await Q.cvGet(uid2, c.id))?.vote || 0 : 0;
  return { ...c, my_vote: myVote, ago: ago(c.created_at) };
}
function fmtNotif(n) {
  return { ...n, ago: ago(n.created_at) };
}

/* ── notify followers when user posts ── */
async function notifyFollowers(posterId, post) {
  try {
    const followers = await Q.fwFollowersList(posterId);
    const poster = await Q.uById(posterId);
    if (!poster || !followers.length) return;
    for (const { follower_id } of followers) {
      const nid = uid();
      await Q.nInsert(nid, follower_id, posterId, 'new_post', post.id, null,
        `${poster.name} yangi post qo'shdi: ${post.title.slice(0,50)}`);
      ws.sendTo(follower_id, {
        type: 'notif',
        data: {
          id: nid, type: 'new_post', post_id: post.id,
          msg: `${poster.name} yangi post qo'shdi: ${post.title.slice(0,40)}`,
          fn: poster.name, fa: poster.avatar, fc: poster.color,
          is_read: 0, ago: 'Hozir'
        }
      });
    }
  } catch(e) { console.error('notifyFollowers:', e.message); }
}

async function route(req, res) {
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname.replace(/\/$/, '') || '/';
  const q = parsed.query;
  const m = req.method;

  /* ══ AUTH ══ */
  if (p === '/api/auth/register' && m === 'POST') {
    const b = await readBody(req);
    const { username, name, email, password } = b;
    if (!username || !name || !email || !password) return json(res, { error: "Barcha maydonlarni to'ldiring" }, 400);
    if (password.length < 6) return json(res, { error: 'Parol kamida 6 belgi' }, 400);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return json(res, { error: 'Username: 3-20 belgi, faqat harf/raqam/_' }, 400);
    if (await Q.uExists(username, email)) return json(res, { error: 'Bu username yoki email band' }, 409);
    const id = uid();
    await Q.uInsert(id, username.toLowerCase(), name, email.toLowerCase(), hmac(password), '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0'));
    return json(res, { token: makeToken(id), user: await Q.uById(id) }, 201);
  }
  if (p === '/api/auth/login' && m === 'POST') {
    const b = await readBody(req);
    const { username, password } = b;
    if (!username || !password) return json(res, { error: 'Login va parolni kiriting' }, 400);
    const user = await Q.uByLogin(username);
    if (!user || user.pass !== hmac(password)) return json(res, { error: "Noto'g'ri login yoki parol" }, 401);
    if (user.is_banned) return json(res, { error: `Hisob bloklangan: ${user.ban_reason || ''}` }, 403);
    return json(res, { token: makeToken(user.id), user: await Q.uById(user.id) });
  }
  if (p === '/api/auth/forgot' && m === 'POST') {
    const b = await readBody(req);
    const uname = (b.username || '').trim().toLowerCase();
    if (!uname) return json(res, { error: 'Username kiriting' }, 400);
    await Q.rtClean();
    const user = await Q.uByUsername(uname);
    if (user) {
      const token = require('crypto').randomBytes(32).toString('hex');
      await Q.rtInsert(token, user.id, Math.floor(Date.now()/1000) + 3600);
      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      console.log('\n=== PAROL TIKLASH ===\nFoydalanuvchi:', user.username, '\nHavola:', `${appUrl}/?reset_token=${token}\n`);
    }
    return json(res, { ok: true });
  }
  if (p === '/api/auth/reset/verify' && m === 'POST') {
    const b = await readBody(req);
    const rt = await Q.rtGet(b.token || '');
    if (!rt) return json(res, { valid: false });
    const user = await Q.uById(rt.user_id);
    return json(res, { valid: true, username: user?.username || '' });
  }
  if (p === '/api/auth/reset' && m === 'POST') {
    const b = await readBody(req);
    if (!b.token || !b.new_pass) return json(res, { error: 'Token va yangi parol kerak' }, 400);
    if (b.new_pass.length < 6) return json(res, { error: 'Parol kamida 6 belgi' }, 400);
    const rt = await Q.rtGet(b.token);
    if (!rt) return json(res, { error: "Havola eskirgan yoki noto'g'ri" }, 400);
    await Q.uUpdPass(hmac(b.new_pass), rt.user_id);
    await Q.rtUse(b.token);
    return json(res, { ok: true });
  }

  /* ══ ME ══ */
  if (p === '/api/me' && m === 'GET') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const user = await Q.uById(u2); if (!user) return json(res, { error: 'Topilmadi' }, 404);
    const followers = (await Q.fwFollowers(u2)).c;
    const following = (await Q.fwFollowing(u2)).c;
    return json(res, { ...user, followers, following });
  }
  if (p === '/api/me' && m === 'PUT') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    await Q.uUpdProf((b.name || '').trim(), (b.bio || '').trim(), u2);
    return json(res, await Q.uById(u2));
  }
  if (p === '/api/me/avatar' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const { files } = await parseMultipart(req);
    const img = saveFile(files.image, ['.jpg','.jpeg','.png','.gif','.webp']);
    if (!img) return json(res, { error: 'Rasm yuklanmadi' }, 400);
    await Q.uUpdAv(img, u2);
    return json(res, { avatar: img });
  }
  if (p === '/api/me/banner' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const { files } = await parseMultipart(req);
    const img = saveFile(files.image, ['.jpg','.jpeg','.png','.gif','.webp']);
    if (!img) return json(res, { error: 'Rasm yuklanmadi' }, 400);
    await Q.uUpdBanner(img, u2);
    return json(res, { banner: img });
  }
  if (p === '/api/me/password' && m === 'PUT') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    const user = await Q.uByIdFull(u2);
    if (!user || user.pass !== hmac(b.old_pass || '')) return json(res, { error: "Eski parol noto'g'ri" }, 400);
    if (!b.new_pass || b.new_pass.length < 6) return json(res, { error: 'Yangi parol kamida 6 belgi' }, 400);
    await Q.uUpdPass(hmac(b.new_pass), u2);
    return json(res, { ok: true });
  }
  if (p === '/api/me/push-token' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    if (b.token) await Q.pushIns(u2, b.token);
    return json(res, { ok: true });
  }
  if (p === '/api/me/push-token' && m === 'DELETE') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    if (b.token) await Q.pushDel(u2, b.token);
    return json(res, { ok: true });
  }

  /* ══ USERS ══ */
  if (p.match(/^\/api\/users\/[^/]+$/) && m === 'GET') {
    const u2 = getAuth(req);
    const param = p.split('/')[3];
    const user  = await Q.uBySlug(param);
    if (!user) return json(res, { error: 'Topilmadi' }, 404);
    const postRows = await Q.pByUser(user.id);
    const posts = [];
    for (const r of postRows) posts.push(await fmtPost(r, u2));
    const followers = (await Q.fwFollowers(user.id)).c;
    const following = (await Q.fwFollowing(user.id)).c;
    const is_following = u2 ? !!(await Q.fwCheck(u2, user.id)) : false;
    const is_me = u2 === user.id;
    return json(res, { ...user, posts, followers, following, is_following, is_me, online: ws.isOnline(user.id) });
  }
  if (p.match(/^\/api\/users\/search$/) && m === 'GET') {
    const sq = (q.q || '').toLowerCase();
    const users = await Q.uSearch('%'+sq+'%', '%'+sq+'%');
    return json(res, users);
  }
  if (p.match(/^\/api\/users\/[^/]+\/follow$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const param = p.split('/')[3];
    const target = await Q.uBySlug(param);
    if (!target || target.id === u2) return json(res, { error: 'Ruxsat' }, 400);
    const isFollowing = !!(await Q.fwCheck(u2, target.id));
    if (isFollowing) {
      await Q.fwDelete(u2, target.id);
      await Q.uFollowers(target.id);
      return json(res, { following: false });
    }
    await Q.fwInsert(u2, target.id);
    await Q.uFollowers(target.id);
    const from = await Q.uById(u2);
    const nid  = uid();
    await Q.nInsert(nid, target.id, u2, 'follow', null, null, `${from.name} sizni kuzata boshladi`);
    ws.sendTo(target.id, {
      type: 'notif',
      data: {
        id: nid, type: 'follow', from_id: u2,
        msg: `${from.name} sizni kuzata boshladi`,
        fn: from.name, fa: from.avatar, fc: from.color,
        is_read: 0, ago: 'Hozir'
      }
    });
    return json(res, { following: true });
  }

  /* ══ COMMUNITIES ══ */
  if (p === '/api/communities' && m === 'GET') {
    const u2 = getAuth(req);
    const sq = q.q ? q.q.toLowerCase() : null;
    const coms = sq ? await Q.comSearch('%'+sq+'%','%'+sq+'%') : await Q.comAll();
    const out = [];
    for (const c of coms) {
      out.push({
        ...c,
        is_member: u2 ? !!(await Q.memCheck(u2, c.id)) : false,
        is_owner: u2 === c.owner_id
      });
    }
    return json(res, out);
  }
  if (p.match(/^\/api\/communities\/[^/]+$/) && m === 'GET') {
    const u2 = getAuth(req);
    const slug = p.split('/')[3];
    const com  = await Q.comBySlug(slug);
    if (!com) return json(res, { error: 'Topilmadi' }, 404);
    return json(res, {
      ...com,
      is_member: u2 ? !!(await Q.memCheck(u2, com.id)) : false,
      is_owner: u2 === com.owner_id
    });
  }
  if (p === '/api/communities' && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const b = await readBody(req);
    const slug = (b.slug || '').toLowerCase().trim().replace(/\s+/g,'-');
    const name = (b.name || '').trim();
    if (!slug || !/^[a-z0-9_-]{2,32}$/.test(slug)) return json(res, { error: "Slug: 2-32 belgi, faqat kichik harf/raqam/_/-" }, 400);
    if (!name) return json(res, { error: "Nom kiritng" }, 400);
    if (await Q.comBySlug(slug)) return json(res, { error: 'Bu slug band' }, 409);
    const cid = uid();
    await Q.comInsert(cid, slug, name, (b.description||'').trim(), (b.color||'#C8922A'), u2);
    await Q.memJoin(u2, cid);
    await Q.comIncMem(cid);
    return json(res, await Q.comById(cid), 201);
  }
  if (p.match(/^\/api\/communities\/[^/]+$/) && m === 'DELETE') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const slug = p.split('/')[3];
    const com  = await Q.comBySlug(slug);
    if (!com) return json(res, { error: 'Topilmadi' }, 404);
    const user = await Q.uById(u2);
    if (com.owner_id !== u2 && !user?.is_admin) return json(res, { error: "Ruxsat yo'q" }, 403);
    await Q.comDelete(com.id);
    ws.sendAll({ type: 'com_deleted', data: { slug } });
    return json(res, { ok: true });
  }

  if (p.match(/^\/api\/communities\/[^/]+$/) && m === 'PUT') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const slug = p.split('/')[3];
    const com = await Q.comBySlug(slug);
    if (!com) return json(res, { error: 'Topilmadi' }, 404);
    const user = await Q.uById(u2);
    if (com.owner_id !== u2 && !user?.is_admin) return json(res, { error: "Ruxsat yo'q" }, 403);
    const ct = req.headers['content-type'] || '';
    let name = com.name, desc = com.description, rules = com.rules, color = com.color;
    let avatar = com.avatar, banner = com.banner;
    if (ct.includes('multipart')) {
      const { fields, files } = await parseMultipart(req);
      name  = (fields.name  || com.name).trim();
      desc  = (fields.description || com.description || '').trim();
      rules = (fields.rules || com.rules || '').trim();
      color = fields.color || com.color;
      if (files.avatar) { const r = saveFile(files.avatar,['.jpg','.jpeg','.png','.webp']); if(r) avatar=r; }
      if (files.banner) { const r = saveFile(files.banner,['.jpg','.jpeg','.png','.webp']); if(r) banner=r; }
    } else {
      const b = await readBody(req);
      name  = (b.name  || com.name).trim();
      desc  = (b.description || com.description || '').trim();
      rules = (b.rules || com.rules || '').trim();
      color = b.color || com.color;
    }
    try {
      await Q.comUpdateFull(name, desc, rules, color, avatar||null, banner||null, com.id);
    } catch {
      await Q.comUpdate(name, desc, rules, color, com.id);
    }
    return json(res, await Q.comBySlug(slug));
  }
  if (p.match(/^\/api\/communities\/[^/]+\/join$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const slug = p.split('/')[3];
    const com  = await Q.comBySlug(slug);
    if (!com) return json(res, { error: 'Topilmadi' }, 404);
    const isMem = !!(await Q.memCheck(u2, com.id));
    if (isMem) { await Q.memLeave(u2, com.id); await Q.comDecMem(com.id); return json(res, { joined: false }); }
    await Q.memJoin(u2, com.id); await Q.comIncMem(com.id);
    return json(res, { joined: true });
  }

  /* ══ POSTS ══ */
  if (p === '/api/posts' && m === 'GET') {
    const u2   = getAuth(req);
    const sort = q.sort || 'hot';
    const off  = parseInt(q.offset) || 0;
    let rows;
    if (sort === 'new')  rows = await Q.pNew(off);
    else if (sort === 'top') rows = await Q.pHot(off);
    else rows = await Q.pHot(off);
    const out = [];
    for (const r of rows) out.push(await fmtPost(r, u2));
    return json(res, out);
  }
  if (p === '/api/posts/saved' && m === 'GET') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const rows = await Q.pSaved(u2);
    const out = [];
    for (const r of rows) out.push(await fmtPost(r, u2));
    return json(res, out);
  }
  if (p.match(/^\/api\/posts\/[^/]+$/) && m === 'GET') {
    const u2   = getAuth(req);
    const post = await Q.pOne(p.split('/')[3]);
    if (!post) return json(res, { error: 'Topilmadi' }, 404);
    const cm = await Q.cmByPost(post.id);
    const comments = [];
    for (const c of cm) comments.push(await fmtCmt(c, u2));
    return json(res, { ...await fmtPost(post, u2), comments });
  }
  if (p === '/api/posts' && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const ct = req.headers['content-type'] || '';
    let title='', body='', comSlug='', type='text', link=null, image=null, video=null, audio=null, flair=null;
    let pollQuestion=null, pollOptions=null, pollDays=3;

    if (ct.includes('multipart')) {
      const { fields, files } = await parseMultipart(req);
      title    = (fields.title    || '').trim();
      body     = (fields.body     || '').trim();
      comSlug  = (fields.community|| '').trim();
      type     = fields.type || 'text';
      link     = fields.link || null;
      flair    = fields.flair || null;
      pollQuestion = fields.poll_question || null;
      pollOptions  = fields.poll_options  ? JSON.parse(fields.poll_options) : null;
      pollDays     = parseInt(fields.poll_days) || 3;
      if (files.image) { image = saveFile(files.image,['.jpg','.jpeg','.png','.gif','.webp']); type='image'; }
      if (files.video) {
        const vfile = files.video;
        // Check size limit: 500MB
        if (vfile.data.length > 500*1024*1024) return json(res, { error: "Video 500MB dan oshmasin" }, 400);
        video = saveFile(files.video,['.mp4','.webm','.mov','.avi','.mkv']); type='video';
      }
      if (files.audio) { audio = saveFile(files.audio,['.mp3','.wav','.ogg','.m4a','.webm']); type='audio'; }
    } else {
      const b  = await readBody(req);
      title    = (b.title    || '').trim();
      body     = (b.body     || '').trim();
      comSlug  = (b.community|| '').trim();
      type     = b.type || 'text';
      link     = b.link || null;
      flair    = b.flair || null;
      pollQuestion = b.poll_question || null;
      pollOptions  = b.poll_options  || null;
      pollDays     = parseInt(b.poll_days) || 3;
    }
    if (!title)   return json(res, { error: 'Sarlavha kerak' }, 400);
    if (!comSlug) return json(res, { error: 'Jamoa tanlang' }, 400);
    const com = await Q.comBySlug(comSlug);
    if (!com) return json(res, { error: 'Jamoa topilmadi' }, 404);

    const pid = uid();
    await Q.pInsert(pid, u2, com.id, title, body, link, image, video, audio, type, flair);
    await Q.pScore(1,1,0,pid);
    await Q.pvUpsert(u2, pid, 1);
    await Q.uKarma(1, u2);

    // Poll
    if (pollQuestion && Array.isArray(pollOptions) && pollOptions.length >= 2) {
      const polid = uid();
      const endsAt = Math.floor(Date.now()/1000) + pollDays*86400;
      await Q.pollInsert(polid, pid, pollQuestion.trim(), JSON.stringify(pollOptions.slice(0,10).map(o=>String(o).trim())), pollDays, endsAt);
    }

    const post = await fmtPost(await Q.pOne(pid), u2);
    ws.sendAll({ type: 'new_post', data: post });
    // Notify followers
    await notifyFollowers(u2, post);
    return json(res, post, 201);
  }
  if (p.match(/^\/api\/posts\/[^/]+$/) && m === 'DELETE') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const pid = p.split('/')[3];
    const own = await Q.pOwner(pid); if (!own) return json(res, { error: 'Topilmadi' }, 404);
    const user = await Q.uById(u2);
    if (own.user_id !== u2 && !user?.is_admin) return json(res, { error: "Ruxsat yo'q" }, 403);
    await Q.pDelete(pid);
    ws.sendAll({ type: 'del_post', data: { id: pid } });
    return json(res, { ok: true });
  }
  if (p.match(/^\/api\/posts\/[^/]+\/vote$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const pid  = p.split('/')[3];
    const own  = await Q.pOwner(pid); if (!own) return json(res, { error: 'Topilmadi' }, 404);
    const b    = await readBody(req);
    const vote = parseInt(b.vote);
    if (![1,-1].includes(vote)) return json(res, { error: 'Vote 1 yoki -1' }, 400);
    const ex = await Q.pvGet(u2, pid);
    let myVote = vote;
    if (ex && ex.vote === vote) { await Q.pvDelete(u2, pid); myVote = 0; }
    else await Q.pvUpsert(u2, pid, vote);
    const c = await Q.pvCount(pid);
    const score = c.up - c.dn;
    await Q.pScore(score, c.up, c.dn, pid);
    if (vote === 1 && own.user_id !== u2) await Q.uKarma(1, own.user_id);
    return json(res, { score, my_vote: myVote, upvotes: c.up, downvotes: c.dn });
  }
  if (p.match(/^\/api\/posts\/[^/]+\/save$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const pid = p.split('/')[3];
    const saved = !!(await Q.svCheck(u2, pid));
    if (saved) { await Q.svDelete(u2, pid); return json(res, { saved: false }); }
    await Q.svInsert(u2, pid); return json(res, { saved: true });
  }

  /* ══ POLL VOTE ══ */
  if (p.match(/^\/api\/polls\/[^/]+\/vote$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const pollId = p.split('/')[3];
    const b = await readBody(req);
    const optIdx = parseInt(b.option);
    const poll = await Q.pollGetById(pollId);
    if (!poll) return json(res, { error: "So'rovnoma topilmadi" }, 404);
    if (poll.ends_at < Math.floor(Date.now()/1000)) return json(res, { error: "So'rovnoma tugagan" }, 400);
    const opts = JSON.parse(poll.options);
    if (optIdx < 0 || optIdx >= opts.length) return json(res, { error: "Noto'g'ri variant" }, 400);
    const existing = await Q.pollVoteGet(u2, pollId);
    if (existing) return json(res, { error: "Allaqachon ovoz berdingiz" }, 400);
    await Q.pollVoteIns(u2, pollId, optIdx);
    const counts  = await Q.pollVoteCnt(pollId);
    const total   = (await Q.pollTotalVotes(pollId)).c;
    const countsMap = {};
    counts.forEach(r => { countsMap[r.option_index] = r.cnt; });
    return json(res, {
      options: opts.map((opt,i) => ({ text: opt, votes: countsMap[i]||0, pct: total > 0 ? Math.round((countsMap[i]||0)/total*100) : 0 })),
      total,
      my_vote: optIdx
    });
  }

  /* ══ COMMUNITY POSTS ══ */
  if (p.match(/^\/api\/communities\/[^/]+\/posts$/) && m === 'GET') {
    const u2   = getAuth(req);
    const slug = p.split('/')[3];
    const sort = q.sort || 'hot';
    const off  = parseInt(q.offset) || 0;
    const rows = sort === 'new' ? await Q.pComNew(slug, off) : await Q.pCom(slug, off);
    const out = [];
    for (const r of rows) out.push(await fmtPost(r, u2));
    return json(res, out);
  }

  /* ══ COMMENTS ══ */
  if (p.match(/^\/api\/posts\/[^/]+\/comments$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const pid = p.split('/')[3];
    const post = await Q.pOne(pid); if (!post) return json(res, { error: 'Topilmadi' }, 404);
    const b = await readBody(req);
    const body = (b.body || '').trim();
    if (!body) return json(res, { error: 'Izoh bo\'sh bo\'lmasin' }, 400);
    const parentId = b.parent_id || null;
    const depth = parentId ? ((await Q.cmDepth(parentId))?.depth || 0) + 1 : 0;
    const cid = uid();
    await Q.cmInsert(cid, pid, u2, parentId, body, depth);
    await Q.pIncCmt(pid);
    await Q.uKarma(1, u2);
    const comment = await fmtCmt(await Q.cmOne(cid), u2);
    ws.sendAll({ type: 'new_comment', data: { postId: pid, comment } });
    const from = await Q.uById(u2);
    // Notify post owner
    if (post.user_id !== u2) {
      const nid = uid();
      await Q.nInsert(nid, post.user_id, u2, 'comment', pid, cid, `${from.name} postingizga izoh qoldirdi`);
      ws.sendTo(post.user_id, { type: 'notif', data: { id: nid, type: 'comment', post_id: pid, msg: `${from.name} postingizga izoh qoldirdi`, fn: from.name, fa: from.avatar, fc: from.color, is_read: 0, ago: 'Hozir' } });
    }
    // Notify parent comment owner
    if (parentId) {
      const parentOwner = await Q.cmOwner(parentId);
      if (parentOwner && parentOwner.user_id !== u2 && parentOwner.user_id !== post.user_id) {
        const nid = uid();
        await Q.nInsert(nid, parentOwner.user_id, u2, 'reply', pid, cid, `${from.name} izohingizga javob qoldirdi`);
        ws.sendTo(parentOwner.user_id, { type: 'notif', data: { id: nid, type: 'reply', post_id: pid, msg: `${from.name} izohingizga javob qoldirdi`, fn: from.name, fa: from.avatar, fc: from.color, is_read: 0, ago: 'Hozir' } });
      }
    }
    return json(res, comment, 201);
  }
  if (p.match(/^\/api\/comments\/[^/]+\/vote$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const cid = p.split('/')[3];
    const b   = await readBody(req);
    const vote = parseInt(b.vote);
    if (![1,-1].includes(vote)) return json(res, { error: 'Vote 1 yoki -1' }, 400);
    const own = await Q.cmOwner(cid); if (!own) return json(res, { error: 'Topilmadi' }, 404);
    const ex  = await Q.cvGet(u2, cid);
    let myVote = vote;
    if (ex && ex.vote === vote) { await Q.cvDelete(u2, cid); myVote = 0; }
    else await Q.cvUpsert(u2, cid, vote);
    const c     = await Q.cvCount(cid);
    const score = c.up - c.dn;
    await Q.cmScore(score, cid);
    return json(res, { score, my_vote: myVote });
  }
  if (p.match(/^\/api\/comments\/[^/]+$/) && m === 'DELETE') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const cid = p.split('/')[3];
    const own = await Q.cmOwner(cid); if (!own) return json(res, { error: 'Topilmadi' }, 404);
    const user = await Q.uById(u2);
    if (own.user_id !== u2 && !user?.is_admin) return json(res, { error: "Ruxsat yo'q" }, 403);
    await Q.cmDelete(cid);
    ws.sendAll({ type: 'del_comment', data: { commentId: cid, postId: own.post_id } });
    return json(res, { ok: true });
  }

  /* ══ VOICE MESSAGE UPLOAD ══ */
  if (p === '/api/messages/voice' && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const { fields, files } = await parseMultipart(req);
    const toId = fields.to_id || fields.to;
    if (!toId) return json(res, { error: "Qabul qiluvchi ko'rsatilmagan" }, 400);
    const vf = files.voice || files.audio;
    if (!vf || !vf.data || vf.data.length === 0) return json(res, { error: 'Audio topilmadi' }, 400);
    const fn = uid() + '.webm';
    fs.writeFileSync(path.join(UPLOAD, fn), vf.data);
    const audioUrl = `/uploads/${fn}`;
    const duration = fields.duration || '0:00';
    const mid = uid();
    await Q.msgInsert(mid, u2, toId, '[Ovozli xabar]', 'voice', null, audioUrl, duration);
    const from = await Q.uById(u2);
    const msg = { id: mid, from_id: u2, to_id: toId, body: '[Ovozli xabar]',
      type: 'voice', audio_url: audioUrl, duration, is_read: 0, ago: 'Hozir',
      created_at: Math.floor(Date.now()/1000) };
    ws.sendTo(toId, { type: 'new_msg', data: { msg, from: { id: from.id, name: from.name, username: from.username, color: from.color, avatar: from.avatar } } });
    ws.sendTo(u2,   { type: 'msg_sent', data: { msg } });
    return json(res, msg, 201);
  }

  /* ══ IMAGE MESSAGE UPLOAD ══ */
  if (p === '/api/messages/image' && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const { fields, files } = await parseMultipart(req);
    const toId = fields.to_id || fields.to;
    if (!toId) return json(res, { error: "Qabul qiluvchi ko'rsatilmagan" }, 400);
    const imgFile = files.image;
    if (!imgFile || !imgFile.data || imgFile.data.length === 0) return json(res, { error: 'Rasm topilmadi' }, 400);
    const imgUrl = saveFile(imgFile, ['.jpg','.jpeg','.png','.gif','.webp']);
    if (!imgUrl) return json(res, { error: 'Yaroqsiz rasm formati' }, 400);
    const mid = uid();
    await Q.msgInsert(mid, u2, toId, '[Rasm]', 'image', imgUrl, null, null);
    const from = await Q.uById(u2);
    const msg = { id: mid, from_id: u2, to_id: toId, body: '[Rasm]',
      type: 'image', image_url: imgUrl, is_read: 0, ago: 'Hozir',
      created_at: Math.floor(Date.now()/1000) };
    ws.sendTo(toId, { type: 'new_msg', data: { msg, from: { id: from.id, name: from.name, username: from.username, color: from.color, avatar: from.avatar } } });
    ws.sendTo(u2,   { type: 'msg_sent', data: { msg } });
    return json(res, msg, 201);
  }

  /* ══ WEBRTC SIGNALING (REST fallback) ══ */
  if (p === '/api/call/offer' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    const from = await Q.uById(u2);
    ws.sendTo(b.to_id, { type: 'call_offer', data: {
      call_type: b.call_type || 'audio', offer: b.offer,
      from_id: u2, from_name: from.name, from_username: from.username,
      from_avatar: from.avatar, from_color: from.color
    }});
    return json(res, { ok: true });
  }
  if (p === '/api/call/answer' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    ws.sendTo(b.to_id, { type: 'call_answer', data: { answer: b.answer, from_id: u2 } });
    return json(res, { ok: true });
  }
  if (p === '/api/call/ice' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    ws.sendTo(b.to_id, { type: 'ice_candidate', data: { candidate: b.candidate, from_id: u2 } });
    return json(res, { ok: true });
  }
  if (p === '/api/call/end' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    ws.sendTo(b.to_id, { type: 'call_ended', data: { from_id: u2 } });
    return json(res, { ok: true });
  }
  if (p === '/api/call/reject' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    ws.sendTo(b.to_id, { type: 'call_rejected', data: { from_id: u2 } });
    return json(res, { ok: true });
  }

  /* ══ MESSAGES ══ */
  if (p === '/api/messages' && m === 'GET') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const rows = await Q.msgConvos(u2);
    const convos = [];
    for (const { oid } of rows) {
      const other = await Q.uById(oid);
      if (!other) continue;
      const last  = await Q.msgLast(u2, oid, oid, u2);
      const unread = (await Q.msgUnread(u2)).c;
      convos.push({ other: { ...other }, last: last ? { ...last, ago: ago(last.created_at) } : null, unread });
    }
    return json(res, convos);
  }
  if (p.match(/^\/api\/messages\/[^/]+$/) && m === 'GET') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const toId = p.split('/')[3];
    await Q.msgMarkRead(toId, u2);
    const msgs = await Q.msgThread(u2, toId, toId, u2);
    return json(res, msgs.map(m => ({ ...m, ago: ago(m.created_at) })));
  }
  if (p === '/api/messages' && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const b  = await readBody(req);
    const toId = b.to_id || b.to;
    if (!toId || !b.body?.trim()) return json(res, { error: "Xabar bo'sh" }, 400);
    const mid  = uid();
    const body = b.body.trim();
    await Q.msgInsert(mid, u2, toId, body, 'text', null, null, null);
    const from = await Q.uById(u2);
    const msg  = { id: mid, from_id: u2, to_id: toId, body, type:'text', is_read: 0, ago: 'Hozir', created_at: Math.floor(Date.now()/1000) };
    ws.sendTo(toId, { type: 'new_msg', data: { msg, from: { id: from.id, name: from.name, username: from.username, color: from.color, avatar: from.avatar } } });
    ws.sendTo(u2,   { type: 'msg_sent', data: { msg } });
    return json(res, msg, 201);
  }

  /* ══ NOTIFICATIONS ══ */
  if (p === '/api/notifications' && m === 'GET') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    return json(res, (await Q.nAll(u2)).map(fmtNotif));
  }
  if (p === '/api/notifications/read' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    await Q.nMarkRead(u2);
    return json(res, { ok: true });
  }
  if (p === '/api/notifications/count' && m === 'GET') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    return json(res, { count: (await Q.nUnread(u2)).c });
  }

  /* ══ SEARCH ══ */
  if (p === '/api/search' && m === 'GET') {
    const sq = (q.q || '').toLowerCase();
    if (!sq || sq.length < 2) return json(res, { posts: [], users: [], communities: [] });
    const u2 = getAuth(req);
    const type = q.type || 'all';
    let posts = [], users = [], coms = [];
    if (type==='all'||type==='posts') {
      const rows = await Q.pSearch('%'+sq+'%','%'+sq+'%');
      for (const r of rows) posts.push(await fmtPost(r,u2));
    }
    if (type==='all'||type==='users') users = await Q.uSearch('%'+sq+'%','%'+sq+'%');
    if (type==='all'||type==='communities') coms = await Q.comSearch('%'+sq+'%','%'+sq+'%');
    return json(res, { posts, users, communities: coms });
  }

  /* ══ REPORTS ══ */
  if (p === '/api/reports' && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const b  = await readBody(req);
    if (!b.reason?.trim()) return json(res, { error: 'Sabab kerak' }, 400);
    await Q.rpInsert(uid(), u2, b.post_id||null, b.comment_id||null, b.reason.trim());
    return json(res, { ok: true });
  }

  /* ══ ADMIN ══ */
  if (p === '/api/admin/stats' && m === 'GET') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const user = await Q.uById(u2); if (!user?.is_admin) return json(res, { error: "Ruxsat yo'q" }, 403);
    const stats = await Q.adminStats();
    const reports = (await Q.rpAll()).map(r => ({ ...r, ago: ago(r.created_at) }));
    const users = await Q.uAll();
    return json(res, { ...stats, reports, users });
  }
  if (p === '/api/admin/action' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const user = await Q.uById(u2); if (!user?.is_admin) return json(res, { error: "Ruxsat yo'q" }, 403);
    const b    = await readBody(req);
    if (b.action === 'ban')      await Q.uBan(b.reason||'', b.target_id);
    if (b.action === 'unban')    await Q.uUnban(b.target_id);
    if (b.action === 'makeAdmin')await Q.uMakeAdmin(b.target_id);
    if (b.action === 'remAdmin') await Q.uRemAdmin(b.target_id);
    return json(res, { ok: true });
  }
  if (p.match(/^\/api\/admin\/reports\/[^/]+$/) && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const user = await Q.uById(u2); if (!user?.is_admin) return json(res, { error: "Ruxsat yo'q" }, 403);
    const rid  = p.split('/')[4];
    const b    = await readBody(req);
    await Q.rpResolve(b.status || 'resolved', rid);
    return json(res, { ok: true });
  }

  return null;
}

module.exports = { route };
