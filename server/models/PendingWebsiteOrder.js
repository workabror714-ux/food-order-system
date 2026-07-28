const mongoose = require("mongoose");

const PendingWebsiteOrderSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["pending", "bound", "processing", "confirmed", "cancelled", "expired", "failed"],
      default: "pending",
      index: true,
    },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true, index: true },
    items: [
      {
        foodId: { type: String, required: true },
        title: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1, max: 99 },
      },
    ],
    totalPrice: { type: Number, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    cartFingerprint: { type: String, required: true, index: true },
    telegramChatId: { type: String, default: "" },
    telegramUserId: { type: String, default: "" },
    telegramUsername: { type: String, default: "" },
    telegramMessageId: { type: Number, default: null },
    telegramPhone: { type: String, default: "" },
    phoneVerified: { type: Boolean, default: false },
    actualOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    paymentUrl: { type: String, default: "" },
    error: { type: String, default: "" },
    confirmedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

PendingWebsiteOrderSchema.index({ customerPhone: 1, cartFingerprint: 1, createdAt: -1 });
PendingWebsiteOrderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model("PendingWebsiteOrder", PendingWebsiteOrderSchema);
