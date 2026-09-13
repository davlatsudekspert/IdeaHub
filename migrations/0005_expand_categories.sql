-- Foydalanuvchi taqdim etgan namuna (yoshlarga yo'naltirilgan toifalar) asosida
-- kengaytirish. MindHub boshidanoq "yoshlar boshqaradigan" platforma sifatida
-- yaratilgan (package.json'ga qarang) — shu sabab bu o'zgarish yangi yo'nalish
-- emas, mavjud shaxsni aniqroq ifodalash. ID'lar o'zgarishsiz qoldirildi
-- (mavjud clusters/problems yozuvlari buzilmasligi uchun) — faqat nom/ikonka
-- yangilandi, bittasi ikkiga bo'lindi (talim -> maktab + yangi oliy-talim).

UPDATE categories SET name = 'Maktab ta''limi', icon = '🏫' WHERE id = 'talim';
UPDATE categories SET name = 'Transport va yo''llar', icon = '🚌' WHERE id = 'yol-xavfsizligi';
UPDATE categories SET name = 'Ekologiya va hovli', icon = '🌱' WHERE id = 'ekologiya';
UPDATE categories SET name = 'Ijtimoiy himoya', icon = '🤝' WHERE id = 'ijtimoiy';
UPDATE categories SET name = 'Raqamli xizmatlar', icon = '💻' WHERE id = 'raqamlashtirish';

INSERT OR IGNORE INTO categories (id, name, color, icon) VALUES
  ('oliy-talim',   'Oliy ta''lim va grantlar', '#9C4FA8', '🎓'),
  ('ish-kasb',     'Ish va kasb',              '#C77E1B', '💼'),
  ('xavfsizlik',   'Xavfsizlik',               '#B23A3A', '🛡️'),
  ('uy-joy',       'Uy-joy va kommunal',       '#6B8E4E', '🏠'),
  ('tadbirkorlik', 'Tadbirkorlik',             '#C1478A', '🚀');
