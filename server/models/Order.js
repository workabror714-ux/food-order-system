const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  customerName:  { type: String, required: true },
  customerPhone: { type: String, required: true },
  items: [{
    foodId:   { type: String },
    deleverProductId: { type: String, default: "" },
    title:    { type: String },
    price:    { type: Number },
    quantity: { type: Number },
    modifiers: { type: [mongoose.Schema.Types.Mixed], default: [] },
  }],
  totalPrice:  { type: Number },
  address:     { type: String, default: "" },
  location:    { lat: Number, lng: Number },

  // Delivery / Millenium exact price
  deliveryPrice: { type: Number, default: 0 },
  deliveryPriceSource: { type: String, default: "" },
  deliveryPriceCalculatedAt: { type: Date, default: null },
  deliveryPriceRaw: { type: mongoose.Schema.Types.Mixed, default: null },
  paymentAmount: { type: Number, default: 0 }, // jami to'lov: taomlar + taxi
  orderType:   { type: String, enum: ["pickup", "delivery"], default: "delivery" },
  paymentType: {
    type: String,
    enum: ["cash", "card", "click", "payme"],
    default: "cash"
  },

  paymentProvider: {
    type: String,
    enum: ["cash", "card", "click", "payme"],
    default: "cash"
  },

  paymentStatus: {
    type: String,
    enum: ["unpaid", "pending", "paid", "cancelled", "failed"],
    default: "unpaid"
  },

  paymentUrl: { type: String, default: "" },
  paymentTransactionId: { type: String, default: "" },

  paymeTransactionId: { type: String, default: "" },
  paymeState: { type: Number, default: 0 },
  paymeCreateTime: { type: Number, default: 0 },
  paymePerformTime: { type: Number, default: 0 },
  paymeCancelTime: { type: Number, default: 0 },

  clickTransId: { type: String, default: "" },
  clickPaydocId: { type: String, default: "" },
  clickPrepareId: { type: String, default: "" },
  clickCompleteId: { type: String, default: "" },

  status:      { type: String, enum: ["new","preparing","on_way","delivered","cancelled"], default: "new" },

  // Status kim tomonidan o'zgartirilgani (admin panel / xodim ismi)
  statusUpdatedBy: { type: String, default: "" },

  // Telegram xodimlar guruhidagi tugmali xabar (status sinxronlash uchun)
  tgChatId:    { type: String, default: null },
  tgMessageId: { type: Number, default: null },

  // Filial
  filialId:   { type: String, default: null },
  filialName: { type: String, default: null },

  // Delever → Neon Alisa integratsiyasi
  deleverOrderId: { type: String },
  deleverExternalId: { type: String, default: "" },
  deleverStatus: { type: String, default: "" },
  deleverSyncStatus: {
    type: String,
    enum: ["not_required", "pending", "syncing", "success", "failed"],
    default: "pending",
  },
  deleverSyncError: { type: String, default: "" },
  deleverAttempts: { type: Number, default: 0 },
  deleverLastAttemptAt: { type: Date, default: null },
  deleverNextRetryAt: { type: Date, default: null },
  deleverSyncedAt: { type: Date, default: null },
  deleverRawResponse: { type: mongoose.Schema.Types.Mixed, default: null },

  // Millenium Taxi integration
  milleniumOrderId: { type: String, default: null },
  driverName:       { type: String, default: "" },
  driverPhone:      { type: String, default: "" },
  carModel:         { type: String, default: "" },
  driverLocation:   { lat: Number, lng: Number },
}, { timestamps: true });

// ── Indekslar (query tezligi: ma'lumot ko'paysa) ──
OrderSchema.index({ customerPhone: 1, createdAt: -1 });   // /orders/my/:phone, /find telefon
OrderSchema.index({ createdAt: -1 });                      // umumiy ro'yxat (sort)
OrderSchema.index({ status: 1, createdAt: -1 });           // admin status filtri + auto-cancel
OrderSchema.index({ paymentStatus: 1, status: 1 });        // aktiv buyurtmalar (paid + status)
OrderSchema.index({ paymeTransactionId: 1 });              // Payme Perform/Cancel/Check
OrderSchema.index({ milleniumOrderId: 1 });                // Millenium webhook
OrderSchema.index({ deleverOrderId: 1 }, { unique: true, sparse: true });
OrderSchema.index({ deleverSyncStatus: 1, deleverNextRetryAt: 1, createdAt: 1 });

module.exports = mongoose.model("Order", OrderSchema);