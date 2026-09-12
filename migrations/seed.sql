-- Boshlang'ich ma'lumotlar: O'zbekiston hududlari va murojaat toifalari.
-- Maktablar bu yerda urug'lanmaydi — birinchi murojaatda foydalanuvchi nomini
-- kiritganda avtomatik yaratiladi (findOrCreateSchool), soxta ro'yxat emas.

INSERT OR IGNORE INTO regions (id, name) VALUES
  ('qoraqalpogiston', 'Qoraqalpog''iston Respublikasi'),
  ('andijon',         'Andijon viloyati'),
  ('buxoro',          'Buxoro viloyati'),
  ('fargona',         'Farg''ona viloyati'),
  ('jizzax',          'Jizzax viloyati'),
  ('xorazm',          'Xorazm viloyati'),
  ('namangan',        'Namangan viloyati'),
  ('navoiy',          'Navoiy viloyati'),
  ('qashqadaryo',     'Qashqadaryo viloyati'),
  ('samarqand',       'Samarqand viloyati'),
  ('sirdaryo',        'Sirdaryo viloyati'),
  ('surxondaryo',     'Surxondaryo viloyati'),
  ('toshkent-vil',    'Toshkent viloyati'),
  ('toshkent-shahar', 'Toshkent shahri');

-- Ranglar dataviz ko'rsatmasiga ko'ra tekshirilgan (scripts/validate_palette.js):
-- kontrast va yorqinlik diapazoni o'tdi; ekologiya/yo'l-xavfsizligi rang farqi
-- "faqat ikkinchi darajali kodlash bilan qonuniy" oraliqda — shu sababli har bir
-- toifa UI'da HAR DOIM ikonka + nom bilan birga chiqadi, hech qachon faqat rang
-- bilan emas. "Boshqa" ataylab neytral (kam to'yingan) — alohida ajralib
-- turmasligi kerak, shu uning vazifasi.
INSERT OR IGNORE INTO categories (id, name, color, icon) VALUES
  ('talim',            'Ta''lim infratuzilmasi',  '#3D7BEB', '🏫'),
  ('yol-xavfsizligi',  'Yo''l xavfsizligi',        '#D9591F', '🚦'),
  ('ekologiya',        'Ekologiya va tozalik',     '#238753', '🌱'),
  ('ijtimoiy',         'Ijtimoiy xizmatlar',       '#8B5CF6', '🤝'),
  ('boshqa',           'Boshqa',                   '#917B5C', '📌');
