const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
    },

    customerPhone: {
      type: String,
      required: true,
    },

    persons: {
      type: Number,
      default: 1,
      min: 1,
    },

    items: [
      {
        foodId: {
          type: String,
        },

        deleverProductId: {
          type: String,
          default: "",
        },

        // Mijoz/admin panelida ko'rinadigan nom
        title: {
          type: String,
          default: "",
        },

        // Delever menyusidagi asl nom
        deleverTitle: {
          type: String,
          default: "",
        },

        // Mijoz to'laydigan birlik narxi:
        // Delever asl narxi + idish puli
        price: {
          type: Number,
          default: 0,
        },

        // Deleverga yuboriladigan asl birlik narxi
        deleverBasePrice: {
          type: Number,
          default: 0,
        },

        // Har bir dona uchun idish puli
        packagingFee: {
          type: Number,
          default: 0,
        },

        quantity: {
          type: Number,
          default: 1,
          min: 1,
        },

        modifiers: {
          type: [
            mongoose.Schema.Types.Mixed,
          ],
          default: [],
        },
      },
    ],

    // Mijoz to'laydigan taomlar jami:
    // asl narx + idish puli
    totalPrice: {
      type: Number,
      default: 0,
    },

    // Buyurtmadagi jami idish puli
    packagingTotal: {
      type: Number,
      default: 0,
    },

    // Deleverga yuboriladigan itemsCost
    deleverItemsCost: {
      type: Number,
      default: 0,
    },

    address: {
      type: String,
      default: "",
    },

    location: {
      lat: Number,
      lng: Number,
    },

    // Delivery / Millenium exact price
    deliveryPrice: {
      type: Number,
      default: 0,
    },

    deliveryPriceSource: {
      type: String,
      default: "",
    },

    deliveryPriceCalculatedAt: {
      type: Date,
      default: null,
    },

    deliveryPriceRaw: {
      type:
        mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Jami online to'lov:
    // hozircha faqat taomlar, taxi haydovchiga alohida
    paymentAmount: {
      type: Number,
      default: 0,
    },

    orderType: {
      type: String,
      enum: [
        "pickup",
        "delivery",
      ],
      default: "delivery",
    },

    paymentType: {
      type: String,
      enum: [
        "cash",
        "card",
        "click",
        "payme",
      ],
      default: "cash",
    },

    paymentProvider: {
      type: String,
      enum: [
        "cash",
        "card",
        "click",
        "payme",
      ],
      default: "cash",
    },

    paymentStatus: {
      type: String,
      enum: [
        "unpaid",
        "pending",
        "paid",
        "cancelled",
        "failed",
      ],
      default: "unpaid",
    },

    paymentUrl: {
      type: String,
      default: "",
    },

    paymentTransactionId: {
      type: String,
      default: "",
    },

    paymeTransactionId: {
      type: String,
      default: "",
    },

    paymeState: {
      type: Number,
      default: 0,
    },

    paymeCreateTime: {
      type: Number,
      default: 0,
    },

    paymePerformTime: {
      type: Number,
      default: 0,
    },

    paymeCancelTime: {
      type: Number,
      default: 0,
    },

    clickTransId: {
      type: String,
      default: "",
    },

    clickPaydocId: {
      type: String,
      default: "",
    },

    clickPrepareId: {
      type: String,
      default: "",
    },

    clickCompleteId: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "new",
        "preparing",
        "on_way",
        "delivered",
        "cancelled",
      ],
      default: "new",
    },

    statusUpdatedBy: {
      type: String,
      default: "",
    },

    tgChatId: {
      type: String,
      default: null,
    },

    tgMessageId: {
      type: Number,
      default: null,
    },

    filialId: {
      type: String,
      default: null,
    },

    filialName: {
      type: String,
      default: null,
    },

    // Delever → Neon Alisa integratsiyasi
    deleverRestaurantId: {
      type: String,
      default: "",
    },

    deleverOrderId: {
      type: String,
    },

    deleverExternalId: {
      type: String,
      default: "",
    },

    deleverStatus: {
      type: String,
      default: "",
    },

    deleverSyncStatus: {
      type: String,
      enum: [
        "not_required",
        "pending",
        "syncing",
        "success",
        "failed",
      ],
      default: "not_required",
    },

    deleverSyncError: {
      type: String,
      default: "",
    },

    deleverAttempts: {
      type: Number,
      default: 0,
    },

    deleverLastAttemptAt: {
      type: Date,
      default: null,
    },

    deleverNextRetryAt: {
      type: Date,
      default: null,
    },

    deleverSyncedAt: {
      type: Date,
      default: null,
    },

    // Supportga yuborish va debugging uchun:
    // Deleverga aynan nima yuborilganini saqlaydi.
    // Token/secret bu obyektga kirmaydi.
    deleverRequestPayload: {
      type:
        mongoose.Schema.Types.Mixed,
      default: null,
    },

    deleverRawResponse: {
      type:
        mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Millenium Taxi integration
    milleniumOrderId: {
      type: String,
      default: null,
    },

    driverName: {
      type: String,
      default: "",
    },

    driverPhone: {
      type: String,
      default: "",
    },

    carModel: {
      type: String,
      default: "",
    },

    driverLocation: {
      lat: Number,
      lng: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Indekslar
OrderSchema.index({
  customerPhone: 1,
  createdAt: -1,
});

OrderSchema.index({
  createdAt: -1,
});

OrderSchema.index({
  status: 1,
  createdAt: -1,
});

OrderSchema.index({
  paymentStatus: 1,
  status: 1,
});

OrderSchema.index({
  paymeTransactionId: 1,
});

OrderSchema.index({
  milleniumOrderId: 1,
});

OrderSchema.index(
  {
    deleverOrderId: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

OrderSchema.index({
  deleverSyncStatus: 1,
  deleverNextRetryAt: 1,
  createdAt: 1,
});

module.exports =
  mongoose.model(
    "Order",
    OrderSchema
  );
