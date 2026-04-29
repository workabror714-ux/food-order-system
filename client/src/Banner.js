const mongoose = require("mongoose");

const BannerSchema = new mongoose.Schema({
  title:       { type: String, default: "Mazali taomlar" },
  subtitle:    { type: String, default: "eshigingizgacha 🚀" },
  description: { type: String, default: "Yangi, tez va arzon yetkazib berish" },
  mediaUrl:    { type: String, default: "" },
  mediaType:   { type: String, default: "none" },
  bgColor:     { type: String, default: "#0d4a28" },
  events:      { type: Array,  default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Banner", BannerSchema);