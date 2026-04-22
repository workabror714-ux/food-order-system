const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/food-order-system"
    );
    console.log("✅ MongoDB-ga ulandik!");
  } catch (error) {
    console.error("❌ MongoDB ulanmadi:", error.message);
    process.exit(1); // Ulanmasa server to'xtaydi
  }
};

module.exports = connectDB;