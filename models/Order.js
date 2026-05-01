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
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);