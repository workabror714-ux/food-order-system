const mongoose = require("mongoose");

const FoodSchema = new mongoose.Schema({
  // Ko'p tilli nom va tavsif
  title: {
    uz: { type: String, required: true },
    ru: { type: String, default: "" },
    en: { type: String, default: "" },
  },
  // Mijozga ko‘rinadigan yakuniy narx:
  // Delever asl narxi + idish puli
  price: {
    type: Number,
    required: true,
  },

  // Delever/Neon Alisa’dan kelgan asl narx
  deleverBasePrice: {
    type: Number,
    default: 0,
  },

  // Har bir dona taom uchun idish/qadoq puli
  packagingFee: {
    type: Number,
    default: 0,
  },

  category: {
    uz: { type: String, required: true },
    ru: { type: String, default: "" },
    en: { type: String, default: "" },
  },
  description: {
    uz: { type: String, default: "" },
    ru: { type: String, default: "" },
    en: { type: String, default: "" },
  },
  image: { type: String, default: "" },
  isAvailable: { type: Boolean, default: true },

  // Menyu qayerdan kelganini ajratamiz. Delever taomlari admin paneldan
  // qo'lda o'zgartirilmaydi — asosiy manba Neon Alisa/Delever bo'ladi.
  source: {
    type: String,
    enum: ["local", "delever"],
    default: "local",
    index: true,
  },
  deleverId: { type: String, trim: true },
  deleverCategoryId: { type: String, default: "" },
  deleverRestaurantId: { type: String, default: "" },
  externalCode: { type: String, default: "" },
  modifierGroups: { type: [mongoose.Schema.Types.Mixed], default: [] },
  deleverModifierAvailability: { type: mongoose.Schema.Types.Mixed, default: {} },
  sortOrder: { type: Number, default: 0 },
  isDeletedInSource: { type: Boolean, default: false },
  deleverUpdatedAt: { type: Date, default: null },
  lastSyncedAt: { type: Date, default: null },
  // Tarjima oxirgi marta qo‘lda o‘zgartirilgan vaqt
  translationUpdatedAt: {
    type: Date,
    default: null,
  },
  deleverRaw: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

// Indekslar: kategoriya filtri + ro'yxat sort
FoodSchema.index({ "category.uz": 1 });
FoodSchema.index({ createdAt: -1 });
FoodSchema.index({ deleverId: 1 }, { unique: true, sparse: true });
FoodSchema.index({ source: 1, deleverRestaurantId: 1, isDeletedInSource: 1 });
FoodSchema.index({ sortOrder: 1, createdAt: -1 });

// Virtual: tanlangan tilda nom
FoodSchema.methods.getTitle = function(lang = "uz") {
  return this.title[lang] || this.title.uz || "";
};

module.exports = mongoose.model("Food", FoodSchema);
