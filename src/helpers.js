// nodejs_compat bayrog'i tufayli node:crypto to'g'ridan-to'g'ri ishlaydi —
// eski Node ilovasidagi HMAC token/parol mantiqini deyarli o'zgarishsiz saqlab qolamiz.
import crypto from 'node:crypto';

export function uid() { return crypto.randomUUID(); }
export function now() { return Math.floor(Date.now() / 1000); }

export function hashPass(p, secret) {
  return crypto.createHmac('sha256', secret).update(p).digest('hex');
}

export function makeToken(userId, secret) {
  // btoa/atob Latin1 bilan cheklangan (UTF-8 nomlar bilan buziladi) — Buffer ishlatamiz.
  const pl = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 14 * 864e5 })).toString('base64url');
  const sg = crypto.createHmac('sha256', secret).update(pl).digest('base64url');
  return `${pl}.${sg}`;
}

export function verifyToken(tok, secret) {
  if (!tok) return null;
  try {
    const [pl, sg] = tok.split('.');
    if (!pl || !sg) return null;
    const expected = crypto.createHmac('sha256', secret).update(pl).digest('base64url');
    // Vaqtga chidamli taqqoslash — oddiy !== token mavjudligini oshkor qiladigan
    // vaqt farqi hujumiga ochiq bo'lardi.
    const a = Buffer.from(expected), b = Buffer.from(sg);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const d = JSON.parse(Buffer.from(pl, 'base64url').toString());
    return Date.now() > d.exp ? null : d.userId;
  } catch { return null; }
}

// Umumiy: istalgan qisqa muddatli obyektni imzolab beradi (masalan Telegram
// login'dagi "profilni to'ldiring" bosqichi uchun vaqtinchalik holat) — server
// xotirasida saqlash shart emas, chunki Workers so'rovlar orasida holatni
// kafolatlab saqlamaydi.
export function signTemp(payload, secret) {
  const pl = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sg = crypto.createHmac('sha256', secret).update(pl).digest('base64url');
  return `${pl}.${sg}`;
}

export function verifyTemp(tok, secret) {
  if (!tok) return null;
  try {
    const [pl, sg] = tok.split('.');
    if (!pl || !sg) return null;
    const expected = crypto.createHmac('sha256', secret).update(pl).digest('base64url');
    const a = Buffer.from(expected), b = Buffer.from(sg);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const d = JSON.parse(Buffer.from(pl, 'base64url').toString());
    return Date.now() > d.exp ? null : d;
  } catch { return null; }
}

export function getAuth(req, secret) {
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return verifyToken(tok, secret);
}

export function timeAgo(ts) {
  const d = now() - ts;
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}soat`;
  if (d < 2592000) return `${Math.floor(d / 86400)}k`;
  return `${Math.floor(d / 2592000)}oy`;
}

export async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

// Fetch API'ning o'zi multipart/form-data'ni to'g'ri ajratadi — eski qo'lda
// yozilgan chegara(boundary) parserga endi ehtiyoj yo'q.
export async function readForm(req) {
  try {
    const fd = await req.formData();
    const fields = {}, files = {};
    for (const [k, v] of fd.entries()) {
      if (v instanceof File) files[k] = v;
      else fields[k] = String(v).trim();
    }
    return { fields, files };
  } catch { return { fields: {}, files: {} }; }
}

export function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data ?? {}, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...extraHeaders,
    },
  });
}

export const CATEGORY_COLORS = ['#C8922A', '#4D8FFF', '#46C97A', '#9B6FD4', '#3AADCC', '#E8703A', '#FF5252', '#00BCD4'];
export function randColor() { return CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)]; }

// Fayl kengaytmasini xavfsiz aniqlash (nom asosida, MIME'ga ishonmasdan)
export function extOf(filename) {
  const m = /\.[a-zA-Z0-9]+$/.exec(filename || '');
  return m ? m[0].toLowerCase() : '';
}
