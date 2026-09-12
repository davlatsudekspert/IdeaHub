'use strict';
const crypto = require('crypto');
const { TG_BOT_TOKEN, hasTelegram } = require('./config');

/* Telegram Bot API'ga so'rov (fetch — Node 18+ da mavjud) */
async function tgApi(method, body) {
  if (!hasTelegram) return { ok: false, error: 'TG_BOT_TOKEN sozlanmagan' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return await r.json();
  } catch (e) {
    console.error('Telegram API xatosi:', method, e.message);
    return { ok: false, error: e.message };
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return tgApi('sendMessage', { chat_id: chatId, text, ...extra });
}

/*
 * Telegram Login Widget imzosini tekshirish.
 * Muhim: data_check_string'ga hash'dan boshqa BARCHA kelgan maydonlar
 * alifbo tartibida kirishi kerak — aks holda Telegram yangi maydon
 * qo'shsa (masalan last_name) tekshiruv noto'g'ri ishlaydi.
 */
function verifyLoginPayload(payload) {
  if (!hasTelegram) return { ok: false, error: 'Telegram login sozlanmagan' };
  const { hash, ...rest } = payload || {};
  if (!hash) return { ok: false, error: 'hash yo\'q' };

  const dataCheckString = Object.keys(rest)
    .filter(k => rest[k] !== undefined && rest[k] !== null)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(TG_BOT_TOKEN).digest();
  const computed  = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(String(hash), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Imzo mos kelmadi' };
  }
  const age = Math.floor(Date.now() / 1000) - Number(rest.auth_date || 0);
  if (!rest.auth_date || age > 86400) return { ok: false, error: 'Sessiya muddati tugagan' };
  return { ok: true };
}

module.exports = { tgApi, sendMessage, verifyLoginPayload, hasTelegram };
