const mongoose = require("mongoose");

const FilialSchema = new mongoose.Schema({
  // Barqaror identifikator (eski buyurtmalardagi filialId bilan mos: "rustaveli", "mvd").
  // Yangi filiallar uchun avtomatik generatsiya qilinadi.
  slug:     { type: String, required: true, unique: true },
  name:     { type: String, required: true },
  address:  { type: String, default: "" },
  lat:      { type: Number, default: null },
  lng:      { type: Number, default: null },
  isActive: { type: Boolean, default: true }, // false = vaqtincha yopiq
  order:    { type: Number, default: 0 },      // ko'rsatish tartibi
}, { timestamps: true });

module.exports = mongoose.model("Filial", FilialSchema);
