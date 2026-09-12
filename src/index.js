import { makeQ } from './db.js';
import { uid, now, hashPass, makeToken, verifyToken, getAuth, timeAgo, readBody, readForm, json, randColor, extOf } from './helpers.js';
import { categorize, matchOrCreateCluster, generateSolutions } from './ai.js';
import { sendVerifyCode, hasEmail } from './email.js';
import { sendTo, isOnline } from './ws.js';

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
    return json({ ...user, region_name: region?.name || null, problems, is_me: userId === user.id, online: await isOnline(env, user.id) });
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
    if (sq.length < 2) return json({ problems: [], users: [] });
    const type = q.get('type') || 'all';
    const out = { problems: [], users: [] };
    if (type === 'all' || type === 'problems') out.problems = (await Q.pSearch('%' + sq + '%', '%' + sq + '%')).map(x => ({ ...x, ago: ago(x.created_at) }));
    if (type === 'all' || type === 'users') out.users = await Q.uSearch('%' + sq + '%', '%' + sq + '%');
    return json(out);
  }

  /* ══ REPORTS ══ */
  if (p === '/api/reports' && m === 'POST') {
    const auth = await requireAuthNotBanned(request, env, Q); if (auth.error) return auth.error;
    const b = await readBody(request);
    if (!b.reason?.trim()) return json({ error: 'Sabab kerak' }, 400);
    await Q.rpInsert(uid(), auth.userId, b.problem_id || null, b.comment_id || null, b.reason.trim());
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
    })());
  },
};
