// Filial ish vaqti jadvali: "useSchedule" yoqilgan bo'lsa, filial faqat
// openTime–closeTime oralig'ida (Toshkent vaqti bo'yicha) "ochiq" hisoblanadi.
// isActive=false (qo'lda "vaqtincha yopiq" qilingan) har doim ustunlik qiladi —
// jadval ochiq vaqtni ko'rsatsa ham, qo'lda yopilgan filial yopiq qoladi.

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, DST yo'q (O'zbekiston)

// Joriy (yoki berilgan) vaqtni Toshkent bo'yicha "HH:mm" formatida qaytaradi
const tashkentHHMM = (date = new Date()) => {
  const t = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

// "HH:mm" formatini tekshiradi (00:00 – 23:59)
const isValidTime = (v) => typeof v === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);

// openTime–closeTime oralig'ida joriy vaqt bormi.
// Kechayarimdan oshadigan jadvalni ham qo'llab-quvvatlaydi (masalan 10:00–02:00).
const isWithinSchedule = (openTime, closeTime, nowHHMM = tashkentHHMM()) => {
  if (!isValidTime(openTime) || !isValidTime(closeTime)) return true; // jadval to'liq emas — cheklamaymiz
  if (openTime === closeTime) return true; // bir xil vaqt — 24 soat ishlaydi deb hisoblanadi
  if (openTime < closeTime) return nowHHMM >= openTime && nowHHMM < closeTime;
  return nowHHMM >= openTime || nowHHMM < closeTime; // kechayarim oshib ketadigan oraliq
};

// Filial hozir mijozlar uchun ochiqmi (qo'lda yopish + ish vaqti jadvali birgalikda)
const isFilialOpenNow = (filial) => {
  if (!filial) return false;
  if (filial.isActive === false) return false;
  if (!filial.useSchedule) return true;
  return isWithinSchedule(filial.openTime, filial.closeTime);
};

module.exports = { tashkentHHMM, isValidTime, isWithinSchedule, isFilialOpenNow };
