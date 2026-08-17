const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || 'mindhubteamm@gmail.com',
    pass: process.env.SMTP_PASS || 'kjvj wrbr wyqh tfti'
  }
});

async function sendVerifyCode(email, code, username) {
  const mailOptions = {
    from: '"MindHub" <mindhubteamm@gmail.com>',
    to: email,
    subject: 'MindHub — Parol tiklash kodi',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:32px;background:#f8f9fa;border-radius:16px">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:32px;font-weight:800;color:#C8922A">MindHub</div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)">
          <div style="font-size:14px;color:#666;margin-bottom:16px">Salom, <strong>${username}</strong>!</div>
          <div style="font-size:14px;color:#666;margin-bottom:12px">Parolni tiklash uchun tasdiqlash kodi:</div>
          <div style="font-size:36px;font-weight:800;color:#C8922A;letter-spacing:8px;padding:16px;background:#fdf6e8;border-radius:8px;margin:16px 0">${code}</div>
          <div style="font-size:12px;color:#999;margin-top:16px">Bu kod 10 daqiqa ichida amal qiladi.</div>
        </div>
        <div style="text-align:center;font-size:11px;color:#aaa;margin-top:20px">Agar siz parolni tiklashni so'ramagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.</div>
      </div>
    `
  };
  return transporter.sendMail(mailOptions);
}

module.exports = { sendVerifyCode };
