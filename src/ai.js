// Google Gemini orqali: toifalash, klasterlash (o'xshash murojaatlarni biriktirish),
// yechim taklif qilish. API kaliti hali yo'q bo'lsa ham ilova ishlashda davom etadi —
// funksiyalar shunchaki "fallback" natija qaytaradi (ai_status='pending' qoladi),
// keyinroq GEMINI_API_KEY qo'yilgach, scheduled() cron orqali avtomatik qayta ishlanadi.

const DEFAULT_MODEL = 'gemini-2.0-flash';

function hasGemini(env) { return !!env.GEMINI_API_KEY; }

async function callGemini(env, prompt, schema) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.2,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini bo\'sh javob qaytardi');
  return JSON.parse(text);
}

/* ── 1. Toifalash ──
   12 ta yo'nalish + "boshqa" — yoshlarga yo'naltirilgan, aniqroq taqsimot
   (dastlabki 8 tadan kengaytirildi). ID'lar eski qiymatlar bilan mos
   qoldirildi (talim/yol-xavfsizligi/ekologiya/ijtimoiy/sport/sogliq/
   raqamlashtirish) — faqat nomi/qamrovi aniqlashtirildi, mavjud
   murojaat/klasterlar buzilmasligi uchun. */
const CATEGORY_SCHEMA = {
  type: 'object',
  properties: {
    category_id: { type: 'string', enum: [
      'talim', 'oliy-talim', 'ish-kasb', 'yol-xavfsizligi', 'xavfsizlik',
      'ekologiya', 'ijtimoiy', 'sport', 'sogliq', 'raqamlashtirish',
      'uy-joy', 'tadbirkorlik', 'boshqa',
    ] },
    confidence: { type: 'number' },
  },
  required: ['category_id', 'confidence'],
};

export async function categorize(env, title, body) {
  if (!hasGemini(env)) return { category_id: 'boshqa', confidence: 0, ai_status: 'pending' };
  try {
    const prompt = `Sen yoshlar yozgan fuqarolik murojaatlarini toifalaydigan yordamchisan. Faqat JSON bilan javob ber.

Toifalar (bir-biriga mos kelmasa eng yaqinini tanla):
- talim: Maktab ta'limi (maktab, kolej — darslik, o'qituvchi, bino, jihoz)
- oliy-talim: Oliy ta'lim va grantlar (universitet qabuli, kontrakt, grant taqsimoti, talabalar turar joyi)
- ish-kasb: Ish va kasb (birinchi ish o'rni, amaliyot, tajribasiz yoshlarni ishga olish)
- yol-xavfsizligi: Transport va yo'llar (jamoat transporti jadvali/chegirmasi, yo'l holati, svetofor, piyoda o'tish joyi)
- xavfsizlik: Xavfsizlik (maktab atrofidagi xavfsizlik, bulling, kiberfiribgarlik)
- ekologiya: Ekologiya va hovli (chiqindi, ifloslanish, ko'kalamzorlashtirish, havo/suv sifati)
- ijtimoiy: Ijtimoiy himoya (nafaqalar, imkoniyati cheklangan yoshlar, yetim bolalar)
- sport: Sport va bo'sh vaqt (sport maydonchasi, stadion, to'garaklar, yoshlar markazlari)
- sogliq: Sog'liqni saqlash (shifoxona, poliklinika, ruhiy salomatlik, tibbiy xizmat sifati)
- raqamlashtirish: Raqamli xizmatlar (davlat portallari, ariza berish tartibi, internet sifati)
- uy-joy: Uy-joy va kommunal (suv, issiqlik, lift, yosh oilalar uchun ipoteka)
- tadbirkorlik: Tadbirkorlik (yoshlar startap kreditlari, soliq, biznesni ro'yxatdan o'tkazish)
- boshqa: Yuqoridagilarga mos kelmaydigan boshqa murojaatlar

Murojaat:
Sarlavha: ${title}
Matn: ${body || '(matn yo\'q)'}`;
    const r = await callGemini(env, prompt, CATEGORY_SCHEMA);
    if (!CATEGORY_SCHEMA.properties.category_id.enum.includes(r.category_id)) r.category_id = 'boshqa';
    return { ...r, ai_status: 'done' };
  } catch (e) {
    console.error('AI categorize xatosi:', e.message);
    return { category_id: 'boshqa', confidence: 0, ai_status: 'failed' };
  }
}

/* ── 2. Klasterlash: mavjudlarga moslashtirish yoki yangi yaratish ── */
const CLUSTER_SCHEMA = {
  type: 'object',
  properties: {
    matched_cluster_id: { type: 'string', nullable: true },
    new_title: { type: 'string' },
    new_summary: { type: 'string' },
  },
  required: ['new_title', 'new_summary'],
};

export async function matchOrCreateCluster(env, problem, existingClusters) {
  const fallback = { matched_cluster_id: null, new_title: problem.title.slice(0, 80), new_summary: problem.body?.slice(0, 160) || '' };
  if (!hasGemini(env)) return fallback;
  if (!existingClusters.length) return fallback;
  try {
    const list = existingClusters.map(c => `- id="${c.id}" sarlavha="${c.title}" umumlashtiruv="${c.summary || ''}"`).join('\n');
    const prompt = `Yangi murojaat quyidagi mavjud klasterlardan biriga mazmunan juda o'xshaydimi (aynan bir xil muammo haqida)?
Agar ha bo'lsa — shu klasterning id'sini matched_cluster_id'ga yoz.
Agar hech biriga mos kelmasa — matched_cluster_id'ni bo'sh qoldir va yangi klaster uchun qisqa sarlavha (5-8 so'z) va bir jumlali umumlashtiruv yoz.

Mavjud klasterlar:
${list}

Yangi murojaat:
Sarlavha: ${problem.title}
Matn: ${problem.body || '(matn yo\'q)'}`;
    const r = await callGemini(env, prompt, CLUSTER_SCHEMA);
    if (r.matched_cluster_id && !existingClusters.some(c => c.id === r.matched_cluster_id)) r.matched_cluster_id = null;
    return { ...fallback, ...r };
  } catch (e) {
    console.error('AI cluster xatosi:', e.message);
    return fallback;
  }
}

/* ── 3. Yechim takliflari ── */
const SOLUTIONS_SCHEMA = {
  type: 'object',
  properties: {
    solutions: {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] },
    },
  },
  required: ['solutions'],
};

export async function generateSolutions(env, cluster, exampleProblems) {
  if (!hasGemini(env)) return [];
  try {
    const examples = exampleProblems.slice(0, 5).map(p => `- ${p.title}: ${(p.body || '').slice(0, 120)}`).join('\n');
    const prompt = `Quyidagi muammo klasteri uchun 2-4 ta aniq, mahalliy hokimiyat yoki maktab darajasida amalga oshirilishi mumkin bo'lgan yechim varianti taklif qil. Har biri uchun qisqa sarlavha va 1-2 jumlali tushuntirish yoz. O'zbek tilida yoz.

Klaster: ${cluster.title}
Umumlashtiruv: ${cluster.summary || ''}
Namuna murojaatlar:
${examples}`;
    const r = await callGemini(env, prompt, SOLUTIONS_SCHEMA);
    return Array.isArray(r.solutions) ? r.solutions.slice(0, 4) : [];
  } catch (e) {
    console.error('AI solutions xatosi:', e.message);
    return [];
  }
}

/* ── 4. Post yorliqlash (fon rejimida, jamoalar/post oqimi uchun) ──
   Murojaat toifalashdan farqli: qattiq enum emas, erkin qisqa mavzu yorlig'i —
   keyin bir xil yorliqqa ega postlar "o'xshash postlar" sifatida bog'lanadi. */
const TOPIC_SCHEMA = {
  type: 'object',
  properties: { topic: { type: 'string' } },
  required: ['topic'],
};

export async function tagPost(env, title, body) {
  if (!hasGemini(env)) return { topic: null, ai_status: 'pending' };
  try {
    const prompt = `Quyidagi forum postining mavzusini 1-3 so'zda, kichik harflar bilan, umumlashtirilgan holda yoz (masalan: "futbol", "dasturlash", "sun'iy intellekt", "konsert"). Faqat JSON bilan javob ber.

Sarlavha: ${title}
Matn: ${body || '(matn yo\'q)'}`;
    const r = await callGemini(env, prompt, TOPIC_SCHEMA);
    const topic = (r.topic || '').trim().toLowerCase().slice(0, 40) || null;
    return { topic, ai_status: 'done' };
  } catch (e) {
    console.error('AI tagPost xatosi:', e.message);
    return { topic: null, ai_status: 'failed' };
  }
}

export { hasGemini };
