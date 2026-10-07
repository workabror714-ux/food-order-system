const mongoose = require("mongoose");

const FilialSchema = new mongoose.Schema({
  // Barqaror identifikator (eski buyurtmalardagi filialId bilan mos: "rustaveli", "mvd").
  // Yangi filiallar uchun avtomatik generatsiya qilinadi.
  slug:     { type: String, required: true, unique: true },
  name:     { type: String, required: true },
  address:  { type: String, default: "" },
  lat:      { type: Number, default: null },
  lng:      { type: Number, default: null },
  isActive: { type: Boolean, default: true }, // false = vaqtincha yopiq (qo'lda, admin tomonidan)
  order:    { type: Number, default: 0 },      // ko'rsatish tartibi

  // Ish vaqti jadvali — yoqilsa, filial faqat shu oraliqda "ochiq" hisoblanadi.
  // isActive=false har doim ustunlik qiladi (qo'lda yopish jadvaldan kuchliroq).
  useSchedule: { type: Boolean, default: false },
  openTime:    { type: String, default: "" }, // "HH:mm", masalan "09:00"
  closeTime:   { type: String, default: "" }, // "HH:mm", masalan "23:00"
}, { timestamps: true });

module.exports = mongoose.model("Filial", FilialSchema);
