const mongoose = require("mongoose");

const FoodSchema = new mongoose.Schema(
  {
    title: {
      uz: { type: String, required: true },
      ru: { type: String, default: "" },
      en: { type: String, default: "" },
    },

    // Mijozga ko'rinadigan narx:
    // Delever asl narxi + idish puli
    price: {
      type: Number,
      required: true,
    },

    // Delever'dan kelgan asl narx
    deleverBasePrice: {
      type: Number,
      default: 0,
    },

    // Har bir dona taom uchun idish puli
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

    image: {
      type: String,
      default: "",
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },

    source: {
      type: String,
      enum: ["local", "delever"],
      default: "local",
      index: true,
    },

    deleverId: {
      type: String,
      trim: true,
    },

    deleverCategoryId: {
      type: String,
      default: "",
    },

    deleverRestaurantId: {
      type: String,
      default: "",
    },

    externalCode: {
      type: String,
      default: "",
    },

    // Delever'dan kelgan original modifierlar
    modifierGroups: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // Modifier guruhlari va modifierlarning
    // uz/ru/en tarjima qilingan nusxasi
    translatedModifierGroups: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    deleverModifierAvailability: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    isDeletedInSource: {
      type: Boolean,
      default: false,
    },

    deleverUpdatedAt: {
      type: Date,
      default: null,
    },

    lastSyncedAt: {
      type: Date,
      default: null,
    },

    // Admin qo'lda kiritgan tarjimalarni
    // avtomatik tarjimadan himoya qiladi.
    translationManual: {
      titleUz: {
        type: Boolean,
        default: false,
      },
      titleEn: {
        type: Boolean,
        default: false,
      },
      categoryUz: {
        type: Boolean,
        default: false,
      },
      categoryEn: {
        type: Boolean,
        default: false,
      },
      descriptionUz: {
        type: Boolean,
        default: false,
      },
      descriptionEn: {
        type: Boolean,
        default: false,
      },
    },

    autoTranslatedAt: {
      type: Date,
      default: null,
    },

    manualTranslationUpdatedAt: {
      type: Date,
      default: null,
    },

    translationError: {
      type: String,
      default: "",
    },

    deleverRaw: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

FoodSchema.index({ "category.uz": 1 });
FoodSchema.index({ createdAt: -1 });
FoodSchema.index(
  { deleverId: 1 },
  { unique: true, sparse: true }
);
FoodSchema.index({
  source: 1,
  deleverRestaurantId: 1,
  isDeletedInSource: 1,
});
FoodSchema.index({ sortOrder: 1, createdAt: -1 });

FoodSchema.methods.getTitle = function (lang = "uz") {
  return (
    this.title?.[lang] ||
    this.title?.uz ||
    this.title?.ru ||
    ""
  );
};

module.exports = mongoose.model("Food", FoodSchema);
