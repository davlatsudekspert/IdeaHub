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
Natijani olish:

1. Repozitoriyning **Actions** bo'limiga o'ting.
2. **"Android APK yig'ish"** ishga tushuvini oching (oxirgi muvaffaqiyatli).
3. Pastdagi **Artifacts** qismidan `mindhub-debug-apk`ni yuklab oling —
   ichida `app-debug.apk` bor.

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
./gradlew assembleDebug
```

Tayyor fayl: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Yoki `android/` papkasini to'g'ridan-to'g'ri Android Studio'da oching
(**Open** → `mobile/android`) va **Build → Build APK(s)** ni bosing.

> **Eslatma:** yuqoridagi ikkala yo'l ham hozircha faqat *debug* (sinov)
> APK yaratadi — imzosi test-kalit bilan, shuning uchun faqat "noma'lum
> manbalardan o'rnatish"ga ruxsat berib telefoningizga o'rnatish mumkin,
> Google Play'ga yuklab bo'lmaydi. Play Store'ga chiqarish uchun alohida
> *release* imzo kaliti yaratish va `android/app/build.gradle`'da
> signing config sozlash kerak bo'ladi — bu keyingi qadam.

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
