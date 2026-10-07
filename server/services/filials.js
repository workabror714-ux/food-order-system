// Filiallar xizmati: DB + xotira cache (sinxron kodlar uchun: taxi narxi, order)
// Ko'p instance: Redis pub/sub orqali kesh barcha instance'larda sinxronlanadi.
const Filial = require("../models/Filial");
const { redis, subscriber } = require("../lib/redis");
const FILIALS_CHANNEL = "filials:changed";

// Boshlang'ich filiallar (DB bo'sh bo'lsa, bir marta yoziladi)
const DEFAULT_FILIALS = [
  { slug: "rustaveli", name: "Yalpiz — Shota Rustaveli, 115", address: "Shota Rustaveli ko'chasi, 115, Toshkent", lat: 41.261532, lng: 69.228442, isActive: true, order: 0 },
  { slug: "mvd",       name: "Yalpiz MVD — Mirobod, 1/1",     address: "Mirobod ko'chasi, 1/1, Toshkent",     lat: 41.3015,   lng: 69.2850,   isActive: true, order: 1 },
];

let FILIALS = {}; // { slug: {_id,slug,name,address,lat,lng,isActive} }

// DB'dan o'qib, faqat shu instance cache'ini yangilaydi (publish qilmaydi)
const _loadFromDb = async () => {
  const list = await Filial.find({}).sort({ order: 1, createdAt: 1 });
  const next = {};
  for (const f of list) {
    next[f.slug] = {
      _id: String(f._id), slug: f.slug, name: f.name,
      address: f.address || "", lat: f.lat, lng: f.lng,
      isActive: f.isActive !== false,
      useSchedule: !!f.useSchedule,
      openTime: f.openTime || "",
      closeTime: f.closeTime || "",
    };
  }
  FILIALS = next;
  return list;
};

// CRUD'dan keyin chaqiriladi: cache'ni yangilaydi VA boshqa instance'larga xabar beradi
const reloadFilialsCache = async () => {
  try {
    const list = await _loadFromDb();
    if (redis) redis.publish(FILIALS_CHANNEL, "1").catch(() => {});
    return list;
  } catch (e) {
    console.error("Filiallar cache xato:", e.message);
    return [];
  }
};

// Boshqa instance filial o'zgartirsa — bu instance ham cache'ni yangilaydi
if (subscriber) {
  subscriber.subscribe(FILIALS_CHANNEL).catch(() => {});
  subscriber.on("message", (ch) => { if (ch === FILIALS_CHANNEL) _loadFromDb().catch(() => {}); });
}

// Server ishga tushganda: DB bo'sh bo'lsa default yoziladi, keyin cache yuklanadi
const seedFilials = async () => {
  try {
    const count = await Filial.countDocuments();
    if (count === 0) {
      await Filial.insertMany(DEFAULT_FILIALS);
      console.log("✅ Boshlang'ich filiallar yozildi");
    }
    await reloadFilialsCache();
    console.log(`✅ ${Object.keys(FILIALS).length} ta filial yuklandi`);
  } catch (e) {
    console.error("Filiallar seed xato:", e.message);
  }
};

// slug bo'yicha filial (yo'q bo'lsa null)
const getFilial = (id) => (id && FILIALS[id]) ? FILIALS[id] : null;

// Tanlangan filial yoki fallback (birinchi mavjud)
const getSelectedFilial = (filialId) => {
  if (filialId && FILIALS[filialId]) return FILIALS[filialId];
  const first = Object.values(FILIALS)[0];
  return first || null;
};

// slug generatsiyasi: nomdan, lotin harflari + raqam, takrorlanmas
const makeFilialSlug = (name) => {
  const base = String(name || "filial")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "filial";
  return `${base}-${Date.now().toString(36)}`;
};

module.exports = { DEFAULT_FILIALS, reloadFilialsCache, seedFilials, getFilial, getSelectedFilial, makeFilialSlug };
