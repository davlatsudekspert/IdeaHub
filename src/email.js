// Resend HTTP API orqali email. Workers'da xom SMTP/TCP imkoni yo'q (nodemailer
// ishlamaydi), lekin Resend'ning o'zi HTTP API bo'lgani uchun oddiy fetch yetarli.

export function hasEmail(env) { return !!env.RESEND_API_KEY; }

export async function sendVerifyCode(env, email, code, name) {
  if (!hasEmail(env)) throw new Error('Email sozlanmagan (RESEND_API_KEY kerak)');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:32px;background:#f8f9fa;border-radius:16px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:32px;font-weight:800;color:#C8922A">MindHub</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:24px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)">
        <div style="font-size:14px;color:#666;margin-bottom:16px">Salom, <strong>${name}</strong>!</div>
        <div style="font-size:14px;color:#666;margin-bottom:12px">Parolni tiklash uchun tasdiqlash kodi:</div>
        <div style="font-size:36px;font-weight:800;color:#C8922A;letter-spacing:8px;padding:16px;background:#fdf6e8;border-radius:8px;margin:16px 0">${code}</div>
        <div style="font-size:12px;color:#999;margin-top:16px">Bu kod 10 daqiqa ichida amal qiladi.</div>
      </div>
    </div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'MindHub <onboarding@resend.dev>',
      to: [email],
      subject: 'MindHub — Parol tiklash kodi',
      html,
    }),
  });
  if (!r.ok) throw new Error('Resend: ' + (await r.text()));
}
