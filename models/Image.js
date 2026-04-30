const mongoose = require("mongoose");

// Rasmlarni MongoDB da saqlash modeli
const ImageSchema = new mongoose.Schema({
  name:     { type: String, default: "image" },
  mimeType: { type: String, default: "image/jpeg" },
  size:     { type: Number, default: 0 },
  data:     { type: String, required: true }, // base64 data URL
}, { timestamps: true });

module.exports = mongoose.model("Image", ImageSchema);