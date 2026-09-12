-- REDESIGN.md §3.2: "Yo'nalishlar" grid'i 8 ta toifani ko'rsatadi (4x2).
-- Mavjud 5 taga 3 tasi qo'shildi. Rang tanlovi: har biri qolganlaridan
-- ravshan farqlanishi kerak (ikkinchi darajali kodlash — matn/ikonka bilan
-- birga, hech qachon faqat rang bilan emas).
INSERT OR IGNORE INTO categories (id, name, color, icon) VALUES
  ('sport',          'Sport va bo''sh vaqt',     '#D6455D', '⚽'),
  ('sogliq',         'Sog''liqni saqlash',       '#0F7B8A', '⚕️'),
  ('raqamlashtirish','Raqamlashtirish',          '#5C7A99', '💻');
