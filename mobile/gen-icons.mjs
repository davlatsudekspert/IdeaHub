import sharp from 'sharp';
import fs from 'fs';

// Haqiqiy MindHub logotipi (public/index.html'dagi .tb-logo-mark bilan bir xil:
// oltin fonli dumaloq burchakli kvadrat + oq rangli doira+nuqta belgisi).
const GOLD = '#D4A017';
const WHITE = '#FFFFFF';

function markSvg(size, { transparent = false, round = false } = {}) {
  const r = round ? size / 2 : size * 0.225; // dumaloq burchak radiusi (yoki to'liq doira)
  const bg = transparent ? 'none' : `<rect width="${size}" height="${size}" rx="${r}" fill="${GOLD}"/>`;
  const cx = size / 2, cy = size / 2, cr = size * 0.30;
  const sw = size * 0.075;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg}
    <circle cx="${cx}" cy="${cy}" r="${cr}" fill="none" stroke="${WHITE}" stroke-width="${sw}"/>
    <line x1="${cx}" y1="${cy - cr * 0.55}" x2="${cx}" y2="${cy + cr * 0.05}" stroke="${WHITE}" stroke-width="${sw}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy + cr * 0.5}" r="${sw * 0.55}" fill="${WHITE}"/>
  </svg>`;
}

// Adaptiv "foreground" uchun belgi kichikroq (xavfsiz zonaga sig'ishi kerak) va shaffof fonda.
function foregroundSvg(size) {
  const inner = size * 0.62; // 108dp'dagi ~66dp xavfsiz zona nisbatiga mos
  const off = (size - inner) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g transform="translate(${off},${off})">${markSvg(inner, { transparent: false, round: false }).match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1]}</g>
  </svg>`;
}

const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const RES = '/home/user/IdeaHub/mobile/android/app/src/main/res';

for (const [density, size] of Object.entries(LEGACY)) {
  const dir = `${RES}/mipmap-${density}`;
  await sharp(Buffer.from(markSvg(size))).png().toFile(`${dir}/ic_launcher.png`);
  // round: mask the same square icon to a circle
  const roundMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#fff"/></svg>`);
  await sharp(Buffer.from(markSvg(size)))
    .composite([{ input: roundMask, blend: 'dest-in' }])
    .png()
    .toFile(`${dir}/ic_launcher_round.png`);
}

for (const [density, size] of Object.entries(FOREGROUND)) {
  const dir = `${RES}/mipmap-${density}`;
  await sharp(Buffer.from(foregroundSvg(size))).png().toFile(`${dir}/ic_launcher_foreground.png`);
}

// Adaptiv fon rangini navy'ga o'zgartiramiz (haqiqiy --navy-900 bilan bir xil).
fs.writeFileSync(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A2342</color>\n</resources>\n`
);

console.log('Ikonkalar yaratildi.');
