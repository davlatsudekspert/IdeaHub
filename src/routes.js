'use strict';
const crypto = require('crypto');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const { Q, hmac, db } = require('./db');
const { verifyToken, makeToken, uid, randColor } = require('./helpers');
const ws = require('./ws');
const tg = require('./telegram');
const { APP_URL } = require('./config');

const { UPLOAD_DIR: UPLOAD } = require('./config');   // server.js bilan bitta papka
if (!fs.existsSync(UPLOAD)) fs.mkdirSync(UPLOAD, { recursive: true });
const tgPendingProfiles = new Map();

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
  if (user.is_banned) {
    if (user.ban_expires_at && Math.floor(Date.now()/1000) > user.ban_expires_at) {
      await Q.uUnban(u2);
    } else {
      const expText = user.ban_expires_at ? ` (${new Date(user.ban_expires_at*1000).toLocaleDateString('uz-UZ')} gacha)` : '';
      json(res, { error: `Hisob bloklangan: ${user.ban_reason || ''}${expText}`, banned: true }, 403); return null;
    }
  }
  return u2;
}
async function readBody(req) {
  return new Promise((ok, err) => {
    let d = '';
    let done = false;
    req.on('data', c => {
      d += c;
      if (d.length > 2e6 && !done) { done = true; req.destroy(); ok({}); }
    });
    req.on('end', () => { if (done) return; done = true; try { ok(JSON.parse(d || '{}')); } catch { ok({}); } });
    req.on('error', e => { if (!done) { done = true; err(e); } });
  });
}
// Eng katta ruxsat etilgan yuklama (video 500MB + zahira)
const MAX_UPLOAD = 520 * 1024 * 1024;

async function parseMultipart(req) {
  return new Promise((ok, err) => {
    const ct = req.headers['content-type'] || '';
    const bm = ct.match(/boundary=([^\s;]+)/);
    if (!bm) return ok({ fields: {}, files: {} });
    const boundary = Buffer.from('--' + bm[1].trim());
    let chunks = [];
    let total = 0;
    let aborted = false;
    req.on('data', c => {
      total += c.length;
      if (total > MAX_UPLOAD) {
        aborted = true;
        chunks = [];
        req.destroy();
        return ok({ fields: {}, files: {}, tooLarge: true });
      }
      chunks.push(c);
    });
    req.on('aborted', () => { if (!aborted) { aborted = true; ok({ fields: {}, files: {} }); } });
    req.on('error', e => { if (!aborted) err(e); });
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
      if (aborted) return;
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
// Xabar qabul qiluvchini tekshirish: mavjud bo'lishi va o'zi bo'lmasligi kerak
async function checkRecipient(res, fromId, toId) {
  if (!toId) { json(res, { error: "Qabul qiluvchi ko'rsatilmagan" }, 400); return false; }
  if (toId === fromId) { json(res, { error: "O'zingizga xabar yuborib bo'lmaydi" }, 400); return false; }
  const target = await Q.uById(toId);
  if (!target) { json(res, { error: 'Foydalanuvchi topilmadi' }, 404); return false; }
  return true;
}

function ago(ts) {
  const d = Math.floor(Date.now()/1000) - ts;
  if (d < 60) return d + 's';
  if (d < 3600) return Math.floor(d/60) + 'm';
  if (d < 86400) return Math.floor(d/3600) + 'soat';
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
  if (p === '/api/auth/telegram-login' && m === 'POST') {
    const b = await readBody(req);
    const { id, first_name, username, photo_url, auth_date, hash } = b;
    if (!id || !auth_date || !hash) return json(res, { error: "Ma'lumotlar to'liq emas" }, 400);
    if (!tg.hasTelegram) return json(res, { error: "Telegram bilan kirish sozlanmagan" }, 503);
    const check = tg.verifyLoginPayload(b);
    if (!check.ok) return json(res, { error: check.error || "Tekshiruvdan o'tmadi" }, 403);
    const tgId = String(id);
    let user = await Q.uByTgId(tgId);
    if (!user) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      tgPendingProfiles.set(tempToken, { tgId, first_name: first_name || '', username: username || '', photo_url: photo_url || '', expires: Date.now() + 300000 });
      return json(res, { needProfile: true, tempToken });
    }
    return json(res, { token: makeToken(user.id), user: await Q.uById(user.id) });
  }
  if (p === '/api/auth/telegram-finish' && m === 'POST') {
    const b = await readBody(req);
    const tempToken = b.tempToken || b.token;
    const { name, username } = b;
    if (!tempToken || !name || !username) return json(res, { error: "Ma'lumotlar to'liq emas" }, 400);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return json(res, { error: 'Username: 3-20 belgi, faqat harf/raqam/_' }, 400);
    for (const [k, v] of tgPendingProfiles) if (Date.now() > v.expires) tgPendingProfiles.delete(k);
    const pending = tgPendingProfiles.get(tempToken);
    if (!pending || Date.now() > pending.expires) return json(res, { error: "Sessiya tugagan. Qaytadan kirish kerak" }, 403);
    tgPendingProfiles.delete(tempToken);
    if (await Q.uByUsername(username)) return json(res, { error: 'Bu username band' }, 409);
    const newId = uid();
    const email = `tg_${pending.tgId}@mindhub.local`;
    await Q.uInsert(newId, username.toLowerCase(), name.trim(), email, crypto.randomBytes(32).toString('hex'), randColor());
    await Q.uSetTgId(pending.tgId, newId);
    if (pending.photo_url) await Q.uUpdAv(pending.photo_url, newId);
    return json(res, { token: makeToken(newId), user: await Q.uById(newId) });
  }
  if (p === '/api/auth/register' && m === 'POST') {
    const b = await readBody(req);
    const { username, name, email, password } = b;
    if (!username || !name || !email || !password) return json(res, { error: "Barcha maydonlarni to'ldiring" }, 400);
    if (password.length < 6) return json(res, { error: 'Parol kamida 6 belgi' }, 400);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return json(res, { error: 'Username: 3-20 belgi, faqat harf/raqam/_' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(res, { error: "Email manzil noto'g'ri" }, 400);
    if (name.trim().length < 2 || name.trim().length > 60) return json(res, { error: 'Ism 2-60 belgi bo\'lishi kerak' }, 400);
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
    if (user.is_banned) {
      if (user.ban_expires_at && Math.floor(Date.now()/1000) > user.ban_expires_at) { await Q.uUnban(user.id); }
      else { const expText = user.ban_expires_at ? ` (${new Date(user.ban_expires_at*1000).toLocaleDateString('uz-UZ')} gacha)` : ''; return json(res, { error: `Hisob bloklangan: ${user.ban_reason || ''}${expText}` }, 403); }
    }
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
      const appUrl = APP_URL;
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

  /* ══ EMAIL CODE RESET ══ */
  if (p === '/api/auth/send-code' && m === 'POST') {
    try {
      const b = await readBody(req);
      const uname = (b.username || '').trim().toLowerCase();
      if (!uname) return json(res, { error: 'Username kiriting' }, 400);
      try { await Q.vcClean(); } catch(e) { console.error('vcClean:', e.message); }
      const user = await Q.uByUsername(uname);
      if (!user || !user.email) return json(res, { error: 'Foydalanuvchi topilmadi' }, 404);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = Math.floor(Date.now() / 1000) + 600;
      await Q.vcInsert(user.id, code, expiresAt);
      let sent = false;
      try {
        const { sendVerifyCode } = require('./email');
        await sendVerifyCode(user.email, code, user.username);
        sent = true;
      } catch (e) {
        console.error('Email xatoligi:', e.message);
      }
      if (!sent) {
        try {
          const u2 = await db.get('SELECT tg_chat_id FROM users WHERE id=$1', [user.id]);
          if (u2 && u2.tg_chat_id) {
            const r = await tg.sendMessage(u2.tg_chat_id,
              `🔐 MindHub parol tiklash kodi: ${code}\n\nBu kod 10 daqiqa davomida amal qiladi.`);
            sent = !!(r && r.ok);
          }
        } catch (e) { console.error('TG fallback error:', e.message); }
      }
      return json(res, { ok: true, email: user.email.replace(/(.{2}).*(@.*)/, '$1***$2'), sent });
    } catch (e) {
      console.error('send-code xatoligi:', e.message, e.stack);
      return json(res, { error: 'Xatolik: ' + e.message }, 500);
    }
  }
  if (p === '/api/auth/verify-code' && m === 'POST') {
    const b = await readBody(req);
    if (!b.username || !b.code) return json(res, { error: 'Username va kod kerak' }, 400);
    const user = await Q.uByUsername(b.username.trim().toLowerCase());
    if (!user) return json(res, { error: 'Topilmadi' }, 404);
    const vc = await Q.vcGet(user.id, b.code.trim());
    if (!vc) return json(res, { error: "Kod noto'g'ri yoki muddati tugagan" }, 400);
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    await Q.rtInsert(resetToken, user.id, Math.floor(Date.now() / 1000) + 1800);
    await Q.vcUse(vc.id);
    return json(res, { ok: true, reset_token: resetToken, username: user.username });
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
    if (b.email) await db.run('UPDATE users SET email=$1 WHERE id=$2', [b.email.trim().toLowerCase(), u2]);
    return json(res, await Q.uById(u2));
  }
  if (p === '/api/me/phone' && m === 'PUT') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const b = await readBody(req);
    const phone = (b.phone || '').trim();
    if (!phone || !/^\+?\d{10,15}$/.test(phone)) return json(res, { error: 'Raqam formati: +998901234567' }, 400);
    await Q.uSetPhone(phone, u2);
    return json(res, { ok: true, phone });
  }
  if (p === '/api/me/avatar' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const { files, tooLarge } = await parseMultipart(req);
    if (tooLarge) return json(res, { error: 'Fayl juda katta' }, 413);
    if (files.image && files.image.data.length > 5 * 1024 * 1024) return json(res, { error: "Rasm 5MB dan oshmasin" }, 400);
    const img = saveFile(files.image, ['.jpg','.jpeg','.png','.gif','.webp']);
    if (!img) return json(res, { error: 'Rasm yuklanmadi (JPG, PNG, GIF, WEBP)' }, 400);
    await Q.uUpdAv(img, u2);
    return json(res, { avatar: img });
  }
  if (p === '/api/me/banner' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const { files, tooLarge } = await parseMultipart(req);
    if (tooLarge) return json(res, { error: 'Fayl juda katta' }, 413);
    if (files.image && files.image.data.length > 5 * 1024 * 1024) return json(res, { error: "Rasm 5MB dan oshmasin" }, 400);
    const img = saveFile(files.image, ['.jpg','.jpeg','.png','.gif','.webp']);
    if (!img) return json(res, { error: 'Rasm yuklanmadi (JPG, PNG, GIF, WEBP)' }, 400);
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
  if (p.match(/^\/api\/users\/search$/) && m === 'GET') {
    const sq = (q.q || '').toLowerCase();
    const users = await Q.uSearch('%'+sq+'%', '%'+sq+'%');
    return json(res, users);
  }
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
  /* Popular teams by views */
  if (p === '/api/communities/popular' && m === 'GET') {
    const u2 = getAuth(req);
    const coms = await Q.comByViews();
    const out = [];
    for (const c of coms) {
      const role = u2 ? await Q.comRoleGet(u2, c.id) : null;
      out.push({
        ...c,
        is_member: u2 ? !!(await Q.memCheck(u2, c.id)) : false,
        is_owner: u2 === c.owner_id,
        is_admin: !!(role && role.role === 'admin'),
        pending_request: u2 ? !!(await Q.comReqGet(u2, c.id)) : false
      });
    }
    return json(res, out);
  }
  /* My requests */
  if (p === '/api/communities/my-requests' && m === 'GET') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const reqs = await Q.comReqAll(u2);
    return json(res, reqs);
  }
  if (p === '/api/communities' && m === 'GET') {
    const u2 = getAuth(req);
    const sq = q.q ? q.q.toLowerCase() : null;
    let coms;
    if (sq)                 coms = await Q.comSearch('%'+sq+'%','%'+sq+'%');
    else if (q.mine && u2)  coms = await Q.comMine(u2);   // faqat o'z jamoalarim
    else                    coms = await Q.comAll();
    const out = [];
    for (const c of coms) {
      const isMember = u2 ? !!(await Q.memCheck(u2, c.id)) : false;
      if (c.is_private && !isMember && u2 !== c.owner_id) continue;
      const role = u2 ? await Q.comRoleGet(u2, c.id) : null;
      out.push({
        ...c,
        is_member: isMember,
        is_owner: u2 === c.owner_id,
        is_admin: !!(role && role.role === 'admin'),
        pending_request: u2 ? !!(await Q.comReqGet(u2, c.id)) : false
      });
    }
    return json(res, out);
  }
  if (p.match(/^\/api\/communities\/[^/]+$/) && m === 'GET') {
    const u2 = getAuth(req);
    const slug = p.split('/')[3];
    const com  = await Q.comBySlug(slug);
    if (!com) return json(res, { error: 'Topilmadi' }, 404);
    const isMember = u2 ? !!(await Q.memCheck(u2, com.id)) : false;
    if (com.is_private && !isMember && u2 !== com.owner_id) return json(res, { error: "Maxfiy jamoa" }, 403);
    await Q.comIncViews(com.id);
    const role = u2 ? await Q.comRoleGet(u2, com.id) : null;
    const admins = await Q.comRoleList(com.id);
    const pendingReqs = (u2 && (u2 === com.owner_id || (role && role.role === 'admin'))) ? await Q.comReqByCom(com.id) : [];
    return json(res, {
      ...com,
      views: (com.views || 0) + 1,
      is_member: u2 ? !!(await Q.memCheck(u2, com.id)) : false,
      is_owner: u2 === com.owner_id,
      is_admin: !!(role && role.role === 'admin'),
      pending_request: u2 ? !!(await Q.comReqGet(u2, com.id)) : false,
      admins,
      pending_requests: pendingReqs
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
    const is_private = b.is_private ? 1 : 0;
    await Q.comInsert(cid, slug, name, (b.description||'').trim(), (b.color||'#C8922A'), u2, is_private);
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
    const role = await Q.comRoleGet(u2, com.id);
    if (com.owner_id !== u2 && !user?.is_admin && !(role && role.role === 'admin')) return json(res, { error: "Ruxsat yo'q" }, 403);
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
    const role = await Q.comRoleGet(u2, com.id);
    if (com.owner_id !== u2 && !user?.is_admin && !(role && role.role === 'admin')) return json(res, { error: "Ruxsat yo'q" }, 403);
    const ct = req.headers['content-type'] || '';
    let name = com.name, desc = com.description, rules = com.rules, color = com.color;
    let avatar = com.avatar, banner = com.banner;
    let is_private = com.is_private;
    if (ct.includes('multipart')) {
      const { fields, files, tooLarge } = await parseMultipart(req);
      if (tooLarge) return json(res, { error: 'Fayl juda katta' }, 413);
      name  = (fields.name  || com.name).trim();
      desc  = (fields.description || com.description || '').trim();
      rules = (fields.rules || com.rules || '').trim();
      color = fields.color || com.color;
      if (fields.is_private !== undefined) is_private = fields.is_private === 'true' || fields.is_private === '1' ? 1 : 0;
      if (files.avatar) { const r = saveFile(files.avatar,['.jpg','.jpeg','.png','.webp']); if(r) avatar=r; }
      if (files.banner) { const r = saveFile(files.banner,['.jpg','.jpeg','.png','.webp']); if(r) banner=r; }
    } else {
      const b = await readBody(req);
      name  = (b.name  || com.name).trim();
      desc  = (b.description || com.description || '').trim();
      rules = (b.rules || com.rules || '').trim();
      color = b.color || com.color;
      if (b.is_private !== undefined) is_private = b.is_private ? 1 : 0;
    }
    try {
      await Q.comUpdateFull(name, desc, rules, color, avatar||null, banner||null, com.id);
    } catch {
      await Q.comUpdate(name, desc, rules, color, com.id);
    }
    if (is_private !== com.is_private) {
      await db.run('UPDATE communities SET is_private=$1 WHERE id=$2', [is_private, com.id]);
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
    if (com.is_private) {
      const existing = await Q.comReqGet(u2, com.id);
      if (existing) return json(res, { error: 'So\'rov allaqachon yuborilgan', pending: true });
      await Q.comReqInsert(uid(), u2, com.id);
      return json(res, { pending: true, message: 'So\'rov yuborildi, admin tasdiqlashi kerak' });
    }
    await Q.memJoin(u2, com.id); await Q.comIncMem(com.id);
    return json(res, { joined: true });
  }
  /* Community admin management */
  if (p.match(/^\/api\/communities\/[^/]+\/admin$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const slug = p.split('/')[3];
    const com = await Q.comBySlug(slug);
    if (!com) return json(res, { error: 'Topilmadi' }, 404);
    if (com.owner_id !== u2) return json(res, { error: "Faqat egasi admin tayyorlay oladi" }, 403);
    const b = await readBody(req);
    if (!b.user_id) return json(res, { error: 'user_id kerak' }, 400);
    await Q.comRoleSet(b.user_id, com.id, 'admin');
    return json(res, { ok: true });
  }
  if (p.match(/^\/api\/communities\/[^/]+\/admin$/) && m === 'DELETE') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const slug = p.split('/')[3];
    const com = await Q.comBySlug(slug);
    if (!com) return json(res, { error: 'Topilmadi' }, 404);
    if (com.owner_id !== u2) return json(res, { error: "Faqat egasi admin olib tashlay oladi" }, 403);
    const b = await readBody(req);
    if (!b.user_id) return json(res, { error: 'user_id kerak' }, 400);
    await Q.comRoleDel(b.user_id, com.id);
    return json(res, { ok: true });
  }
  /* Community request approve/reject */
  if (p.match(/^\/api\/communities\/[^/]+\/request\/[^/]+$/) && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const slug = p.split('/')[3];
    const reqId = p.split('/')[5];
    const com = await Q.comBySlug(slug);
    if (!com) return json(res, { error: 'Topilmadi' }, 404);
    const role = await Q.comRoleGet(u2, com.id);
    if (com.owner_id !== u2 && !(role && role.role === 'admin')) return json(res, { error: "Ruxsat yo'q" }, 403);
    const b = await readBody(req);
    if (b.action === 'approve') {
      await Q.comReqApprove(reqId);
      const request = await db.get('SELECT * FROM community_requests WHERE id=$1', [reqId]);
      if (request) {
        await Q.memJoin(request.user_id, com.id);
        await Q.comIncMem(com.id);
      }
    } else {
      await Q.comReqReject(reqId);
    }
    return json(res, { ok: true });
  }



  /* ══ POSTS ══ */
  if (p === '/api/posts' && m === 'GET') {
    const u2   = getAuth(req);
    const sort = q.sort || 'hot';
    const off  = parseInt(q.offset) || 0;
    let rows;
    if (sort === 'new')      rows = await Q.pNew(off);
    else if (sort === 'top') rows = await Q.pTop(off);   // eng ko'p ovoz olgan (barcha vaqt)
    else                     rows = await Q.pHot(off);   // ovoz + yangilik (trend)
    const out = [];
    for (const r of rows) {
      if (r.community_id) {
        const pc = await db.get('SELECT is_private FROM communities WHERE id=$1', [r.community_id]);
        if (pc && pc.is_private) {
          const isMember = u2 ? !!(await Q.memCheck(u2, r.community_id)) : false;
          if (!isMember) continue;
        }
      }
      out.push(await fmtPost(r, u2));
    }
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
    // Maxfiy jamoa posti faqat a'zolar/egasiga ko'rinadi
    const pcom = await db.get('SELECT is_private, owner_id FROM communities WHERE id=$1', [post.community_id]);
    if (pcom && pcom.is_private) {
      const isMember = u2 ? !!(await Q.memCheck(u2, post.community_id)) : false;
      if (!isMember && u2 !== pcom.owner_id) return json(res, { error: "Maxfiy jamoa posti" }, 403);
    }
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
      const { fields, files, tooLarge } = await parseMultipart(req);
      if (tooLarge) return json(res, { error: 'Fayl juda katta (maksimum 500MB)' }, 413);
      title    = (fields.title    || '').trim();
      body     = (fields.body     || '').trim();
      comSlug  = (fields.community|| '').trim();
      type     = fields.type || 'text';
      link     = fields.link || null;
      flair    = fields.flair || null;
      pollQuestion = fields.poll_question || null;
      pollOptions  = fields.poll_options  ? JSON.parse(fields.poll_options) : null;
      pollDays     = parseInt(fields.poll_days) || 3;
      if (files.image) {
        if (files.image.data.length > 10*1024*1024) return json(res, { error: "Rasm 10MB dan oshmasin" }, 400);
        image = saveFile(files.image,['.jpg','.jpeg','.png','.gif','.webp','.heic','.heif']);
        if (!image) return json(res, { error: 'Rasm formati qo\'llab-quvvatlanmaydi' }, 400);
        type='image';
      }
      if (files.video) {
        if (files.video.data.length > 500*1024*1024) return json(res, { error: "Video 500MB dan oshmasin" }, 400);
        video = saveFile(files.video,['.mp4','.webm','.mov','.avi','.mkv']);
        if (!video) return json(res, { error: 'Video formati qo\'llab-quvvatlanmaydi' }, 400);
        type='video';
      }
      if (files.audio) {
        if (files.audio.data.length > 20*1024*1024) return json(res, { error: "Audio 20MB dan oshmasin" }, 400);
        audio = saveFile(files.audio,['.mp3','.wav','.ogg','.m4a','.aac','.webm','.opus']);
        if (!audio) return json(res, { error: 'Audio formati qo\'llab-quvvatlanmaydi' }, 400);
        type='audio';
      }
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
    if (title.length > 300) return json(res, { error: 'Sarlavha 300 belgidan oshmasin' }, 400);
    if (body.length > 20000) return json(res, { error: 'Matn 20000 belgidan oshmasin' }, 400);
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
    const prev = ex ? ex.vote : 0;
    let myVote = vote;
    if (prev === vote) { await Q.pvDelete(u2, pid); myVote = 0; }
    else await Q.pvUpsert(u2, pid, vote);
    const c = await Q.pvCount(pid);
    const score = c.up - c.dn;
    await Q.pScore(score, c.up, c.dn, pid);
    // Karma faqat upvote qo'shilganda +1, olib tashlanganda -1 (ilgari ikkalasida ham +1 bo'lardi)
    if (own.user_id !== u2) {
      const delta = (myVote === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
      if (delta) await Q.uKarma(delta, own.user_id);
    }
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
    const com  = await Q.comBySlug(slug);
    if (com && com.is_private) {
      const isMember = u2 ? !!(await Q.memCheck(u2, com.id)) : false;
      if (!isMember && u2 !== com.owner_id) return json(res, { error: "Maxfiy jamoa, a'zo bo'ling" }, 403);
    }
    const rows = sort === 'new' ? await Q.pComNew(slug, off)
               : sort === 'top' ? await Q.pComTop(slug, off)
               : await Q.pCom(slug, off);
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
    if (body.length > 5000) return json(res, { error: 'Izoh 5000 belgidan oshmasin' }, 400);
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
    // Bolalar izohlarini ham hisobga olib o'chiramiz va sanoqni to'g'rilaymiz
    const kids = await db.all('SELECT id FROM comments WHERE parent_id=$1', [cid]);
    const ids = [cid, ...kids.map(k => k.id)];
    await db.run('DELETE FROM comment_votes WHERE comment_id = ANY($1::text[])', [ids]);
    await db.run('DELETE FROM comments WHERE id = ANY($1::text[]) OR parent_id=$2', [ids, cid]);
    await Q.pDecCmt(ids.length, own.post_id);
    await Q.uKarma(-1, own.user_id);
    ws.sendAll({ type: 'del_comment', data: { commentId: cid, postId: own.post_id } });
    return json(res, { ok: true });
  }

  /* ══ VOICE MESSAGE UPLOAD ══ */
  if (p === '/api/messages/voice' && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const { fields, files, tooLarge } = await parseMultipart(req);
    if (tooLarge) return json(res, { error: 'Fayl juda katta' }, 413);
    const toId = fields.to_id || fields.to;
    if (!(await checkRecipient(res, u2, toId))) return true;
    const vf = files.voice || files.audio;
    if (!vf || !vf.data || vf.data.length === 0) return json(res, { error: 'Audio topilmadi' }, 400);
    if (vf.data.length > 20 * 1024 * 1024) return json(res, { error: "Ovozli xabar 20MB dan oshmasin" }, 400);
    const audioUrl = saveFile(vf, ['.webm', '.ogg', '.mp3', '.m4a', '.wav', '.aac']);
    if (!audioUrl) return json(res, { error: 'Audio formati qo\'llab-quvvatlanmaydi' }, 400);
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
    const { fields, files, tooLarge } = await parseMultipart(req);
    if (tooLarge) return json(res, { error: 'Fayl juda katta' }, 413);
    const toId = fields.to_id || fields.to;
    if (!(await checkRecipient(res, u2, toId))) return true;
    const imgFile = files.image;
    if (!imgFile || !imgFile.data || imgFile.data.length === 0) return json(res, { error: 'Rasm topilmadi' }, 400);
    if (imgFile.data.length > 10 * 1024 * 1024) return json(res, { error: "Rasm 10MB dan oshmasin" }, 400);
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
      // Har bir suhbat uchun alohida o'qilmaganlar soni (ilgari umumiy son qaytarilardi)
      const unread = (await Q.msgUnreadFrom(oid, u2)).c;
      convos.push({ other: { ...other, online: ws.isOnline(oid) }, last: last ? { ...last, ago: ago(last.created_at) } : null, unread });
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
  if (p.match(/^\/api\/messages\/[^/]+$/) && m === 'DELETE') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const mid = p.split('/')[3];
    const msg = await db.get('SELECT id,from_id,to_id FROM messages WHERE id=$1', [mid]);
    if (!msg) return json(res, { error: 'Topilmadi' }, 404);
    if (msg.from_id !== u2) return json(res, { error: "Faqat o'z xabaringizni o'chirasiz" }, 403);
    await db.run('DELETE FROM messages WHERE id=$1', [mid]);
    ws.sendTo(msg.to_id, { type: 'del_msg', data: { id: mid } });
    ws.sendTo(u2,        { type: 'del_msg', data: { id: mid } });
    return json(res, { ok: true });
  }
  if (p === '/api/messages' && m === 'POST') {
    const u2 = await getAuthNotBanned(req, res); if (!u2) return true;
    const b  = await readBody(req);
    const toId = b.to_id || b.to;
    if (!b.body?.trim()) return json(res, { error: "Xabar bo'sh" }, 400);
    if (!(await checkRecipient(res, u2, toId))) return true;
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
    return json(res, { ...stats, user_count: stats.users, reports, users });
  }
  if (p === '/api/admin/action' && m === 'POST') {
    const u2 = getAuth(req); if (!u2) return json(res, { error: 'Unauthorized' }, 401);
    const user = await Q.uById(u2); if (!user?.is_admin) return json(res, { error: "Ruxsat yo'q" }, 403);
    const b    = await readBody(req);
    if (!b.target_id) return json(res, { error: 'target_id kerak' }, 400);
    if (b.target_id === u2 && ['ban','remAdmin'].includes(b.action)) {
      return json(res, { error: "O'zingizga bu amalni qo'llay olmaysiz" }, 400);
    }
    if (b.action === 'ban') {
      const tgt = await Q.uById(b.target_id);
      if (!tgt) return json(res, { error: 'Foydalanuvchi topilmadi' }, 404);
    }
    if (b.action === 'ban') {
      const dur = parseInt(b.duration) || 0;
      const expiresAt = dur > 0 ? Math.floor(Date.now()/1000) + dur * 86400 : null;
      await Q.uBan(b.reason||'', b.target_id, expiresAt);
    }
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

  /* ══ TELEGRAM PASSWORD RESET ══ */
  if (p === '/api/auth/tg-send-code' && m === 'POST') {
    const b = await readBody(req);
    const email = (b.email || '').trim().toLowerCase();
    if (!email) return json(res, { error: 'Email kerak' }, 400);
    const user = await db.get('SELECT id, username, name, email, tg_chat_id FROM users WHERE lower(email)=lower($1)', [email]);
    if (!user) return json(res, { error: 'Bu emailga bog\'langan akkaunt topilmadi' }, 404);
    await Q.tgCodeClean();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeId = uid();
    const expiresAt = Math.floor(Date.now()/1000) + 600;
    await Q.tgCodeInsert(codeId, user.id, email, code, expiresAt);
    if (!tg.hasTelegram) return json(res, { error: 'Telegram xizmati sozlanmagan' }, 503);
    if (!user.tg_chat_id) {
      return json(res, { error: "Bu akkaunt Telegram bilan bog'lanmagan. Avval @" + require('./config').TG_BOT_NAME + " botiga /start yuboring." }, 400);
    }
    {
      const r = await tg.sendMessage(user.tg_chat_id,
        `🔐 MindHub parol tiklash kodi: ${code}\n\nBu kod 10 daqiqa davomida amal qiladi.\n` +
        `Agar siz bu so'rovni yubormagan bo'lsangiz, xabarni e'tiborsiz qoldiring.`);
      if (!r || !r.ok) return json(res, { error: 'Telegramga yuborib bo\'lmadi' }, 502);
    }
    return json(res, { ok: true, message: 'Kod yuborildi. Telegramdan tekshiring.' });
  }
  if (p === '/api/auth/tg-verify-code' && m === 'POST') {
    const b = await readBody(req);
    const email = (b.email || '').trim().toLowerCase();
    const code = (b.code || '').trim();
    const newPass = (b.new_pass || '').trim();
    if (!email || !code) return json(res, { error: 'Email va kod kerak' }, 400);
    const user = await db.get('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
    if (!user) return json(res, { error: 'Foydalanuvchi topilmadi' }, 404);
    const codeRow = await Q.tgCodeGet(user.id, code);
    if (!codeRow) return json(res, { error: "Noto'g'ri kod yoki muddati tugagan" }, 400);
    if (newPass) {
      if (newPass.length < 6) return json(res, { error: 'Parol kamida 6 belgi' }, 400);
      await Q.uUpdPass(hmac(newPass), user.id);
      await Q.tgCodeUse(codeRow.id);
      return json(res, { ok: true, message: 'Parol yangilandi!' });
    }
    return json(res, { ok: true, verified: true });
  }

  return null;
}

module.exports = { route };
