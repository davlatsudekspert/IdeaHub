'use strict';
/*
 * Markaziy konfiguratsiya — barcha maxfiy kalitlar FAQAT env orqali keladi.
 *
 * ⚠️  MUHIM: Ilgari Telegram bot tokeni va Gmail "app password" kod ichiga
 *     yozib qo'yilgan edi va git tarixiga tushgan. Ular ochiq hisoblanadi:
 *       1) Telegram tokenini @BotFather → /revoke orqali qayta oling.
 *       2) Gmail app password'ni Google akkauntda o'chirib, yangisini yarating.
 *       3) Yangi qiymatlarni hosting (Railway) env o'zgaruvchilariga yozing.
 *
 * Kerakli env o'zgaruvchilar:
 *   SECRET          — token/parol imzolash kaliti (majburiy, prod uchun)
 *   DATABASE_URL    — PostgreSQL ulanish satri
 *   TG_BOT_TOKEN    — Telegram bot tokeni (Telegram login + kod yuborish uchun)
 *   TG_BOT_NAME     — bot username'i (default: mind_hubbot)
 *   RESEND_API_KEY  — email yuborish uchun (tavsiya etiladi)
 *   SMTP_USER/SMTP_PASS — Resend bo'lmasa, Gmail SMTP zaxira varianti
 *   APP_URL         — saytning tashqi manzili (parol tiklash havolalari uchun)
 */

const path = require('path');

/* Yuklangan fayllar papkasi — BITTA joyda aniqlanadi.
   Ilgari server.js `__dirname` (ya'ni repo ildizi), routes.js esa `../data`
   ishlatardi: fayllar data/uploads ga yozilib, /uploads dan o'qilardi —
   natijada yuklangan rasm/video doim 404 qaytarardi. */
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const TG_BOT_TOKEN   = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const TG_BOT_NAME    = process.env.TG_BOT_NAME  || 'mind_hubbot';
const SMTP_USER      = process.env.SMTP_USER    || '';
const SMTP_PASS      = process.env.SMTP_PASS    || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const APP_URL        = process.env.APP_URL      || `http://localhost:${process.env.PORT || 3000}`;

const hasTelegram = !!TG_BOT_TOKEN;
const hasEmail    = !!RESEND_API_KEY || !!(SMTP_USER && SMTP_PASS);

function warnMissing() {
  const missing = [];
  if (!process.env.SECRET) missing.push('SECRET (token imzolash kaliti)');
  if (!hasTelegram)        missing.push('TG_BOT_TOKEN (Telegram login ishlamaydi)');
  if (!hasEmail)           missing.push('RESEND_API_KEY yoki SMTP_USER+SMTP_PASS (email yuborilmaydi)');
  if (missing.length) {
    console.warn('\n⚠️  Sozlanmagan env o\'zgaruvchilar:');
    missing.forEach(m => console.warn('   • ' + m));
    console.warn('   Tegishli funksiyalar o\'chirilgan holatda ishlaydi.\n');
  }
}

module.exports = {
  DATA_DIR, UPLOAD_DIR,
  TG_BOT_TOKEN, TG_BOT_NAME,
  SMTP_USER, SMTP_PASS,
  RESEND_API_KEY, APP_URL,
  hasTelegram, hasEmail,
  warnMissing,
};
