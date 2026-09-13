-- Murojaat joylashuvi (REDESIGN 3.0 — foydalanuvchi taklifi): muammoni hal
-- qiluvchilar uchun eng muhim ma'lumot aynan QAYERDA ekani. Yuborishda
-- brauzer geolokatsiyasi (lat/lng) YOKI qo'lda yozilgan aniq manzil
-- (address) — ikkovidan kamida bittasi majburiy (backend validatsiyasi).
-- Ikkalasi ham NULL bo'lishi mumkin bo'lgan ustunlar sifatida qo'shiladi —
-- eski (bu o'zgarishdan oldingi) murojaatlarda joylashuv bo'lmaydi, bu
-- normal holat va ularni buzmaydi.
ALTER TABLE problems ADD COLUMN lat REAL;
ALTER TABLE problems ADD COLUMN lng REAL;
ALTER TABLE problems ADD COLUMN address TEXT;
