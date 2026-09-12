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

## 5.1. Avtomatik deploy (GitHub Actions)

`main` branch'ga push qilinganda `.github/workflows/deploy.yml` avtomatik
ravishda D1 migratsiyalarini qo'llaydi va `wrangler deploy`ni ishga tushiradi
— bu qadamlarni qo'lda takrorlash shart emas. Ishga tushishi uchun **bir
martalik** sozlash kerak:

1. Cloudflare Dashboard → profil belgingiz → **My Profile → API Tokens →
   Create Token**. "Edit Cloudflare Workers" shablonidan foydalaning
   (hisobingizni tanlang). Agar deploy keyinroq ruxsat xatosi bersa, tokenga
   qo'shimcha ravishda **Account → D1 → Edit** va
   **Account → Workers R2 Storage → Edit** ruxsatlarini qo'shing.
2. GitHub'da: repo → **Settings → Secrets and variables → Actions →
   New repository secret** → nomi `CLOUDFLARE_API_TOKEN`, qiymati —
   1-qadamda olingan token.
3. Shu bilan tugadi — keyingi `main`ga push avtomatik deploy qiladi.
   Boshqa branch'dan qo'lda ishga tushirish uchun: GitHub → **Actions →
   Deploy to Cloudflare → Run workflow**.

## 6. Mahalliy ishlab chiqish

```bash
cp .dev.vars.example .dev.vars    # va SECRET qiymatini o'zgartiring
npm run dev
# yoki: npx wrangler dev --local
npm run db:migrate:local
npm run db:seed:local
```

## Telegram bilan kirish (ixtiyoriy)

Login Widget orqali ishlaydi — bot bilan gaplashish (webhook/polling) shart
emas, faqat vidjet imzosini tekshiramiz:

```bash
npx wrangler secret put TG_BOT_TOKEN
```

`wrangler.toml`dagi `TG_BOT_NAME` (`mind_hubbot`) shu tokenga mos bot
username bo'lishi kerak. Token qo'yilmaguncha login oynasida "Telegram
orqali kirish" tugmasi ko'rinmaydi (`/api/config` uni avtomatik yashiradi),
qo'yilgach frontend uni o'zi aniqlab ko'rsatadi — qo'shimcha kod
o'zgartirish shart emas.

## Nima kiritilmagan (keyingi bosqich uchun)

- **AI klasterlash** hozircha oxirgi 8 ta ochiq klaster bilan
  taqqoslaydi (promptga sig'dirish uchun). Murojaatlar soni ko'payganda
  vektorli qidiruv (embeddings) ga o'tish tavsiya etiladi.
- Onboarding kaskadi (viloyat→tuman→maktab), yopiq halqa (natija/tasdiq),
  Rahbar paneli, Admin paneli+TOTP, xarita — taqdimot brifidagi keyingi
  bosqichlar, hali boshlanmagan.

## Arxitektura xulosasi

Ilova ikkita oqimni bitta platformada birlashtiradi: **jamoalar/post/ovoz/
izoh/xabar/qo'ng'iroq** (eski Reddit-uslubidagi MindHub'dan tiklangan,
doimiy asosiy funksiya) va **Murojaat → AI tahlil → klaster → yechim**
(taqdimotdagi fuqarolik oqimi) — ikkalasi ham bitta D1 bazasi va bitta
sahifada ishlaydi, AI esa ikkala joyda ham bor: postlarni fon rejimida
mavzu bo'yicha teglaydi va murojaatlarni toifalab klasterlaydi/yechim
taklif qiladi.

| Eski (Node/Postgres/Railway) | Yangi (Cloudflare) |
|---|---|
| Xom `http.createServer` | Workers `fetch` handler |
| Qo'lda yozilgan WebSocket + xotiradagi Map | Durable Objects + hibernation API |
| `pg` drayveri, Postgres SQL | D1 (SQLite), `env.DB.prepare()` |
| Diskka fayl yozish (`data/uploads/`) | R2 obyekt xotirasi |
| `nodemailer` SMTP | Resend HTTP API |
