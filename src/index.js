import { makeQ } from './db.js';
import { uid, now, hashPass, makeToken, verifyToken, getAuth, timeAgo, readBody, readForm, json, randColor, extOf, signTemp, verifyTemp } from './helpers.js';
import { categorize, matchOrCreateCluster, generateSolutions, tagPost } from './ai.js';
import { sendVerifyCode, hasEmail } from './email.js';
import { sendTo, isOnline } from './ws.js';
import { verifyLoginPayload, hasTelegram } from './telegram.js';

export { UserHub } from './durable/UserHub.js';

const IMG_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
const AUDIO_EXT = ['.webm', '.ogg', '.mp3', '.m4a', '.wav', '.aac'];
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
};

/* ═══ YORDAMCHI FUNKSIYALAR ═══ */

function ago(ts) { return timeAgo(ts); }

async function saveFileR2(env, file, allowedExts, maxBytes) {
  if (!file || !file.size) return null;
  const ext = extOf(file.name);
  if (allowedExts && !allowedExts.includes(ext)) return null;
  if (maxBytes && file.size > maxBytes) return { tooLarge: true };
  const key = 'uploads/' + uid() + ext;
  await env.UPLOADS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: MIME[ext] || file.type || 'application/octet-stream' },
  });
  return { url: '/' + key };
}

async function requireAuth(request, env) {
  const userId = getAuth(request, env.SECRET);
  if (!userId) return { error: json({ error: 'Unauthorized' }, 401) };
  return { userId };
}

async function requireAuthNotBanned(request, env, Q) {
  const userId = getAuth(request, env.SECRET);
  if (!userId) return { error: json({ error: 'Unauthorized' }, 401) };
  const user = await Q.uByIdFull(userId);
  if (!user) return { error: json({ error: 'Topilmadi' }, 404) };
  if (user.is_banned) {
    if (user.ban_expires_at && now() > user.ban_expires_at) {
      await Q.uUnban(userId);
    } else {
      const exp = user.ban_expires_at ? ` (${new Date(user.ban_expires_at * 1000).toLocaleDateString('uz-UZ')} gacha)` : '';
      return { error: json({ error: `Hisob bloklangan: ${user.ban_reason || ''}${exp}`, banned: true }, 403) };
    }
  }
  return { userId, user };
}

async function requireRole(request, env, Q, roles) {
  const auth = await requireAuthNotBanned(request, env, Q);
  if (auth.error) return auth;
  const user = auth.user || (await Q.uByIdFull(auth.userId));
  if (!roles.includes(user.role)) return { error: json({ error: "Ruxsat yo'q" }, 403) };
  return { userId: auth.userId, user };
}

async function checkRecipient(Q, fromId, toId) {
  if (!toId) return { error: json({ error: "Qabul qiluvchi ko'rsatilmagan" }, 400) };
  if (toId === fromId) return { error: json({ error: "O'zingizga xabar yuborib bo'lmaydi" }, 400) };
  const target = await Q.uById(toId);
  if (!target) return { error: json({ error: 'Foydalanuvchi topilmadi' }, 404) };
  return { ok: true };
}

async function findOrCreateSchool(Q, region_id, name) {
  const clean = (name || '').trim();
  if (!region_id || !clean) return null;
  const existing = await Q.schoolFindByName(region_id, clean);
  if (existing) return existing.id;
  const id = uid();
  await Q.schoolInsert(id, region_id, clean);
  return id;
}

/* ═══ AI PIPELINE (submissiondan keyin fonda ishga tushadi) ═══ */

async function processProblemAI(env, Q, problem) {
  try {
    const cat = await categorize(env, problem.title, problem.body);
    await Q.pSetCategory(cat.category_id, cat.ai_status, problem.id);

    const candidates = await Q.clOpenByCategory(cat.category_id, problem.region_id, 8);
    const decision = await matchOrCreateCluster(env, problem, candidates);

    let clusterId;
    if (decision.matched_cluster_id) {
      clusterId = decision.matched_cluster_id;
      await Q.clIncProblem(clusterId);
    } else {
      clusterId = uid();
      await Q.clInsert(clusterId, cat.category_id, problem.region_id, problem.school_id, decision.new_title, decision.new_summary);
    }
    await Q.pSetCluster(clusterId, problem.id);
    await Q.svInsert(problem.user_id, clusterId); // muallif o'zi avtomatik "ovoz"ga qo'shiladi
    const supportCount = (await Q.svCount(clusterId)).c;
    await Q.clSetSupport(supportCount, clusterId);

    // Bo'sak (masalan 3 ta)dan o'tganda AI birinchi yechim variantlarini taklif qiladi
    if (supportCount === 3) {
      const existing = await Q.solByCluster(clusterId);
      if (!existing.length) {
        const cluster = await Q.clOne(clusterId);
        const examples = await Q.clProblems(clusterId);
        const solutions = await generateSolutions(env, cluster, examples);
        for (const s of solutions) await Q.solInsert(uid(), clusterId, null, 'ai', s.title, s.body);
        if (solutions.length) await Q.clSetStatus('solution_proposed', clusterId);
      }
    }

    await sendTo(env, problem.user_id, {
      type: 'problem_processed',
      data: { problem_id: problem.id, cluster_id: clusterId, category_id: cat.category_id, ai_status: cat.ai_status },
    });
  } catch (e) {
    console.error('processProblemAI xatosi:', e.message);
    try { await Q.pSetCategory('boshqa', 'failed', problem.id); } catch {}
  }
}

/* ═══ ESKI (JAMOALAR/POST) YORDAMCHI FUNKSIYALARI ═══ */

// Postgres'dagi POWER()-asosli "hot" formulaning JS ekvivalenti — D1/SQLite'da
// POWER() funksiyasi yo'q, shuning uchun so'nggi postlar oldin created_at bo'yicha
// olib kelinadi (Q.pgRecent), so'ng shu yerda "hot" tartibida saralanadi.
function hotScore(p) {
  const ageHours = Math.max((now() - p.created_at) / 3600, 0);
  return p.score / Math.pow(ageHours + 2, 1.5);
}

async function fmtPgPost(Q, p, userId) {
  const myVote = userId ? (await Q.pvGet(userId, p.id))?.vote || 0 : 0;
  const saved = userId ? !!(await Q.svPCheck(userId, p.id)) : false;
  let poll = null;
  const pollRow = await Q.pollGet(p.id);
  if (pollRow) {
    const options = JSON.parse(pollRow.options);
    const counts = await Q.pollVoteCnt(pollRow.id);
    const total = (await Q.pollTotalVotes(pollRow.id)).c;
    const myVoteIdx = userId ? (await Q.pollVoteGet(userId, pollRow.id))?.option_index ?? -1 : -1;
    const countsMap = {};
    counts.forEach((r) => { countsMap[r.option_index] = r.cnt; });
    poll = {
      id: pollRow.id, question: pollRow.question,
      options: options.map((opt, i) => ({ text: opt, votes: countsMap[i] || 0, pct: total > 0 ? Math.round(((countsMap[i] || 0) / total) * 100) : 0 })),
      total, my_vote: myVoteIdx, ends_at: pollRow.ends_at, ended: pollRow.ends_at < now(),
    };
  }
  return { ...p, my_vote: myVote, saved, poll, ago: ago(p.created_at) };
}

async function notifyFollowers(env, Q, posterId, post) {
  try {
    const followers = await Q.fwFollowersList(posterId);
    if (!followers.length) return;
    const poster = await Q.uById(posterId);
    if (!poster) return;
    for (const { follower_id } of followers) {
      const nid = uid();
      const msg = `${poster.name} yangi post qo'shdi: ${post.title.slice(0, 50)}`;
      await Q.nInsertPost(nid, follower_id, posterId, 'new_post', post.id, null, msg);
      await sendTo(env, follower_id, { type: 'notif', data: { id: nid, type: 'new_post', post_id: post.id, msg, fn: poster.name, fa: poster.avatar, fc: poster.color, is_read: 0, ago: 'Hozir' } });
    }
  } catch (e) { console.error('notifyFollowers xatosi:', e.message); }
}

/* ═══ AI: POSTLARNI FON REJIMIDA YORLIQLASH ═══
   Murojaatlardan farqli — qattiq toifa emas, erkin qisqa mavzu yorlig'i.
   Bir xil yorliqqa ega postlar keyin "o'xshash postlar" sifatida bog'lanadi. */
async function processPostAI(env, Q, post) {
  try {
    const r = await tagPost(env, post.title, post.body);
    await Q.pgSetAiTopic(r.topic, r.ai_status, post.id);
    if (r.topic) await sendTo(env, post.user_id, { type: 'post_tagged', data: { post_id: post.id, topic: r.topic } });
  } catch (e) {
    console.error('processPostAI xatosi:', e.message);
    try { await Q.pgSetAiTopic(null, 'failed', post.id); } catch {}
  }
}

/* ═══ ASOSIY ROUTER ═══ */

async function route(request, env, ctx, p, q, m) {
  const Q = makeQ(env.DB);

  /* ══ AUTH ══ */
  if (p === '/api/auth/register' && m === 'POST') {
    const b = await readBody(request);
    const { username, name, email, password, region_id } = b;
    const schoolName = (b.school_name || '').trim();
    if (!username || !name || !email || !password) return json({ error: "Barcha maydonlarni to'ldiring" }, 400);
    if (password.length < 6) return json({ error: 'Parol kamida 6 belgi' }, 400);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return json({ error: 'Username: 3-20 belgi, faqat harf/raqam/_' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Email manzil noto'g'ri" }, 400);
    if (name.trim().length < 2 || name.trim().length > 60) return json({ error: "Ism 2-60 belgi bo'lishi kerak" }, 400);
    if (region_id && !(await Q.regionGet(region_id))) return json({ error: "Hudud topilmadi" }, 400);
    if (await Q.uExists(username, email)) return json({ error: 'Bu username yoki email band' }, 409);
    const school_id = await findOrCreateSchool(Q, region_id, schoolName);
    const id = uid();
    await Q.uInsert(id, username.toLowerCase(), name.trim(), email.toLowerCase(), hashPass(password, env.SECRET), randColor(), region_id || null, school_id);
    return json({ token: makeToken(id, env.SECRET), user: await Q.uById(id) }, 201);
  }

  if (p === '/api/auth/login' && m === 'POST') {
    const b = await readBody(request);
    if (!b.username || !b.password) return json({ error: 'Login va parolni kiriting' }, 400);
    const user = await Q.uByLogin(b.username);
    if (!user || user.pass !== hashPass(b.password, env.SECRET)) return json({ error: "Noto'g'ri login yoki parol" }, 401);
    if (user.is_banned) {
      if (user.ban_expires_at && now() > user.ban_expires_at) await Q.uUnban(user.id);
      else {
        const exp = user.ban_expires_at ? ` (${new Date(user.ban_expires_at * 1000).toLocaleDateString('uz-UZ')} gacha)` : '';
        return json({ error: `Hisob bloklangan: ${user.ban_reason || ''}${exp}` }, 403);
      }
    }
    return json({ token: makeToken(user.id, env.SECRET), user: await Q.uById(user.id) });
  }

  if (p === '/api/auth/send-code' && m === 'POST') {
    const b = await readBody(request);
    const uname = (b.username || '').trim().toLowerCase();
    if (!uname) return json({ error: 'Username kiriting' }, 400);
    const user = await Q.uByUsername(uname);
    if (!user) return json({ error: 'Foydalanuvchi topilmadi' }, 404);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await Q.vcInsert(uid(), user.id, code, now() + 600);
    let sent = false;
    if (hasEmail(env)) {
      try { await sendVerifyCode(env, user.email, code, user.username); sent = true; }
      catch (e) { console.error('Email xatosi:', e.message); }
    } else {
      console.log(`[DEV] ${user.username} uchun tiklash kodi: ${code}`);
    }
    return json({ ok: true, sent, email: user.email.replace(/(.{2}).*(@.*)/, '$1***$2') });
  }

  if (p === '/api/auth/verify-code' && m === 'POST') {
    const b = await readBody(request);
    if (!b.username || !b.code) return json({ error: 'Username va kod kerak' }, 400);
    const user = await Q.uByUsername(b.username.trim().toLowerCase());
    if (!user) return json({ error: 'Topilmadi' }, 404);
    const vc = await Q.vcGet(user.id, String(b.code).trim());
    if (!vc) return json({ error: "Kod noto'g'ri yoki muddati tugagan" }, 400);
    const token = uid() + uid();
    await Q.rtInsert(token, user.id, now() + 1800);
    await Q.vcUse(vc.id);
    return json({ ok: true, reset_token: token, username: user.username });
  }

  if (p === '/api/auth/reset' && m === 'POST') {
    const b = await readBody(request);
    if (!b.token || !b.new_pass) return json({ error: 'Token va yangi parol kerak' }, 400);
    if (b.new_pass.length < 6) return json({ error: 'Parol kamida 6 belgi' }, 400);
    const rt = await Q.rtGet(b.token);
    if (!rt) return json({ error: "Havola eskirgan yoki noto'g'ri" }, 400);
    await Q.uUpdPass(hashPass(b.new_pass, env.SECRET), rt.user_id);
    await Q.rtUse(b.token);
    return json({ ok: true });
  }

  /* Frontend uchun kichik ochiq konfiguratsiya — statik index.html bot username'ni
     "bilishi" uchun. Faqat TG_BOT_TOKEN (maxfiy) qo'yilgan bo'lsa qaytariladi —
     TG_BOT_NAME o'zi bor bo'lishi hali login ishlayotganini bildirmaydi. */
  if (p === '/api/config' && m === 'GET') {
    return json({ telegramBotName: hasTelegram(env) ? (env.TG_BOT_NAME || null) : null });
  }

  /* Bosh sahifa uchun ochiq (login talab qilmaydigan) statistika/toifalar —
     REDESIGN.md §3.2 statistika lentasi va Yo'nalishlar gridi. */
  if (p === '/api/public-stats' && m === 'GET') {
    return json(await Q.publicStats());
  }
  if (p === '/api/public-categories' && m === 'GET') {
    return json(await Q.catCounts());
  }
  if (p === '/api/public-regions' && m === 'GET') {
    return json(await Q.dashRegionBreakdown());
  }

  /* ══ TELEGRAM LOGIN WIDGET ══
     Bot bilan gaplashish (webhook/polling) shart emas — vidjet Telegram
     popup'ida tasdiqlangan foydalanuvchi ma'lumotini to'g'ridan-to'g'ri
     brauzerga qaytaradi, biz HMAC imzosini tekshiramiz xolos. Yangi
     foydalanuvchi uchun "profilni to'ldirish" bosqichi server xotirasi
     o'rniga imzolangan vaqtinchalik token orqali (signTemp/verifyTemp)
     statesiz amalga oshiriladi. */
  if (p === '/api/auth/telegram-login' && m === 'POST') {
    const b = await readBody(request);
    const { id, first_name, username, photo_url, auth_date, hash } = b;
    if (!id || !auth_date || !hash) return json({ error: "Ma'lumotlar to'liq emas" }, 400);
    if (!hasTelegram(env)) return json({ error: 'Telegram bilan kirish sozlanmagan' }, 503);
    const check = verifyLoginPayload(b, env);
    if (!check.ok) return json({ error: check.error || "Tekshiruvdan o'tmadi" }, 403);
    const tgId = String(id);
    const user = await Q.uByTgId(tgId);
    if (!user) {
      const tempToken = signTemp({ tgId, first_name: first_name || '', username: username || '', photo_url: photo_url || '', exp: Date.now() + 300000 }, env.SECRET);
      return json({ needProfile: true, tempToken });
    }
    return json({ token: makeToken(user.id, env.SECRET), user: await Q.uById(user.id) });
  }
  if (p === '/api/auth/telegram-finish' && m === 'POST') {
    const b = await readBody(request);
    const pending = verifyTemp(b.tempToken || b.token, env.SECRET);
    const { name, username } = b;
    if (!pending || !name || !username) return json({ error: "Ma'lumotlar to'liq emas yoki sessiya tugagan" }, 400);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return json({ error: 'Username: 3-20 belgi, faqat harf/raqam/_' }, 400);
    if (await Q.uByUsername(username)) return json({ error: 'Bu username band' }, 409);
    const newId = uid();
    const email = `tg_${pending.tgId}@mindhub.local`;
    await Q.uInsert(newId, username.toLowerCase(), name.trim(), email, hashPass(uid() + uid(), env.SECRET), randColor(), null, null);
    await Q.uSetTgId(pending.tgId, newId);
    if (pending.photo_url) await Q.uUpdAv(pending.photo_url, newId);
    return json({ token: makeToken(newId, env.SECRET), user: await Q.uById(newId) });
  }

  /* ══ ME ══ */
  if (p === '/api/me' && m === 'GET') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const user = await Q.uById(auth.userId);
    if (!user) return json({ error: 'Topilmadi' }, 404);
    return json(user);
  }
  if (p === '/api/me' && m === 'PUT') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request);
    await Q.uUpdProf((b.name || '').trim(), (b.bio || '').trim(), auth.userId);
    if (b.email) await Q.uUpdEmail(b.email.trim().toLowerCase(), auth.userId);
    return json(await Q.uById(auth.userId));
  }
  if (p === '/api/me/avatar' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const { files } = await readForm(request);
    const saved = await saveFileR2(env, files.image, IMG_EXT, 5 * 1024 * 1024);
    if (!saved || saved.tooLarge || !saved.url) return json({ error: saved?.tooLarge ? 'Rasm 5MB dan oshmasin' : 'Rasm yuklanmadi' }, saved?.tooLarge ? 413 : 400);
    await Q.uUpdAv(saved.url, auth.userId);
    return json({ avatar: saved.url });
  }
  if (p === '/api/me/banner' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const { files } = await readForm(request);
    const saved = await saveFileR2(env, files.image, IMG_EXT, 5 * 1024 * 1024);
    if (!saved || saved.tooLarge || !saved.url) return json({ error: saved?.tooLarge ? 'Rasm 5MB dan oshmasin' : 'Rasm yuklanmadi' }, saved?.tooLarge ? 413 : 400);
    await Q.uUpdBanner(saved.url, auth.userId);
    return json({ banner: saved.url });
  }
  if (p === '/api/me/password' && m === 'PUT') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request);
    const user = await Q.uByIdFull(auth.userId);
    if (!user || user.pass !== hashPass(b.old_pass || '', env.SECRET)) return json({ error: "Eski parol noto'g'ri" }, 400);
    if (!b.new_pass || b.new_pass.length < 6) return json({ error: 'Yangi parol kamida 6 belgi' }, 400);
    await Q.uUpdPass(hashPass(b.new_pass, env.SECRET), auth.userId);
    return json({ ok: true });
  }
  if (p === '/api/me/push-token' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request);
    if (b.token) await Q.pushIns(auth.userId, b.token);
    return json({ ok: true });
  }
  if (p === '/api/me/push-token' && m === 'DELETE') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request);
    if (b.token) await Q.pushDel(auth.userId, b.token);
    return json({ ok: true });
  }

  /* ══ REGIONS / SCHOOLS / CATEGORIES ══ */
  if (p === '/api/regions' && m === 'GET') return json(await Q.regionAll());
  if (p.match(/^\/api\/regions\/[^/]+\/schools$/) && m === 'GET') return json(await Q.schoolsByRegion(p.split('/')[3]));
  if (p === '/api/categories' && m === 'GET') return json(await Q.categoryAll());

  /* ══ USERS ══ */
  if (p === '/api/users/search' && m === 'GET') {
    const sq = (q.get('q') || '').toLowerCase();
    return json(await Q.uSearch('%' + sq + '%', '%' + sq + '%'));
  }
  if (p.match(/^\/api\/users\/[^/]+$/) && m === 'GET') {
    const userId = getAuth(request, env.SECRET);
    const param = p.split('/')[3];
    const user = await Q.uBySlug(param);
    if (!user) return json({ error: 'Topilmadi' }, 404);
    const region = user.region_id ? await Q.regionGet(user.region_id) : null;
    const problems = await Q.pByUser(user.id);
    const postRows = await Q.pgByUser(user.id);
    const posts = [];
    for (const r of postRows) posts.push(await fmtPgPost(Q, r, userId));
    const followers = (await Q.fwFollowers(user.id)).c;
    const following = (await Q.fwFollowing(user.id)).c;
    const is_following = userId ? !!(await Q.fwCheck(userId, user.id)) : false;
    return json({ ...user, region_name: region?.name || null, problems, posts, followers, following, is_following, is_me: userId === user.id, online: await isOnline(env, user.id) });
  }
  if (p.match(/^\/api\/users\/[^/]+\/follow$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const target = await Q.uBySlug(p.split('/')[3]);
    if (!target || target.id === auth.userId) return json({ error: 'Ruxsat' }, 400);
    const isFollowing = !!(await Q.fwCheck(auth.userId, target.id));
    if (isFollowing) {
      await Q.fwDelete(auth.userId, target.id);
      await Q.uFollowersSync(target.id);
      return json({ following: false });
    }
    await Q.fwInsert(auth.userId, target.id);
    await Q.uFollowersSync(target.id);
    const from = await Q.uById(auth.userId);
    const nid = uid();
    const msg = `${from.name} sizni kuzata boshladi`;
    await Q.nInsertPost(nid, target.id, auth.userId, 'follow', null, null, msg);
    await sendTo(env, target.id, { type: 'notif', data: { id: nid, type: 'follow', from_id: auth.userId, msg, fn: from.name, fa: from.avatar, fc: from.color, is_read: 0, ago: 'Hozir' } });
    return json({ following: true });
  }

  /* ══ COMMUNITIES (jamoalar) ══ */
  if (p === '/api/communities/popular' && m === 'GET') {
    const userId = getAuth(request, env.SECRET);
    const coms = await Q.comByViews();
    const out = [];
    for (const c of coms) {
      const role = userId ? await Q.comRoleGet(userId, c.id) : null;
      out.push({ ...c, is_member: userId ? !!(await Q.memCheck(userId, c.id)) : false, is_owner: userId === c.owner_id, is_admin: !!(role && role.role === 'admin'), pending_request: userId ? !!(await Q.comReqGet(userId, c.id)) : false });
    }
    return json(out);
  }
  if (p === '/api/communities/my-requests' && m === 'GET') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    return json(await Q.comReqAll(auth.userId));
  }
  if (p === '/api/communities' && m === 'GET') {
    const userId = getAuth(request, env.SECRET);
    const sq = q.get('q') ? q.get('q').toLowerCase() : null;
    let coms;
    if (sq) coms = await Q.comSearch('%' + sq + '%', '%' + sq + '%');
    else if (q.get('mine') && userId) coms = await Q.comMine(userId);
    else coms = await Q.comAll();
    const out = [];
    for (const c of coms) {
      const isMember = userId ? !!(await Q.memCheck(userId, c.id)) : false;
      if (c.is_private && !isMember && userId !== c.owner_id) continue;
      const role = userId ? await Q.comRoleGet(userId, c.id) : null;
      out.push({ ...c, is_member: isMember, is_owner: userId === c.owner_id, is_admin: !!(role && role.role === 'admin'), pending_request: userId ? !!(await Q.comReqGet(userId, c.id)) : false });
    }
    return json(out);
  }
  if (p.match(/^\/api\/communities\/[^/]+$/) && m === 'GET') {
    const userId = getAuth(request, env.SECRET);
    const slug = p.split('/')[3];
    const com = await Q.comBySlug(slug);
    if (!com) return json({ error: 'Topilmadi' }, 404);
    const isMember = userId ? !!(await Q.memCheck(userId, com.id)) : false;
    if (com.is_private && !isMember && userId !== com.owner_id) return json({ error: 'Maxfiy jamoa' }, 403);
    await Q.comIncViews(com.id);
    const role = userId ? await Q.comRoleGet(userId, com.id) : null;
    const admins = await Q.comRoleList(com.id);
    const isComAdmin = userId && (userId === com.owner_id || (role && role.role === 'admin'));
    const pendingReqs = isComAdmin ? await Q.comReqByCom(com.id) : [];
    return json({ ...com, views: (com.views || 0) + 1, is_member: isMember, is_owner: userId === com.owner_id, is_admin: !!(role && role.role === 'admin'), pending_request: userId ? !!(await Q.comReqGet(userId, com.id)) : false, admins, pending_requests: pendingReqs });
  }
  if (p === '/api/communities' && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const b = await readBody(request);
    const slug = (b.slug || '').toLowerCase().trim().replace(/\s+/g, '-');
    const name = (b.name || '').trim();
    if (!slug || !/^[a-z0-9_-]{2,32}$/.test(slug)) return json({ error: "Slug: 2-32 belgi, faqat kichik harf/raqam/_/-" }, 400);
    if (!name) return json({ error: 'Nom kiriting' }, 400);
    if (await Q.comBySlug(slug)) return json({ error: 'Bu slug band' }, 409);
    const cid = uid();
    await Q.comInsert(cid, slug, name, (b.description || '').trim(), b.color || '#C8922A', auth.userId, b.is_private ? 1 : 0);
    await Q.memJoin(auth.userId, cid);
    await Q.comIncMem(cid);
    return json(await Q.comById(cid), 201);
  }
  if (p.match(/^\/api\/communities\/[^/]+$/) && m === 'PUT') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const slug = p.split('/')[3];
    const com = await Q.comBySlug(slug); if (!com) return json({ error: 'Topilmadi' }, 404);
    const user = await Q.uByIdFull(auth.userId);
    const role = await Q.comRoleGet(auth.userId, com.id);
    if (com.owner_id !== auth.userId && user.role !== 'admin' && !(role && role.role === 'admin')) return json({ error: "Ruxsat yo'q" }, 403);
    const ct = request.headers.get('content-type') || '';
    let name = com.name, desc = com.description, rules = com.rules, color = com.color, avatar = com.avatar, banner = com.banner, is_private = com.is_private;
    if (ct.includes('multipart')) {
      const { fields, files } = await readForm(request);
      name = (fields.name || com.name).trim(); desc = (fields.description || com.description || '').trim();
      rules = (fields.rules || com.rules || '').trim(); color = fields.color || com.color;
      if (fields.is_private !== undefined) is_private = fields.is_private === 'true' || fields.is_private === '1' ? 1 : 0;
      if (files.avatar?.size) { const saved = await saveFileR2(env, files.avatar, IMG_EXT, 5 * 1024 * 1024); if (saved?.url) avatar = saved.url; }
      if (files.banner?.size) { const saved = await saveFileR2(env, files.banner, IMG_EXT, 5 * 1024 * 1024); if (saved?.url) banner = saved.url; }
    } else {
      const b = await readBody(request);
      name = (b.name || com.name).trim(); desc = (b.description || com.description || '').trim();
      rules = (b.rules || com.rules || '').trim(); color = b.color || com.color;
      if (b.is_private !== undefined) is_private = b.is_private ? 1 : 0;
    }
    await Q.comUpdateFull(name, desc, rules, color, avatar || null, banner || null, com.id);
    if (is_private !== com.is_private) await Q.comSetPrivate(is_private, com.id);
    return json(await Q.comBySlug(slug));
  }
  if (p.match(/^\/api\/communities\/[^/]+$/) && m === 'DELETE') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const slug = p.split('/')[3];
    const com = await Q.comBySlug(slug); if (!com) return json({ error: 'Topilmadi' }, 404);
    const user = await Q.uByIdFull(auth.userId);
    const role = await Q.comRoleGet(auth.userId, com.id);
    if (com.owner_id !== auth.userId && user.role !== 'admin' && !(role && role.role === 'admin')) return json({ error: "Ruxsat yo'q" }, 403);
    await Q.comDelete(com.id);
    return json({ ok: true });
  }
  if (p.match(/^\/api\/communities\/[^/]+\/join$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const slug = p.split('/')[3];
    const com = await Q.comBySlug(slug); if (!com) return json({ error: 'Topilmadi' }, 404);
    const isMem = !!(await Q.memCheck(auth.userId, com.id));
    if (isMem) { await Q.memLeave(auth.userId, com.id); await Q.comDecMem(com.id); return json({ joined: false }); }
    if (com.is_private) {
      if (await Q.comReqGet(auth.userId, com.id)) return json({ error: "So'rov allaqachon yuborilgan", pending: true });
      await Q.comReqInsert(uid(), auth.userId, com.id);
      return json({ pending: true, message: "So'rov yuborildi, admin tasdiqlashi kerak" });
    }
    await Q.memJoin(auth.userId, com.id); await Q.comIncMem(com.id);
    return json({ joined: true });
  }
  if (p.match(/^\/api\/communities\/[^/]+\/admin$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const com = await Q.comBySlug(p.split('/')[3]); if (!com) return json({ error: 'Topilmadi' }, 404);
    if (com.owner_id !== auth.userId) return json({ error: 'Faqat egasi admin tayinlay oladi' }, 403);
    const b = await readBody(request);
    if (!b.user_id) return json({ error: 'user_id kerak' }, 400);
    await Q.comRoleSet(b.user_id, com.id, 'admin');
    return json({ ok: true });
  }
  if (p.match(/^\/api\/communities\/[^/]+\/admin$/) && m === 'DELETE') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const com = await Q.comBySlug(p.split('/')[3]); if (!com) return json({ error: 'Topilmadi' }, 404);
    if (com.owner_id !== auth.userId) return json({ error: 'Faqat egasi admin olib tashlay oladi' }, 403);
    const b = await readBody(request);
    if (!b.user_id) return json({ error: 'user_id kerak' }, 400);
    await Q.comRoleDel(b.user_id, com.id);
    return json({ ok: true });
  }
  if (p.match(/^\/api\/communities\/[^/]+\/request\/[^/]+$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const slug = p.split('/')[3]; const reqId = p.split('/')[5];
    const com = await Q.comBySlug(slug); if (!com) return json({ error: 'Topilmadi' }, 404);
    const role = await Q.comRoleGet(auth.userId, com.id);
    if (com.owner_id !== auth.userId && !(role && role.role === 'admin')) return json({ error: "Ruxsat yo'q" }, 403);
    const b = await readBody(request);
    if (b.action === 'approve') {
      await Q.comReqApprove(reqId);
      const request2 = await Q.comReqGetById(reqId);
      if (request2) { await Q.memJoin(request2.user_id, com.id); await Q.comIncMem(com.id); }
    } else {
      await Q.comReqReject(reqId);
    }
    return json({ ok: true });
  }
  if (p.match(/^\/api\/communities\/[^/]+\/posts$/) && m === 'GET') {
    const userId = getAuth(request, env.SECRET);
    const slug = p.split('/')[3];
    const sort = q.get('sort') || 'hot';
    const offset = parseInt(q.get('offset')) || 0;
    const com = await Q.comBySlug(slug);
    if (com && com.is_private) {
      const isMember = userId ? !!(await Q.memCheck(userId, com.id)) : false;
      if (!isMember && userId !== com.owner_id) return json({ error: "Maxfiy jamoa, a'zo bo'ling" }, 403);
    }
    if (!com) return json({ error: 'Topilmadi' }, 404);
    let rows;
    if (sort === 'hot') {
      rows = (await Q.pgByCommunityRecent(com.id, 200)).map((r) => ({ ...r, _hot: hotScore(r) })).sort((a, b2) => b2._hot - a._hot).slice(offset, offset + 25);
    } else {
      rows = await Q.pgByCommunity(com.id, sort, offset, 25);
    }
    const out = [];
    for (const r of rows) out.push(await fmtPgPost(Q, r, userId));
    return json(out);
  }

  /* ══ POSTS (eski, jamoalar ichidagi) ══ */
  if (p === '/api/posts' && m === 'GET') {
    const userId = getAuth(request, env.SECRET);
    const sort = q.get('sort') || 'hot';
    const offset = parseInt(q.get('offset')) || 0;
    let rows;
    if (sort === 'new') rows = await Q.pgNew(offset, 25);
    else if (sort === 'top') rows = await Q.pgTop(offset, 25);
    else rows = (await Q.pgRecent(200)).map((r) => ({ ...r, _hot: hotScore(r) })).sort((a, b) => b._hot - a._hot).slice(offset, offset + 25);
    const out = [];
    for (const r of rows) {
      if (r.community_id) {
        const com = await Q.comById(r.community_id);
        if (com?.is_private) {
          const isMember = userId ? !!(await Q.memCheck(userId, r.community_id)) : false;
          if (!isMember) continue;
        }
      }
      out.push(await fmtPgPost(Q, r, userId));
    }
    return json(out);
  }
  if (p === '/api/posts/saved' && m === 'GET') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const out = [];
    for (const r of await Q.pgSaved(auth.userId)) out.push(await fmtPgPost(Q, r, auth.userId));
    return json(out);
  }
  if (p.match(/^\/api\/posts\/[^/]+$/) && m === 'GET') {
    const userId = getAuth(request, env.SECRET);
    const post = await Q.pgOne(p.split('/')[3]);
    if (!post) return json({ error: 'Topilmadi' }, 404);
    const com = await Q.comById(post.community_id);
    if (com?.is_private) {
      const isMember = userId ? !!(await Q.memCheck(userId, post.community_id)) : false;
      if (!isMember && userId !== com.owner_id) return json({ error: 'Maxfiy jamoa posti' }, 403);
    }
    const cm = await Q.pcByPost(post.id);
    const comments = [];
    for (const c of cm) comments.push({ ...c, my_vote: userId ? (await Q.pcvGet(userId, c.id))?.vote || 0 : 0, ago: ago(c.created_at) });
    return json({ ...(await fmtPgPost(Q, post, userId)), comments });
  }
  if (p === '/api/posts' && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const ct = request.headers.get('content-type') || '';
    let title = '', body = '', comSlug = '', type = 'text', link = null, image = null, video = null, audio = null, flair = null;
    let pollQuestion = null, pollOptions = null, pollDays = 3;
    if (ct.includes('multipart')) {
      const { fields, files } = await readForm(request);
      title = (fields.title || '').trim(); body = (fields.body || '').trim();
      comSlug = (fields.community || '').trim(); type = fields.type || 'text';
      link = fields.link || null; flair = fields.flair || null;
      pollQuestion = fields.poll_question || null;
      pollOptions = fields.poll_options ? JSON.parse(fields.poll_options) : null;
      pollDays = parseInt(fields.poll_days) || 3;
      if (files.image?.size) {
        const saved = await saveFileR2(env, files.image, [...IMG_EXT, '.heic', '.heif'], 10 * 1024 * 1024);
        if (saved?.tooLarge) return json({ error: 'Rasm 10MB dan oshmasin' }, 413);
        if (!saved?.url) return json({ error: "Rasm formati qo'llab-quvvatlanmaydi" }, 400);
        image = saved.url; type = 'image';
      }
      if (files.video?.size) {
        const saved = await saveFileR2(env, files.video, ['.mp4', '.webm', '.mov', '.avi', '.mkv'], 500 * 1024 * 1024);
        if (saved?.tooLarge) return json({ error: 'Video 500MB dan oshmasin' }, 413);
        if (!saved?.url) return json({ error: "Video formati qo'llab-quvvatlanmaydi" }, 400);
        video = saved.url; type = 'video';
      }
      if (files.audio?.size) {
        const saved = await saveFileR2(env, files.audio, [...AUDIO_EXT, '.mp3'], 20 * 1024 * 1024);
        if (saved?.tooLarge) return json({ error: 'Audio 20MB dan oshmasin' }, 413);
        if (!saved?.url) return json({ error: "Audio formati qo'llab-quvvatlanmaydi" }, 400);
        audio = saved.url; type = 'audio';
      }
    } else {
      const b = await readBody(request);
      title = (b.title || '').trim(); body = (b.body || '').trim();
      comSlug = (b.community || '').trim(); type = b.type || 'text';
      link = b.link || null; flair = b.flair || null;
      pollQuestion = b.poll_question || null; pollOptions = b.poll_options || null; pollDays = parseInt(b.poll_days) || 3;
    }
    if (!title) return json({ error: 'Sarlavha kerak' }, 400);
    if (title.length > 300) return json({ error: '300 belgidan oshmasin' }, 400);
    if (body.length > 20000) return json({ error: '20000 belgidan oshmasin' }, 400);
    if (!comSlug) return json({ error: 'Jamoa tanlang' }, 400);
    const com = await Q.comBySlug(comSlug);
    if (!com) return json({ error: 'Jamoa topilmadi' }, 404);
    const pid = uid();
    await Q.pgInsert(pid, auth.userId, com.id, title, body, link, image, video, audio, type, flair);
    await Q.pgScore(1, 1, 0, pid);
    await Q.pvUpsert(auth.userId, pid, 1);
    await Q.uKarma(1, auth.userId);
    if (pollQuestion && Array.isArray(pollOptions) && pollOptions.length >= 2) {
      const polid = uid();
      await Q.pollInsert(polid, pid, pollQuestion.trim(), JSON.stringify(pollOptions.slice(0, 10).map((o) => String(o).trim())), pollDays, now() + pollDays * 86400);
    }
    const post = await Q.pgOne(pid);
    ctx.waitUntil(processPostAI(env, Q, post));
    ctx.waitUntil(notifyFollowers(env, Q, auth.userId, post));
    return json(await fmtPgPost(Q, post, auth.userId), 201);
  }
  if (p.match(/^\/api\/posts\/[^/]+$/) && m === 'DELETE') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const pid = p.split('/')[3];
    const own = await Q.pgOwner(pid); if (!own) return json({ error: 'Topilmadi' }, 404);
    const user = await Q.uByIdFull(auth.userId);
    if (own.user_id !== auth.userId && user.role !== 'admin') return json({ error: "Ruxsat yo'q" }, 403);
    await Q.pgDelete(pid);
    return json({ ok: true });
  }
  if (p.match(/^\/api\/posts\/[^/]+\/vote$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const pid = p.split('/')[3];
    const own = await Q.pgOwner(pid); if (!own) return json({ error: 'Topilmadi' }, 404);
    const b = await readBody(request);
    const vote = parseInt(b.vote);
    if (![1, -1].includes(vote)) return json({ error: 'Vote 1 yoki -1' }, 400);
    const ex = await Q.pvGet(auth.userId, pid);
    const prev = ex ? ex.vote : 0;
    let myVote = vote;
    if (prev === vote) { await Q.pvDelete(auth.userId, pid); myVote = 0; } else await Q.pvUpsert(auth.userId, pid, vote);
    const c = await Q.pvCount(pid);
    const score = c.up - c.dn;
    await Q.pgScore(score, c.up, c.dn, pid);
    if (own.user_id !== auth.userId) {
      const delta = (myVote === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
      if (delta) await Q.uKarma(delta, own.user_id);
    }
    return json({ score, my_vote: myVote, upvotes: c.up, downvotes: c.dn });
  }
  if (p.match(/^\/api\/posts\/[^/]+\/save$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const pid = p.split('/')[3];
    const saved = !!(await Q.svPCheck(auth.userId, pid));
    if (saved) { await Q.svPDelete(auth.userId, pid); return json({ saved: false }); }
    await Q.svPInsert(auth.userId, pid);
    return json({ saved: true });
  }

  /* ══ SO'ROVNOMA (poll) OVOZ ══ */
  if (p.match(/^\/api\/polls\/[^/]+\/vote$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const pollId = p.split('/')[3];
    const b = await readBody(request);
    const optIdx = parseInt(b.option);
    const poll = await Q.pollGetById(pollId);
    if (!poll) return json({ error: "So'rovnoma topilmadi" }, 404);
    if (poll.ends_at < now()) return json({ error: "So'rovnoma tugagan" }, 400);
    const opts = JSON.parse(poll.options);
    if (optIdx < 0 || optIdx >= opts.length) return json({ error: "Noto'g'ri variant" }, 400);
    if (await Q.pollVoteGet(auth.userId, pollId)) return json({ error: 'Allaqachon ovoz berdingiz' }, 400);
    await Q.pollVoteIns(auth.userId, pollId, optIdx);
    const counts = await Q.pollVoteCnt(pollId);
    const total = (await Q.pollTotalVotes(pollId)).c;
    const countsMap = {}; counts.forEach((r) => { countsMap[r.option_index] = r.cnt; });
    return json({ options: opts.map((opt, i) => ({ text: opt, votes: countsMap[i] || 0, pct: total > 0 ? Math.round(((countsMap[i] || 0) / total) * 100) : 0 })), total, my_vote: optIdx });
  }

  /* ══ POST IZOHLARI (threaded) ══ */
  if (p.match(/^\/api\/posts\/[^/]+\/comments$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const pid = p.split('/')[3];
    const post = await Q.pgOne(pid); if (!post) return json({ error: 'Topilmadi' }, 404);
    const b = await readBody(request);
    const cbody = (b.body || '').trim();
    if (!cbody) return json({ error: "Izoh bo'sh bo'lmasin" }, 400);
    if (cbody.length > 5000) return json({ error: '5000 belgidan oshmasin' }, 400);
    const parentId = b.parent_id || null;
    const depth = parentId ? ((await Q.pcDepth(parentId))?.depth || 0) + 1 : 0;
    const cid = uid();
    await Q.pcInsert(cid, pid, auth.userId, parentId, cbody, depth);
    await Q.pgIncCmt(pid);
    await Q.uKarma(1, auth.userId);
    const comment = { ...(await Q.pcOne(cid)), my_vote: 0, ago: ago(now()) };
    const from = await Q.uById(auth.userId);
    if (post.user_id !== auth.userId) {
      const nid = uid();
      const msg = `${from.name} postingizga izoh qoldirdi`;
      await Q.nInsertPost(nid, post.user_id, auth.userId, 'post_comment', pid, cid, msg);
      await sendTo(env, post.user_id, { type: 'notif', data: { id: nid, type: 'post_comment', post_id: pid, msg, fn: from.name, fa: from.avatar, fc: from.color, is_read: 0, ago: 'Hozir' } });
    }
    if (parentId) {
      const parentOwner = await Q.pcOwner(parentId);
      if (parentOwner && parentOwner.user_id !== auth.userId && parentOwner.user_id !== post.user_id) {
        const nid = uid();
        const msg = `${from.name} izohingizga javob qoldirdi`;
        await Q.nInsertPost(nid, parentOwner.user_id, auth.userId, 'post_reply', pid, cid, msg);
        await sendTo(env, parentOwner.user_id, { type: 'notif', data: { id: nid, type: 'post_reply', post_id: pid, msg, fn: from.name, fa: from.avatar, fc: from.color, is_read: 0, ago: 'Hozir' } });
      }
    }
    return json(comment, 201);
  }
  if (p.match(/^\/api\/post-comments\/[^/]+\/vote$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const cid = p.split('/')[3];
    const b = await readBody(request);
    const vote = parseInt(b.vote);
    if (![1, -1].includes(vote)) return json({ error: 'Vote 1 yoki -1' }, 400);
    const own = await Q.pcOwner(cid); if (!own) return json({ error: 'Topilmadi' }, 404);
    const ex = await Q.pcvGet(auth.userId, cid);
    let myVote = vote;
    if (ex && ex.vote === vote) { await Q.pcvDelete(auth.userId, cid); myVote = 0; } else await Q.pcvUpsert(auth.userId, cid, vote);
    const c = await Q.pcvCount(cid);
    const score = c.up - c.dn;
    await Q.pcScore(score, cid);
    return json({ score, my_vote: myVote });
  }
  if (p.match(/^\/api\/post-comments\/[^/]+$/) && m === 'DELETE') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const cid = p.split('/')[3];
    const own = await Q.pcOwner(cid); if (!own) return json({ error: 'Topilmadi' }, 404);
    const user = await Q.uByIdFull(auth.userId);
    if (own.user_id !== auth.userId && user.role !== 'admin') return json({ error: "Ruxsat yo'q" }, 403);
    const kids = await Q.pcChildren(cid);
    const ids = [cid, ...kids.map((k) => k.id)];
    await Q.pcvDeleteMany(ids);
    await Q.pcDeleteMany(ids);
    await Q.pgDecCmt(ids.length, own.post_id);
    await Q.uKarma(-1, own.user_id);
    return json({ ok: true });
  }

  /* ══ PROBLEMS (murojaatlar) ══ */
  if (p === '/api/problems' && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const ct = request.headers.get('content-type') || '';
    let title, body, region_id, schoolName, image = null;
    if (ct.includes('multipart')) {
      const { fields, files } = await readForm(request);
      title = (fields.title || '').trim(); body = (fields.body || '').trim();
      region_id = fields.region_id || null; schoolName = fields.school_name || '';
      if (files.image) {
        const saved = await saveFileR2(env, files.image, IMG_EXT, 10 * 1024 * 1024);
        if (saved?.tooLarge) return json({ error: 'Rasm 10MB dan oshmasin' }, 413);
        if (files.image.size && !saved) return json({ error: "Rasm formati qo'llab-quvvatlanmaydi" }, 400);
        image = saved?.url || null;
      }
    } else {
      const b = await readBody(request);
      title = (b.title || '').trim(); body = (b.body || '').trim();
      region_id = b.region_id || null; schoolName = b.school_name || '';
    }
    if (!title) return json({ error: 'Sarlavha kerak' }, 400);
    if (title.length > 300) return json({ error: '300 belgidan oshmasin' }, 400);
    if (body.length > 5000) return json({ error: 'Matn 5000 belgidan oshmasin' }, 400);
    if (region_id && !(await Q.regionGet(region_id))) return json({ error: 'Hudud topilmadi' }, 400);
    const school_id = await findOrCreateSchool(Q, region_id, schoolName);
    const id = uid();
    await Q.pInsert(id, auth.userId, region_id, school_id, title, body, image);
    const problem = await Q.pOne(id);
    ctx.waitUntil(processProblemAI(env, Q, { ...problem, region_id, school_id }));
    return json(problem, 201);
  }
  if (p === '/api/problems/mine' && m === 'GET') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    return json((await Q.pByUser(auth.userId)).map(x => ({ ...x, ago: ago(x.created_at) })));
  }
  if (p === '/api/problems/search' && m === 'GET') {
    const sq = (q.get('q') || '').toLowerCase();
    if (sq.length < 2) return json([]);
    return json(await Q.pSearch('%' + sq + '%', '%' + sq + '%'));
  }
  if (p.match(/^\/api\/problems\/[^/]+$/) && m === 'GET') {
    const problem = await Q.pOne(p.split('/')[3]);
    if (!problem) return json({ error: 'Topilmadi' }, 404);
    return json({ ...problem, ago: ago(problem.created_at) });
  }
  if (p.match(/^\/api\/problems\/[^/]+$/) && m === 'DELETE') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const id = p.split('/')[3];
    const own = await Q.pOwner(id); if (!own) return json({ error: 'Topilmadi' }, 404);
    const user = await Q.uByIdFull(auth.userId);
    if (own.user_id !== auth.userId && user.role !== 'admin') return json({ error: "Ruxsat yo'q" }, 403);
    await Q.pDelete(id);
    return json({ ok: true });
  }

  /* ══ CLUSTERS (asosiy oqim) ══ */
  if (p === '/api/clusters' && m === 'GET') {
    const sort = q.get('sort') || 'hot';
    const offset = parseInt(q.get('offset')) || 0;
    const region = q.get('region'); const category = q.get('category');
    const rows = (region || category)
      ? await Q.clByRegionCategory(region || null, category || null, offset, 25)
      : await Q.clFeed(sort, offset, 25);
    const userId = getAuth(request, env.SECRET);
    const out = [];
    for (const c of rows) out.push({ ...c, ago: ago(c.created_at), is_supported: userId ? !!(await Q.svCheck(userId, c.id)) : false });
    return json(out);
  }
  if (p.match(/^\/api\/clusters\/[^/]+$/) && m === 'GET') {
    const id = p.split('/')[3];
    const cluster = await Q.clOne(id);
    if (!cluster) return json({ error: 'Topilmadi' }, 404);
    const userId = getAuth(request, env.SECRET);
    const [problems, solutions, comments] = await Promise.all([Q.clProblems(id), Q.solByCluster(id), Q.cmByCluster(id)]);
    const solutionsOut = [];
    for (const s of solutions) solutionsOut.push({ ...s, ago: ago(s.created_at), my_vote: userId ? !!(await Q.solVoteCheck(userId, s.id)) : false });
    return json({
      ...cluster, ago: ago(cluster.created_at),
      is_supported: userId ? !!(await Q.svCheck(userId, id)) : false,
      problems: problems.map(x => ({ ...x, ago: ago(x.created_at) })),
      solutions: solutionsOut,
      comments: comments.map(x => ({ ...x, ago: ago(x.created_at) })),
    });
  }
  if (p.match(/^\/api\/clusters\/[^/]+\/support$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const id = p.split('/')[3];
    const cluster = await Q.clOne(id); if (!cluster) return json({ error: 'Topilmadi' }, 404);
    const already = await Q.svCheck(auth.userId, id);
    if (already) await Q.svDelete(auth.userId, id); else await Q.svInsert(auth.userId, id);
    const count = (await Q.svCount(id)).c;
    await Q.clSetSupport(count, id);
    return json({ supported: !already, support_count: count });
  }
  if (p.match(/^\/api\/clusters\/[^/]+\/status$/) && m === 'POST') {
    const auth = await requireRole(request, env, Q, ['leader', 'admin']); if (auth.error) return auth.error;
    const id = p.split('/')[3];
    const b = await readBody(request);
    if (!['open', 'solution_proposed', 'resolved', 'closed'].includes(b.status)) return json({ error: "Noto'g'ri holat" }, 400);
    await Q.clSetStatus(b.status, id);
    return json({ ok: true });
  }

  /* ══ COMMENTS (klaster muhokamasi) ══ */
  if (p.match(/^\/api\/clusters\/[^/]+\/comments$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const clusterId = p.split('/')[3];
    const cluster = await Q.clOne(clusterId); if (!cluster) return json({ error: 'Topilmadi' }, 404);
    const b = await readBody(request);
    const cbody = (b.body || '').trim();
    if (!cbody) return json({ error: "Izoh bo'sh bo'lmasin" }, 400);
    if (cbody.length > 2000) return json({ error: '2000 belgidan oshmasin' }, 400);
    const id = uid();
    await Q.cmInsert(id, clusterId, auth.userId, cbody);
    const rows = await Q.cmByCluster(clusterId);
    const created = rows.find(r => r.id === id);
    return json({ ...created, ago: ago(created.created_at) }, 201);
  }
  if (p.match(/^\/api\/comments\/[^/]+$/) && m === 'DELETE') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const id = p.split('/')[3];
    const own = await Q.cmOwner(id); if (!own) return json({ error: 'Topilmadi' }, 404);
    const user = await Q.uByIdFull(auth.userId);
    if (own.user_id !== auth.userId && user.role !== 'admin') return json({ error: "Ruxsat yo'q" }, 403);
    await Q.cmDelete(id);
    return json({ ok: true });
  }

  /* ══ SOLUTIONS (yechim takliflari) ══ */
  if (p.match(/^\/api\/clusters\/[^/]+\/solutions$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const clusterId = p.split('/')[3];
    const cluster = await Q.clOne(clusterId); if (!cluster) return json({ error: 'Topilmadi' }, 404);
    const b = await readBody(request);
    const title = (b.title || '').trim(); const sbody = (b.body || '').trim();
    if (!title) return json({ error: 'Sarlavha kerak' }, 400);
    const id = uid();
    await Q.solInsert(id, clusterId, auth.userId, 'user', title, sbody);
    if (cluster.status === 'open') await Q.clSetStatus('solution_proposed', clusterId);
    return json(await Q.solOne(id), 201);
  }
  if (p.match(/^\/api\/clusters\/[^/]+\/generate-solutions$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const clusterId = p.split('/')[3];
    const cluster = await Q.clOne(clusterId); if (!cluster) return json({ error: 'Topilmadi' }, 404);
    const existing = await Q.solByCluster(clusterId);
    if (existing.filter(s => s.source === 'ai').length >= 4) return json({ error: 'AI yechim taklifi yetarli' }, 400);
    const examples = await Q.clProblems(clusterId);
    const solutions = await generateSolutions(env, cluster, examples);
    if (!solutions.length) return json({ error: 'AI hozircha sozlanmagan yoki javob bermadi' }, 503);
    const created = [];
    for (const s of solutions) { const id = uid(); await Q.solInsert(id, clusterId, null, 'ai', s.title, s.body); created.push(id); }
    if (cluster.status === 'open') await Q.clSetStatus('solution_proposed', clusterId);
    return json({ ok: true, created: created.length });
  }
  if (p.match(/^\/api\/solutions\/[^/]+\/vote$/) && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const id = p.split('/')[3];
    const sol = await Q.solOne(id); if (!sol) return json({ error: 'Topilmadi' }, 404);
    const already = await Q.solVoteCheck(auth.userId, id);
    if (already) await Q.solVoteDel(auth.userId, id); else await Q.solVoteIns(auth.userId, id);
    const votes = (await Q.solVoteCount(id)).c;
    await Q.solSetVotes(votes, id);
    return json({ voted: !already, votes });
  }
  if (p.match(/^\/api\/solutions\/[^/]+\/accept$/) && m === 'POST') {
    const auth = await requireRole(request, env, Q, ['leader', 'admin']); if (auth.error) return auth.error;
    const id = p.split('/')[3];
    const sol = await Q.solOne(id); if (!sol) return json({ error: 'Topilmadi' }, 404);
    await Q.solAccept(id, sol.cluster_id);
    await Q.clSetStatus('resolved', sol.cluster_id);
    return json({ ok: true });
  }

  /* ══ NOTIFICATIONS ══ */
  if (p === '/api/notifications' && m === 'GET') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    return json((await Q.nAll(auth.userId)).map(n => ({ ...n, ago: ago(n.created_at) })));
  }
  if (p === '/api/notifications/read' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    await Q.nMarkRead(auth.userId);
    return json({ ok: true });
  }
  if (p === '/api/notifications/count' && m === 'GET') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    return json({ count: (await Q.nUnread(auth.userId)).c });
  }

  /* ══ MESSAGES (DM — saqlanadi) ══ */
  if (p === '/api/messages' && m === 'GET') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const rows = await Q.msgConvos(auth.userId);
    const convos = [];
    for (const { oid } of rows) {
      const other = await Q.uById(oid); if (!other) continue;
      const last = await Q.msgLast(auth.userId, oid);
      const unread = (await Q.msgUnreadFrom(oid, auth.userId)).c;
      convos.push({ other: { ...other, online: await isOnline(env, oid) }, last: last ? { ...last, ago: ago(last.created_at) } : null, unread });
    }
    return json(convos);
  }
  if (p.match(/^\/api\/messages\/[^/]+$/) && m === 'GET') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const toId = p.split('/')[3];
    await Q.msgMarkRead(toId, auth.userId);
    return json((await Q.msgThread(auth.userId, toId)).map(x => ({ ...x, ago: ago(x.created_at) })));
  }
  if (p.match(/^\/api\/messages\/[^/]+$/) && m === 'DELETE') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const id = p.split('/')[3];
    const msg = await Q.msgOwner(id); if (!msg) return json({ error: 'Topilmadi' }, 404);
    if (msg.from_id !== auth.userId) return json({ error: "Faqat o'z xabaringizni o'chirasiz" }, 403);
    await Q.msgDelete(id);
    await sendTo(env, msg.to_id, { type: 'del_msg', data: { id } });
    return json({ ok: true });
  }
  if (p === '/api/messages' && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const b = await readBody(request);
    if (!b.body?.trim()) return json({ error: "Xabar bo'sh" }, 400);
    const chk = await checkRecipient(Q, auth.userId, b.to_id); if (chk.error) return chk.error;
    const id = uid(); const bodyTxt = b.body.trim();
    await Q.msgInsert(id, auth.userId, b.to_id, bodyTxt, 'text');
    const from = await Q.uById(auth.userId);
    const msg = { id, from_id: auth.userId, to_id: b.to_id, body: bodyTxt, type: 'text', is_read: 0, ago: 'Hozir', created_at: now() };
    await sendTo(env, b.to_id, { type: 'new_msg', data: { msg, from: { id: from.id, name: from.name, username: from.username, color: from.color, avatar: from.avatar } } });
    return json(msg, 201);
  }
  if (p === '/api/messages/voice' && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const { fields, files } = await readForm(request);
    const chk = await checkRecipient(Q, auth.userId, fields.to_id); if (chk.error) return chk.error;
    const saved = await saveFileR2(env, files.voice || files.audio, AUDIO_EXT, 20 * 1024 * 1024);
    if (!saved || saved.tooLarge || !saved.url) return json({ error: saved?.tooLarge ? '20MB dan oshmasin' : 'Audio topilmadi' }, saved?.tooLarge ? 413 : 400);
    const id = uid(); const duration = fields.duration || '0:00';
    await Q.msgInsert(id, auth.userId, fields.to_id, '[Ovozli xabar]', 'voice', null, saved.url, duration);
    const from = await Q.uById(auth.userId);
    const msg = { id, from_id: auth.userId, to_id: fields.to_id, body: '[Ovozli xabar]', type: 'voice', audio_url: saved.url, duration, is_read: 0, ago: 'Hozir', created_at: now() };
    await sendTo(env, fields.to_id, { type: 'new_msg', data: { msg, from: { id: from.id, name: from.name, username: from.username, color: from.color, avatar: from.avatar } } });
    return json(msg, 201);
  }
  if (p === '/api/messages/image' && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const { fields, files } = await readForm(request);
    const chk = await checkRecipient(Q, auth.userId, fields.to_id); if (chk.error) return chk.error;
    const saved = await saveFileR2(env, files.image, IMG_EXT, 10 * 1024 * 1024);
    if (!saved || saved.tooLarge || !saved.url) return json({ error: saved?.tooLarge ? '10MB dan oshmasin' : 'Rasm topilmadi' }, saved?.tooLarge ? 413 : 400);
    const id = uid();
    await Q.msgInsert(id, auth.userId, fields.to_id, '[Rasm]', 'image', saved.url, null, null);
    const from = await Q.uById(auth.userId);
    const msg = { id, from_id: auth.userId, to_id: fields.to_id, body: '[Rasm]', type: 'image', image_url: saved.url, is_read: 0, ago: 'Hozir', created_at: now() };
    await sendTo(env, fields.to_id, { type: 'new_msg', data: { msg, from: { id: from.id, name: from.name, username: from.username, color: from.color, avatar: from.avatar } } });
    return json(msg, 201);
  }

  /* ══ WEBRTC SIGNALIZATSIYASI (Durable Object orqali yetkaziladi) ══ */
  if (p === '/api/call/offer' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request); const from = await Q.uById(auth.userId);
    await sendTo(env, b.to_id, { type: 'call_offer', data: { call_type: b.call_type || 'audio', offer: b.offer, from_id: auth.userId, from_name: from.name, from_username: from.username, from_avatar: from.avatar, from_color: from.color } });
    return json({ ok: true });
  }
  if (p === '/api/call/answer' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request);
    await sendTo(env, b.to_id, { type: 'call_answer', data: { answer: b.answer, from_id: auth.userId } });
    return json({ ok: true });
  }
  if (p === '/api/call/ice' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request);
    await sendTo(env, b.to_id, { type: 'ice_candidate', data: { candidate: b.candidate, from_id: auth.userId } });
    return json({ ok: true });
  }
  if (p === '/api/call/end' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request);
    await sendTo(env, b.to_id, { type: 'call_ended', data: { from_id: auth.userId } });
    return json({ ok: true });
  }
  if (p === '/api/call/reject' && m === 'POST') {
    const auth = await requireAuth(request, env); if (auth.error) return auth.error;
    const b = await readBody(request);
    await sendTo(env, b.to_id, { type: 'call_rejected', data: { from_id: auth.userId } });
    return json({ ok: true });
  }

  /* ══ SEARCH ══ */
  if (p === '/api/search' && m === 'GET') {
    const sq = (q.get('q') || '').toLowerCase();
    if (sq.length < 2) return json({ problems: [], users: [], posts: [], communities: [] });
    const userId = getAuth(request, env.SECRET);
    const type = q.get('type') || 'all';
    const out = { problems: [], users: [], posts: [], communities: [] };
    if (type === 'all' || type === 'problems') out.problems = (await Q.pSearch('%' + sq + '%', '%' + sq + '%')).map(x => ({ ...x, ago: ago(x.created_at) }));
    if (type === 'all' || type === 'users') out.users = await Q.uSearch('%' + sq + '%', '%' + sq + '%');
    if (type === 'all' || type === 'posts') {
      const rows = await Q.pgSearch('%' + sq + '%', '%' + sq + '%');
      for (const r of rows) out.posts.push(await fmtPgPost(Q, r, userId));
    }
    if (type === 'all' || type === 'communities') out.communities = await Q.comSearch('%' + sq + '%', '%' + sq + '%');
    return json(out);
  }

  /* ══ REPORTS ══ */
  if (p === '/api/reports' && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const b = await readBody(request);
    if (!b.reason?.trim()) return json({ error: 'Sabab kerak' }, 400);
    if (b.post_id || b.post_comment_id) await Q.rpInsertPost(uid(), auth.userId, b.post_id || null, b.post_comment_id || null, b.reason.trim());
    else await Q.rpInsert(uid(), auth.userId, b.problem_id || null, b.comment_id || null, b.reason.trim());
    return json({ ok: true });
  }

  /* ══ ADMIN / BOSHQARUV PANELI ══ */
  if (p === '/api/admin/stats' && m === 'GET') {
    const auth = await requireRole(request, env, Q, ['leader', 'admin']); if (auth.error) return auth.error;
    const isAdmin = auth.user.role === 'admin';
    const stats = await Q.dashStats();
    const topCategories = await Q.dashTopCategoriesByRegion(isAdmin ? null : auth.user.region_id);
    const regionBreakdown = isAdmin ? await Q.dashRegionBreakdown() : [];
    const reports = isAdmin ? (await Q.rpAll()).map(r => ({ ...r, ago: ago(r.created_at) })) : [];
    const users = isAdmin ? await Q.uAll() : [];
    return json({ ...stats, top_categories: topCategories, region_breakdown: regionBreakdown, reports, users, scope: isAdmin ? 'all' : 'region' });
  }
  if (p === '/api/admin/action' && m === 'POST') {
    const auth = await requireRole(request, env, Q, ['admin']); if (auth.error) return auth.error;
    const b = await readBody(request);
    if (!b.target_id) return json({ error: 'target_id kerak' }, 400);
    if (b.target_id === auth.userId && ['ban', 'setRole'].includes(b.action)) return json({ error: "O'zingizga bu amalni qo'llay olmaysiz" }, 400);
    const target = await Q.uById(b.target_id);
    if (!target) return json({ error: 'Foydalanuvchi topilmadi' }, 404);
    if (b.action === 'ban') {
      const dur = parseInt(b.duration) || 0;
      await Q.uBan(b.reason || '', dur > 0 ? now() + dur * 86400 : null, b.target_id);
    }
    if (b.action === 'unban') await Q.uUnban(b.target_id);
    if (b.action === 'setRole' && ['user', 'leader', 'admin'].includes(b.role)) await Q.uSetRole(b.role, b.target_id);
    return json({ ok: true });
  }
  if (p.match(/^\/api\/admin\/reports\/[^/]+$/) && m === 'POST') {
    const auth = await requireRole(request, env, Q, ['admin']); if (auth.error) return auth.error;
    const b = await readBody(request);
    await Q.rpResolve(b.status || 'resolved', p.split('/')[4]);
    return json({ ok: true });
  }

  return null;
}

/* ═══ STATIK YUKLAMALAR (/uploads/... — R2) ═══ */

async function serveUpload(request, env, pathname) {
  const key = pathname.slice(1); // "/uploads/xxx" -> "uploads/xxx"
  const range = request.headers.get('range');
  const opts = {};
  if (range) {
    const m2 = /bytes=(\d+)-(\d+)?/.exec(range);
    if (m2) {
      const head = await env.UPLOADS.head(key);
      if (!head) return new Response('Not found', { status: 404 });
      const start = parseInt(m2[1], 10);
      const end = m2[2] ? parseInt(m2[2], 10) : head.size - 1;
      if (start >= head.size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } });
      opts.range = { offset: start, length: end - start + 1 };
      const obj = await env.UPLOADS.get(key, opts);
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(obj.body, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${head.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        },
      });
    }
  }
  const obj = await env.UPLOADS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': String(obj.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}

/* ═══ WEBSOCKET YO'NALTIRISH ═══ */

async function handleWsUpgrade(request, env) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const userId = token ? verifyToken(token, env.SECRET) : null;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const stub = env.USER_HUB.get(env.USER_HUB.idFromName(userId));
  return stub.fetch(request);
}

/* ═══ WORKER ENTRY ═══ */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        },
      });
    }

    if (pathname === '/ws') return handleWsUpgrade(request, env);
    if (pathname.startsWith('/uploads/')) return serveUpload(request, env, pathname);

    if (pathname.startsWith('/api/')) {
      try {
        const result = await route(request, env, ctx, pathname, url.searchParams, method);
        if (result === null) return json({ error: 'API topilmadi' }, 404);
        return result;
      } catch (err) {
        console.error(err.stack || err.message);
        return json({ error: 'Server xatosi' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },

  // Cron trigger (wrangler.toml'da sozlanadi): GEMINI_API_KEY kech qo'shilsa,
  // shu paytgacha "pending" holida qolgan murojaatlarni avtomatik qayta ishlaydi.
  async scheduled(event, env, ctx) {
    const Q = makeQ(env.DB);
    ctx.waitUntil((async () => {
      const pending = await Q.pPendingAi(10);
      for (const problem of pending) {
        try { await processProblemAI(env, Q, problem); }
        catch (e) { console.error('scheduled AI xatosi:', e.message); }
      }
      const pendingPosts = await Q.pgPendingAi(10);
      for (const post of pendingPosts) {
        try { await processPostAI(env, Q, post); }
        catch (e) { console.error('scheduled post AI xatosi:', e.message); }
      }
    })());
  },
};
