const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    items: [
      {
        foodId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Food",
        },
        title: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true, default: 1 },
      },
    ],
    totalPrice: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["new", "preparing", "delivered", "cancelled"],
      default: "new",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);