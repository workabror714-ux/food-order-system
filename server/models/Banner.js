const mongoose = require("mongoose");

const BannerSchema = new mongoose.Schema({
  // Asosiy ma'lumot
  title:       { type: String, default: "Mazali taomlar" },
  subtitle:    { type: String, default: "Yalpiz restoranidan" },
  description: { type: String, default: "" },
  buttonText:  { type: String, default: "" },
  buttonLink:  { type: String, default: "" },

  // Media
  mediaType:   { type: String, enum: ["none","image","video"], default: "none" },
  mediaUrl:    { type: String, default: "" },
  bgColor:     { type: String, default: "#1a5c30" },

  // Slider uchun
  order:       { type: Number, default: 0 },   // tartib
  isActive:    { type: Boolean, default: true },

  // Muddatli aksiya
  startDate:   { type: Date, default: null },
  endDate:     { type: Date, default: null },

  // Events/chips
  events: [{
    id:    { type: String },
    label: { type: String },
    emoji: { type: String, default: "🔥" },
  }],
}, { timestamps: true });

module.exports = mongoose.model("Banner", BannerSchema);