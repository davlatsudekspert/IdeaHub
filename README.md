# MindHub

**Muammoni ko'r, yechimini yarat** — yoshlar boshqaradigan, sun'iy intellekt
asosidagi fuqarolik tashabbuslari platformasi.

O'quvchi/fuqaro muammoni yozadi → AI uni toifalaydi va o'xshashlari bilan
birlashtiradi (klaster) → boshqalar qo'llab-quvvatlaydi va yechim taklif
qiladi → AI dastlabki yechim variantlarini generatsiya qiladi → rahbariyat
boshqaruv panelida umumiy manzarani ko'radi.

## Texnologiya

100% Cloudflare Workers stack:

- **Workers** — server (`src/index.js`)
- **D1** — SQLite baza (`migrations/`)
- **R2** — yuklangan fayllar (rasm, ovozli xabar)
- **Durable Objects** — real vaqtli xabar almashish va qo'ng'iroq
  signalizatsiyasi (`src/durable/UserHub.js`)
- **Google Gemini API** — toifalash, klasterlash, yechim taklif qilish
  (`src/ai.js`)

Frontend — vanilla HTML/CSS/JS (`public/`), build qadam yo'q.

Joylashtirish uchun **[DEPLOY.md](./DEPLOY.md)** ga qarang.

## Loyiha tuzilishi

```
wrangler.toml           Cloudflare konfiguratsiyasi (D1/R2/DO bog'lanishlari)
migrations/             D1 sxemasi va boshlang'ich ma'lumotlar
src/
  index.js              Asosiy router (barcha /api/* yo'llar)
  db.js                 D1 so'rovlari
  ai.js                 Gemini AI integratsiyasi
  helpers.js            Token, parol xeshi, forma o'qish
  email.js              Resend orqali email
  ws.js                 Durable Object'ga xabar yuborish
  durable/UserHub.js    Foydalanuvchi WebSocket ulanishi (Durable Object)
public/                 Frontend (HTML/CSS/JS)
legacy-node-app/        Eski Node/PostgreSQL/Railway versiyasi (arxiv)
```

## Mahalliy ishga tushirish

```bash
npm install
cp .dev.vars.example .dev.vars   # SECRET qiymatini o'zgartiring
npm run db:migrate:local
npm run db:seed:local
npm run dev
```
