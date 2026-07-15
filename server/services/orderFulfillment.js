const Order = require("../models/Order");
const { syncOrderToDelever } = require("./deleverOrderSync");
const { dispatchMilleniumOrder } = require("../integrations/millenium");
const { sendPaidOrderTelegram } = require("./orderMessaging");

// To'lov tasdiqlangan yoki naqd pickup buyurtmasi qabul qilingandan keyingi
// yagona oqim. Bir integratsiya xatosi qolganlarini to'xtatmaydi.
const fulfillAcceptedOrder = async (order) => {
  const result = { delever: null, millenium: null, telegram: null, order };

  try {
    result.delever = await syncOrderToDelever(order);
  } catch (error) {
    console.error("Delever fulfillment xato:", error.message);
    result.delever = { success: false, error: error.message };
  }

  // Delever sync Order modelini alohida update qiladi. Telegram xabarida yangi
  // sync holati ko'rinishi uchun hujjatni qayta o'qiymiz.
  try {
    result.order = await Order.findById(order._id) || order;
  } catch {
    result.order = order;
  }

  try {
    await dispatchMilleniumOrder(result.order);
    result.millenium = { success: true };
  } catch (error) {
    console.error("Millenium fulfillment xato:", error.message);
    result.millenium = { success: false, error: error.message };
  }

  try {
    await sendPaidOrderTelegram(result.order);
    result.telegram = { success: true };
  } catch (error) {
    console.error("Telegram fulfillment xato:", error.message);
    result.telegram = { success: false, error: error.message };
  }

  return result;
};

module.exports = { fulfillAcceptedOrder };
