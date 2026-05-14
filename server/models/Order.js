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
  orderType:   { type: String, enum: ["dine_in", "delivery"], default: "delivery" },
  tableNumber: { type: String, default: "" },
  paymentType: { type: String, enum: ["cash", "card"], default: "cash" },
  status:      { type: String, enum: ["new","preparing","delivered","cancelled"], default: "new" },
  
  // Millenium Taxi integration
  milleniumOrderId: { type: String, default: null },
  driverName:       { type: String, default: "" },
  driverPhone:      { type: String, default: "" },
  carModel:         { type: String, default: "" },
  driverLocation:   { lat: Number, lng: Number },
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);