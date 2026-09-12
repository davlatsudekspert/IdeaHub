// Telegram Login Widget imzosini tekshirish. Botning o'zi bilan gaplashish
// (webhook/polling) shart emas — foydalanuvchi Telegram popup'ida tasdiqlagach,
// vidjet natijani to'g'ridan-to'g'ri brauzerga (keyin bizning backendga) yuboradi,
// biz esa shu imzoni HMAC bilan tekshiramiz. nodejs_compat tufayli node:crypto
// Workers'da ham eski Node ilovasidagidek ishlaydi.
import crypto from 'node:crypto';

export function hasTelegram(env) { return !!env.TG_BOT_TOKEN; }

/*
 * Muhim: data_check_string'ga hash'dan boshqa BARCHA kelgan maydonlar alifbo
 * tartibida kirishi kerak — aks holda Telegram yangi maydon qo'shsa (masalan
 * last_name) tekshiruv noto'g'ri ishlaydi.
 */
export function verifyLoginPayload(payload, env) {
  if (!hasTelegram(env)) return { ok: false, error: 'Telegram login sozlanmagan' };
  const { hash, ...rest } = payload || {};
  if (!hash) return { ok: false, error: "hash yo'q" };

  const dataCheckString = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(env.TG_BOT_TOKEN).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(String(hash), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Imzo mos kelmadi' };
  }
  const age = Math.floor(Date.now() / 1000) - Number(rest.auth_date || 0);
  if (!rest.auth_date || age > 86400) return { ok: false, error: 'Sessiya muddati tugagan' };
  return { ok: true };
}
