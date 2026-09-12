-- Eski ilovadagi kabi 6 ta boshlang'ich jamoa, "tizim" foydalanuvchisi nomidan
-- yaratiladi (u_system — parol bilan kira olmaydi, faqat egalik uchun).
-- INSERT OR IGNORE — migratsiya qayta ishga tushsa ham xavfsiz.

INSERT OR IGNORE INTO users (id, username, name, email, pass, color, is_banned)
VALUES ('u_system', 'mindhub', 'MindHub', 'system@mindhub.uz', '!disabled!', '#C8922A', 0);

INSERT OR IGNORE INTO communities (id, slug, name, description, color, owner_id) VALUES
  ('c_tech',  'texnologiya', 'Texnologiya', 'IT, dasturlash, AI haqida.',        '#4D8FFF', 'u_system'),
  ('c_sport', 'sport',       'Sport',       'Futbol, kurash, boks va boshqalar.', '#46C97A', 'u_system'),
  ('c_uzb',   'ozbekiston',  "O'zbekiston", 'Vatanimiz haqida.',                  '#C8922A', 'u_system'),
  ('c_music', 'musiqa',      'Musiqa',      "O'zbek va jahon musiqasi.",          '#9B6FD4', 'u_system'),
  ('c_ilm',   'ilm',         'Ilm-Fan',     "Fan, ta'lim, kitoblar.",             '#3AADCC', 'u_system'),
  ('c_kulgu', 'kulgu',       'Kulgu',       'Kulgili kontent, hazillar.',         '#E8703A', 'u_system');
