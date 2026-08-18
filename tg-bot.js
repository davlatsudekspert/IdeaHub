'use strict';
const https = require('https');
const querystring = require('querystring');

const BOT_TOKEN = '8965764146:AAHqspmPCzIYFNc2hbQHg-4LsUVSL0K5eG0';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
let offset = 0;
let dbRef = null;

function tg(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const url = new URL(`${API_BASE}/${method}`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendMsg(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (text === '/start' || text === '/menu') {
    await sendMsg(chatId,
      `Assalomu alaykum, MindHub botiga xush kelibsiz!\n\n` +
      `Akkauntingizni bog'lash uchun email manzilingizni yuboring.\n\n` +
      `Format: example@mail.com`
    );
    return;
  }

  if (text === '/help') {
    await sendMsg(chatId,
      `Buyruqlar:\n\n` +
      `/start - Boshlash\n` +
      `/help - Yordam\n\n` +
      `Email yuboring va akkauntingizni bog'laydi.`
    );
    return;
  }

  const emailMatch = text.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailMatch)) {
    const email = emailMatch;
    const user = await dbRef.get('SELECT id, username, name FROM users WHERE lower(email)=lower($1)', [email]);
    if (!user) {
      await sendMsg(chatId, `Bu emailga bog'langan akkaunt topilmadi. MindHub da ro'yxatdan o'tgan emailingizni kiriting.`);
      return;
    }
    await dbRef.run('UPDATE users SET tg_chat_id=$1 WHERE id=$2', [String(chatId), user.id]);
    await sendMsg(chatId,
      `Akkunt bog'landi!\n\n` +
      `Ism: ${user.name}\n` +
      `Username: @${user.username}\n\n` +
      `Endi MindHub saytida parolni tiklashingiz mumkin.`
    );
    return;
  }

  await sendMsg(chatId, `Noto'g'ri format. Email manzilingizni yuboring: example@mail.com`);
}

async function poll() {
  try {
    const res = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
    if (res.ok && res.result) {
      for (const update of res.result) {
        offset = update.update_id + 1;
        if (update.message) {
          handleMessage(update.message).catch(e => console.error('Bot msg err:', e.message));
        }
      }
    }
  } catch (e) {
    console.error('Poll err:', e.message);
    await new Promise(r => setTimeout(r, 3000));
  }
  setTimeout(poll, 100);
}

async function startBot(database) {
  dbRef = database;
  const me = await tg('getMe');
  if (!me.ok) throw new Error('Bot token invalid: ' + JSON.stringify(me));
  console.log(`🤖 Bot started: @${me.result.username}`);
  poll();
}

module.exports = { startBot, tg, sendMsg };
