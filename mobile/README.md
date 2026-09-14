# MindHub — Android ilova qobig'i

Bu papka MindHub veb-ilovasini ([mindhub.davlatsudekspert.workers.dev](https://mindhub.davlatsudekspert.workers.dev))
[Capacitor](https://capacitorjs.com) yordamida haqiqiy Android ilovasiga
(`.apk`) o'raydi. Ilova alohida kod bazasi emas — u qurilmadagi WebView
ichida jonli MindHub saytini ochadi, shuning uchun saytdagi har qanday
yangilanish (yangi bo'lim, tuzatish) alohida "ilova yangilanishi"siz
darhol ilovada ham ko'rinadi.

## `.apk` faylini qanday olish mumkin

### 1-yo'l — avtomatik (tavsiya etiladi)

`mobile/`ga tegishli har qanday o'zgarish `main` branch'ga tushganda
`.github/workflows/build-android.yml` avtomatik ishga tushadi va
GitHub'ning o'zida (Android SDK bilan) haqiqiy `.apk` faylini yig'adi.
Natijani olishning ikki yo'li bor:

**Doimiy havola (eng qulay):** eng so'nggi tuzilgan APK'lar har doim shu
yerda — hech qanday qidirish shart emas:

> **Asosiy (tavsiya etiladi):** https://github.com/davlatsudekspert/IdeaHub/releases/download/android-latest/app-release.apk
>
> Sinov nusxasi (debug): https://github.com/davlatsudekspert/IdeaHub/releases/download/android-latest/app-debug.apk

(Bu — `android-latest` nomli Release, har safar yangi build muvaffaqiyatli
tugaganda avtomatik yangilanadi: eskisi o'chirilib, yangisi joylashtiriladi.)

`app-release.apk` — "debug" cheklovlarisiz, oddiy foydalanish uchun
mo'ljallangan asosiy nusxa (lekin Play Store uchun emas — pastga
qarang). `app-debug.apk` — Android Studio'ning standart debug-kaliti
bilan imzolangan sinov nusxasi.

**Yoki Actions orqali** (agar build tarixini yoki boshqa branch'ning
natijasini ko'rish kerak bo'lsa):

1. Repozitoriyning **Actions** bo'limiga o'ting.
2. **"Android APK yig'ish"** ishga tushuvini oching (oxirgi muvaffaqiyatli).
3. Pastdagi **Artifacts** qismidan `mindhub-apk`ni yuklab oling — ichida
   ikkalasi ham bor.

Qo'lda ham ishga tushirish mumkin: Actions → "Android APK yig'ish" →
**Run workflow**.

### 2-yo'l — o'zingizning kompyuteringizda

Agar sizda Android Studio (yoki JDK + Android SDK + Gradle) o'rnatilgan
bo'lsa:

```bash
cd mobile
npm install
npx cap sync android
cd android
./gradlew assembleDebug    # yoki: ./gradlew assembleRelease
```

Tayyor fayl: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
(`assembleRelease` uchun — o'sha papkaning `release/` versiyasi, lekin
bu holda o'zingiz `RELEASE_KEYSTORE_PASSWORD`/`RELEASE_KEY_PASSWORD`
environment o'zgaruvchilarini va `mobile/android/app/release.keystore`
faylini o'zingiz tayyorlashingiz kerak bo'ladi — CI'da bu avtomatik,
vaqtinchalik generatsiya qilinadi.)

Yoki `android/` papkasini to'g'ridan-to'g'ri Android Studio'da oching
(**Open** → `mobile/android`) va **Build → Build APK(s)** ni bosing.

### "Noma'lum manbalardan o'rnatish" — nega baribir kerak?

`app-release.apk` "debug" emas, lekin bu Google Play orqali emas,
to'g'ridan-to'g'ri fayldan o'rnatilayotgani uchun Android baribir bir
martalik ruxsat so'raydi (odatda "Ushbu manbadan o'rnatishga ruxsat
berilsin?" oynasi; Xiaomi/MIUI qurilmalarida "Maxsus ruxsatlar" ostida
alohida yoqish talab qilinishi mumkin). **Bu — Android'ning o'zining
xavfsizlik qoidasi, "debug" yoki "release" ekanidan qat'i nazar HAR
QANDAY Play Store'dan tashqarida tarqatilgan APK uchun amal qiladi** —
buni faylning o'zi yoki uni qanday yig'ishimiz orqali chetlab
o'tolmaymiz.

Buni butunlay yo'qotishning yagona yo'li — ilovani **Google Play
Store**'ga chiqarish (u yerdan o'rnatilgan ilovalar avtomatik ishonchli
hisoblanadi). Bu esa alohida narsalarni talab qiladi: sizning o'zingizning
Google Play Console hisobingiz (bir martalik $25 ro'yxatdan o'tish to'lovi,
sizning to'lov kartangiz/hisobingiz bilan), doimiy saqlanadigan release
imzo kaliti (bir marta yaratilib, HAR BIR keyingi yangilanishda bir xil
bo'lishi shart) va Google'ning ko'rib chiqish jarayonidan o'tish. Bularning
hech birini men sizning hisobingizsiz/to'lovingizsiz o'zim qila olmayman —
lekin xohlasangiz, kerakli hamma narsani (signed *release* AAB, do'kon
sahifasi matni va h.k.) tayyorlab, faqat yuklashning o'zini sizga
qoldirishim mumkin.

## Tuzilishi

- `capacitor.config.json` — ilova nomi (`MindHub`), paket ID
  (`uz.mindhub.app`) va `server.url` (WebView qaysi manzilni ochishi)
  shu yerda.
- `www/` — zaxira sahifa (faqat `server.url` ishlamay qolsa ko'rinadi).
- `android/` — Capacitor tomonidan avtomatik yaratilgan, standart Gradle
  asosidagi Android loyihasi.
- `gen-icons.mjs` — ilova ikonkasini (haqiqiy MindHub logotipidan: oltin
  fonli doira+nuqta belgisi) barcha zichlik o'lchamlarida qayta yaratish
  uchun skript (`node gen-icons.mjs`).

## Joylashuv (GPS) ruxsati

Murojaat yuborishda "Joriy joylashuvni aniqlash" tugmasi ishlashi uchun
`AndroidManifest.xml`ga `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`
ruxsatlari qo'shilgan. Ilova birinchi marta joylashuv so'raganda tizim
ruxsat oynasini chiqaradi.
