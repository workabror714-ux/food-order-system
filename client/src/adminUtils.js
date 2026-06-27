// Admin panel uchun umumiy yordamchilar (sof funksiyalar + rasm yuklash)
import { api } from "./api";

// Rasm compress — 2MB dan katta bo'lsa kichiklashtiradi
export const compressImage = (file) => new Promise((resolve) => {
  if (file.size < 2 * 1024 * 1024) { resolve(file); return; }
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new window.Image();
    img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const maxW = 1920;
      if (width > maxW) { height = Math.round(height * maxW / width); width = maxW; }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        const out = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        resolve(blob.size > file.size ? file : out);
      }, "image/jpeg", 0.92);
    };
  };
});

// Faylni serverga yuklaydi → URL qaytaradi (auth api orqali)
export const uploadToServer = async (file) => {
  const fd = new FormData();
  fd.append("image", file);
  const data = await api.upload("/api/upload", fd);
  return data.url;
};

// Ko'p tilli maydondan qiymat
export const getField = (f, lang = "uz") => {
  if (!f) return "";
  if (typeof f === "string") return f;
  return f[lang] || f.uz || f.ru || f.en || "";
};

// Kategoriya tartibi
const CATEGORY_ORDER = [
  "Birinchi taomlar", "Suyuq taomlar", "Sho'rvalar",
  "Quyuq ovqat", "Ikkinchi taomlar", "Go'shtli asortiment",
  "Grill", "Hamir ovqat", "Pide",
  "Salatlar", "Fast food", "Burger", "Pizza",
  "Ichimliklar", "Bar", "Desertlar", "Desert"
];
const normalizeCat = (v) => String(v || "").toLowerCase().trim();
const getCategoryRank = (cat) => {
  const key = normalizeCat(getField(cat, "uz"));
  const idx = CATEGORY_ORDER.findIndex(c => normalizeCat(c) === key);
  return idx === -1 ? 999 : idx;
};
export const sortCategories = (cats) => [...cats].sort((a, b) => {
  const rankA = getCategoryRank(a);
  const rankB = getCategoryRank(b);
  if (rankA !== rankB) return rankA - rankB;
  return normalizeCat(getField(a, "uz")).localeCompare(normalizeCat(getField(b, "uz")));
});

export const LANGS = ["uz", "ru", "en"];
export const LANG_LABELS = { uz: "🇺🇿 O'zbek", ru: "🇷🇺 Русский", en: "🇬🇧 English" };
