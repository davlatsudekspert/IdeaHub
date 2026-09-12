# MindHub — Cloudflare'ga joylashtirish qo'llanmasi

Bu ilova to'liq Cloudflare Workers stack'ida ishlaydi: **Workers** (server),
**D1** (SQLite baza), **R2** (yuklangan fayllar), **Durable Objects**
(real vaqtli xabar/qo'ng'iroq). Eski Railway/PostgreSQL versiyasi
`legacy-node-app/` papkasida arxivda saqlanadi — unda qimmatli ma'lumot
yo'q edi, shuning uchun hech narsa ko'chirilmadi.

Quyidagi buyruqlarni **siz o'zingiz** Cloudflare akkountingiz orqali
bajarishingiz kerak — bu sessiyada Cloudflare hisobingizga kirish imkoni yo'q.

## 1. Tayyorgarlik

```bash
npm install          # wrangler CLI'ni o'rnatadi
npx wrangler login    # brauzerda Cloudflare akkountingizga kirish
```

## 2. D1 bazasini yaratish

```bash
npx wrangler d1 create mindhub-db
```

Bu buyruq `database_id` qiymatini chiqaradi. Uni `wrangler.toml` faylidagi
`REPLACE_WITH_REAL_D1_ID` o'rniga yozing:

```toml
[[d1_databases]]
binding = "DB"
database_name = "mindhub-db"
database_id = "buyerga-haqiqiy-id-qoying"
```

Sxema va boshlang'ich ma'lumotlarni (14 hudud + 5 toifa) yuklang:

```bash
npx wrangler d1 migrations apply mindhub-db --remote
npx wrangler d1 execute mindhub-db --remote --file=./migrations/seed.sql
```

## 3. R2 bucket yaratish (yuklangan fayllar uchun)

```bash
npx wrangler r2 bucket create mindhub-uploads
```

(`wrangler.toml`dagi `[[r2_buckets]]` qismi allaqachon shu nomga ishora
qiladi — boshqa o'zgartirish shart emas.)

## 4. Maxfiy kalitlarni qo'yish

```bash
npx wrangler secret put SECRET
# So'raganda: uzun, tasodifiy satr kiriting (masalan: openssl rand -hex 32)
```

**Gemini AI** (toifalash, klasterlash, yechim taklif qilish) — kalitni
o'zingiz qo'shasiz:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Kalit https://aistudio.google.com/apikey saytidan olinadi. **Kalit
qo'yilmagunicha ilova to'liq ishlayveradi** — murojaatlar qabul qilinadi,
lekin AI toifalash/klasterlash "kutish rejimi"da qoladi (har bir murojaat
alohida klaster sifatida ko'rinadi). Kalitni istalgan vaqt keyinroq qo'ysangiz
ham bo'ladi — `wrangler.toml`dagi cron trigger (`*/5 * * * *`) kutib turgan
barcha murojaatlarni avtomatik qayta ishlaydi, qo'shimcha kod o'zgartirish
shart emas.

Ixtiyoriy (bo'lmasa email o'chiq qoladi, ilova baribir ishlaydi):

```bash
npx wrangler secret put RESEND_API_KEY   # parol tiklash kodi uchun
```

## 5. Joylashtirish

```bash
npx wrangler deploy
```

Sayt `https://mindhub.<sizning-subdomain>.workers.dev` manzilida ishga
tushadi. O'z domeningizni ulash uchun Cloudflare Dashboard → Workers →
mindhub → Settings → Domains & Routes.

## 6. Mahalliy ishlab chiqish

```bash
cp .dev.vars.example .dev.vars    # va SECRET qiymatini o'zgartiring
npm run dev
# yoki: npx wrangler dev --local
npm run db:migrate:local
npm run db:seed:local
```

## Nima kiritilmagan (keyingi bosqich uchun)

- **Telegram bot/login** — eski ilovada bor edi, lekin taqdimotda
  so'ralmagan va Cloudflare Workers'ning so'rov-asosidagi modeliga
  moslashtirish (webhook + Durable Object) qo'shimcha ish talab qiladi.
  Sxemada `users.tg_chat_id`/`tg_id` ustunlari kelajak uchun saqlab qo'yilgan.
- **AI klasterlash** hozircha oxirgi 8 ta ochiq klaster bilan
  taqqoslaydi (promptga sig'dirish uchun). Murojaatlar soni ko'payganda
  vektorli qidiruv (embeddings) ga o'tish tavsiya etiladi.

## Arxitektura xulosasi

| Eski (Node/Postgres/Railway) | Yangi (Cloudflare) |
|---|---|
| Xom `http.createServer` | Workers `fetch` handler |
| Qo'lda yozilgan WebSocket + xotiradagi Map | Durable Objects + hibernation API |
| `pg` drayveri, Postgres SQL | D1 (SQLite), `env.DB.prepare()` |
| Diskka fayl yozish (`data/uploads/`) | R2 obyekt xotirasi |
| `nodemailer` SMTP | Resend HTTP API |
| Jamoalar/post/ovoz (Reddit uslubi) | Murojaat → AI tahlil → klaster → yechim |
