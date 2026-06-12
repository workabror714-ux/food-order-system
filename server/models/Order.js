const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  customerName:  { type: String, required: true },
  customerPhone: { type: String, required: true },
  items: [{
    foodId:   { type: String },
    title:    { type: String },
    price:    { type: Number },
    quantity: { type: Number },
  }],
  totalPrice:  { type: Number },
  address:     { type: String, default: "" },
  location:    { lat: Number, lng: Number },

  // Delivery / Millenium exact price
  deliveryPrice: { type: Number, default: 0 },
  deliveryPriceSource: { type: String, default: "" },
  deliveryPriceCalculatedAt: { type: Date, default: null },
  deliveryPriceRaw: { type: mongoose.Schema.Types.Mixed, default: null },
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

  status:      { type: String, enum: ["new","preparing","delivered","cancelled"], default: "new" },
  
  // Filial
  filialId:   { type: String, default: null },
  filialName: { type: String, default: null },

  // Millenium Taxi integration
  milleniumOrderId: { type: String, default: null },
  driverName:       { type: String, default: "" },
  driverPhone:      { type: String, default: "" },
  carModel:         { type: String, default: "" },
  driverLocation:   { lat: Number, lng: Number },
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);