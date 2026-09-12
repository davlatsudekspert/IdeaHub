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

/* ── 1. Toifalash ── */
const CATEGORY_SCHEMA = {
  type: 'object',
  properties: {
    category_id: { type: 'string', enum: ['talim', 'yol-xavfsizligi', 'ekologiya', 'ijtimoiy', 'boshqa'] },
    confidence: { type: 'number' },
  },
  required: ['category_id', 'confidence'],
};

export async function categorize(env, title, body) {
  if (!hasGemini(env)) return { category_id: 'boshqa', confidence: 0, ai_status: 'pending' };
  try {
    const prompt = `Sen yoshlar yozgan fuqarolik murojaatlarini toifalaydigan yordamchisan. Faqat JSON bilan javob ber.

Toifalar:
- talim: Ta'lim infratuzilmasi (maktab, kolej, universitet bilan bog'liq muammolar)
- yol-xavfsizligi: Yo'l xavfsizligi (piyoda o'tish joyi, svetofor, yo'l belgisi, tezlik)
- ekologiya: Ekologiya va tozalik (chiqindi, ifloslanish, ko'kalamzorlashtirish, suv)
- ijtimoiy: Ijtimoiy xizmatlar (tibbiyot, jamoat transporti, kommunal xizmatlar)
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

export { hasGemini };
