#!/usr/bin/env node
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const { init }        = require('./src/db');
const { route }       = require('./src/routes');
const ws              = require('./src/ws');
const { verifyToken } = require('./src/helpers');
const config          = require('./src/config');

// decodeURIComponent noto'g'ri ketma-ketlikda ('%zz') xato tashlaydi — himoyalangan variant
function safeDecode(v) { try { return decodeURIComponent(v); } catch { return v; } }

// DATA_DIR/UPLOAD config.js'dan olinadi — ilgari server.js va routes.js
// har xil papkaga ishora qilib, yuklangan fayllar 404 bo'lardi.
const DATA_DIR = config.DATA_DIR;
const PORT     = process.env.PORT || 3000;
const PUB      = path.join(__dirname, 'public');
const UPLOAD   = config.UPLOAD_DIR;

console.log('📁 DATA_DIR:', DATA_DIR);
console.log('📁 PUB path:', PUB);
console.log('📁 UPLOAD path:', UPLOAD);

if (!fs.existsSync(UPLOAD)) fs.mkdirSync(UPLOAD, { recursive: true });

const MIME = {
  '.html':'text/html;charset=utf-8', '.css':'text/css', '.js':'application/javascript',
  '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.heic':'image/heic', '.heif':'image/heif', '.avif':'image/avif',
  '.woff':'font/woff', '.woff2':'font/woff2', '.txt':'text/plain;charset=utf-8',
  '.webmanifest':'application/manifest+json',
  // Audio/Video MIME types - required for browser playback
  '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg',
  '.m4a':'audio/mp4', '.aac':'audio/aac',
  '.webm':'video/webm', '.mp4':'video/mp4', '.mov':'video/quicktime',
  '.avi':'video/x-msvideo', '.mkv':'video/x-matroska',
};

const server = http.createServer(async (req, res) => {
  const pname = url.parse(req.url).pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    });
    return res.end();
  }

  if (pname.startsWith('/uploads/')) {
    const f = path.join(UPLOAD, path.basename(safeDecode(pname)));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext  = path.extname(f).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      const stat = fs.statSync(f);
      const total = stat.size;

      // Range request support (needed for audio/video seeking in browser)
      const range = req.headers.range;
      if (range && (mime.startsWith('audio') || mime.startsWith('video'))) {
        const parts  = range.replace(/bytes=/, '').split('-');
        let start    = parseInt(parts[0], 10);
        let end      = parts[1] ? parseInt(parts[1], 10) : total - 1;
        if (Number.isNaN(start)) start = 0;
        if (Number.isNaN(end) || end >= total) end = total - 1;
        if (start > end || start >= total) {
          res.writeHead(416, { 'Content-Range': `bytes */${total}` });
          return res.end();
        }
        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(f, { start, end });
        res.writeHead(206, {
          'Content-Range':  `bytes ${start}-${end}/${total}`,
          'Accept-Ranges':  'bytes',
          'Content-Length': chunkSize,
          'Content-Type':   mime,
        });
        return fileStream.pipe(res);
      }

      res.writeHead(200, {
        'Content-Type':   mime,
        'Content-Length': total,
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'public,max-age=31536000',
      });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); return res.end('Not found');
  }

  if (pname.startsWith('/api/')) {
    try {
      const handled = await route(req, res);
      if (handled === null) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API topilmadi' }));
      }
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server xatosi' }));
      }
    }
    return;
  }

  // Statik fayl: path traversal ('..') ni bloklaymiz — PUB papkasidan tashqariga chiqmasin
  let safe = safeDecode(pname === '/' ? '/index.html' : pname);
  let fp = path.resolve(PUB, '.' + (safe.startsWith('/') ? safe : '/' + safe));
  if (fp !== PUB && !fp.startsWith(PUB + path.sep)) fp = path.join(PUB, 'index.html');
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) fp = path.join(PUB, 'index.html');
  if (fs.existsSync(fp)) {
    const ext = path.extname(fp).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'text/plain' };
    // JS/CSS: never cache, so new deploys reach users immediately
    if (ext === '.js' || ext === '.css') headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    res.writeHead(200, headers);
    return fs.createReadStream(fp).pipe(res);
  }
  res.writeHead(404); res.end('Not found');
});

server.on('upgrade', (req, socket) => {
  try {
    ws.handshake(req, socket);
    const m   = (req.url || '').match(/[?&]token=([^&]+)/);
    const uid = m ? verifyToken(decodeURIComponent(m[1])) : null;
    const key = uid || `anon_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    ws.add(key, socket);
    let buf = Buffer.alloc(0);
    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 1e6) buf = Buffer.alloc(0);   // himoya: cheksiz buferlanishdan
      const f = ws.decode(buf);
      if (f) {
        buf = Buffer.alloc(0);
        if (f.close) { socket.destroy(); return; }
        if (f.control) return;
        // Forward WebRTC signaling messages from client
        if (f.data && f.data.type && uid) {
          const d = f.data;
          if (['call_offer','call_answer','ice_candidate','call_end','call_reject'].includes(d.type)) {
            if (d.to) ws.sendTo(d.to, { type: d.type, data: { ...d, from: uid } });
          }
        }
      }
    });
    socket.on('close', () => ws.remove(key, socket));
    socket.on('error', () => { ws.remove(key, socket); try { socket.destroy(); } catch {} });
    socket.setTimeout(120000, () => { ws.remove(key, socket); try { socket.destroy(); } catch {} });
    socket.write(ws.encode({ type: 'connected', userId: uid }));
  } catch (err) {
    console.error(err);
    try { socket.destroy(); } catch {}
  }
});

config.warnMissing();

init()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  MindHub  →  http://localhost:${PORT}\n`);
    });
    // Telegram bot: akkauntni bog'lash uchun (tg_chat_id) — token bo'lsa ishga tushadi.
    // ENABLE_TG_BOT=0 bilan o'chirib qo'yish mumkin.
    if (config.hasTelegram && process.env.ENABLE_TG_BOT !== '0') {
      try {
        const { db } = require('./src/db');
        require('./tg-bot').startBot(db).catch(e => console.error('Telegram bot:', e.message));
      } catch (e) { console.error('Telegram bot yuklanmadi:', e.message); }
    }
  })
  .catch(err => {
    console.error('❌ PostgreSQL ulanishda xatolik:', err.message);
    process.exit(1);
  });

// Kutilmagan xatolikda process o'lib qolmasin (Railway restart loopini oldini olish)
process.on('unhandledRejection', e => console.error('unhandledRejection:', e && e.message ? e.message : e));
process.on('uncaughtException',  e => console.error('uncaughtException:', e && e.stack ? e.stack : e));
