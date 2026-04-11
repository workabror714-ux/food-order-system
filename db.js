const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/food-order-system");
    console.log("MongoDB ulandi");
  } catch (error) {
    console.log("MongoDB ulanmadi:", error.message);
  }
};

module.exports = connectDB;