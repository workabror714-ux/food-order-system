const router = require("express").Router();
const Order = require("../models/Order");
const { toTiyin, nowMs, paymeError, paymeResult, checkPaymeAuth } = require("../integrations/payme");
const { checkClickSign, clickOk, clickError } = require("../integrations/click");
const { fulfillAcceptedOrder } = require("../services/orderFulfillment");

router.post("/api/payments/payme", async (req, res) => {
  console.log("PAYME headers auth exists:", !!req.headers.authorization);
  console.log("PAYME body:", JSON.stringify(req.body, null, 2));
  const { method, params = {}, id } = req.body || {};

  try {
    if (!checkPaymeAuth(req)) {
      return res.json(paymeError(id, -32504, "Недостаточно привилегий"));
    }

    const account = params.account || {};
    // const orderId = account.order_id
    const orderId = params.account?.order_id || params.account?.order_num;

    if (method === "CheckPerformTransaction") {
      const order = await Order.findById(orderId);

      if (!order) {
        // return res.json(paymeError(id, -31050, "Заказ не найден", "order_id"));
        return res.json(paymeError(id, -31050, "Заказ не найден", "order_num"));
      }

      if (order.status === "cancelled") {
        return res.json(paymeError(id, -31051, "Заказ отменен", "order_num"));
      }

      if (toTiyin(order.paymentAmount || order.totalPrice) !== Number(params.amount)) {
        return res.json(paymeError(id, -31001, "Неверная сумма"));
      }

      if (order.paymentStatus === "paid") {
        return res.json(paymeError(id, -31008, "Заказ уже оплачен"));
      }

      return res.json(paymeResult(id, { allow: true }));
    }

    if (method === "CreateTransaction") {
      const order = await Order.findById(orderId);

      if (!order) {
        // return res.json(paymeError(id, -31050, "Заказ не найден", "order_id"));
        return res.json(paymeError(id, -31050, "Заказ не найден", "order_num"));
      }

      if (order.status === "cancelled") {
        return res.json(paymeError(id, -31051, "Заказ отменен", "order_num"));
      }

      if (toTiyin(order.paymentAmount || order.totalPrice) !== Number(params.amount)) {
        return res.json(paymeError(id, -31001, "Неверная сумма"));
      }

      if (order.paymeTransactionId && order.paymeTransactionId !== params.id) {
        return res.json(paymeError(id, -31008, "Нельзя создать новую транзакцию"));
      }

      if (!order.paymeTransactionId) {
        order.paymeTransactionId = params.id;
        order.paymentTransactionId = params.id;
        order.paymeCreateTime = nowMs();
        order.paymeState = 1;
        order.paymentProvider = "payme";
        order.paymentStatus = "pending";
        await order.save();
      }

      return res.json(paymeResult(id, {
        create_time: order.paymeCreateTime,
        transaction: String(order._id),
        state: order.paymeState,
      }));
    }

    if (method === "PerformTransaction") {
      const order = await Order.findOne({ paymeTransactionId: params.id });

      if (!order) {
        return res.json(paymeError(id, -31003, "Транзакция не найдена"));
      }

      if (order.paymeState === 2) {
        return res.json(paymeResult(id, {
          transaction: String(order._id),
          perform_time: order.paymePerformTime,
          state: 2,
        }));
      }

      if (order.paymeState !== 1) {
        return res.json(paymeError(id, -31008, "Невозможно выполнить операцию"));
      }

      order.paymePerformTime = nowMs();
      order.paymeState = 2;
      order.paymentStatus = "paid";
      order.paymentProvider = "payme";
      await order.save();

      // To'lov tasdiqlandi → taxi chaqiramiz va oshxonaga xabar beramiz
      await fulfillAcceptedOrder(order);

      return res.json(paymeResult(id, {
        transaction: String(order._id),
        perform_time: order.paymePerformTime,
        state: 2,
      }));
    }

    if (method === "CancelTransaction") {
      const order = await Order.findOne({ paymeTransactionId: params.id });

      if (!order) {
        return res.json(paymeError(id, -31003, "Транзакция не найдена"));
      }

      if (order.paymeState === -1 || order.paymeState === -2) {
        return res.json(paymeResult(id, {
          transaction: String(order._id),
          cancel_time: order.paymeCancelTime,
          state: order.paymeState,
        }));
      }

      order.paymeCancelTime = nowMs();
      order.paymeState = order.paymeState === 2 ? -2 : -1;
      order.paymentStatus = "cancelled";
      await order.save();

      return res.json(paymeResult(id, {
        transaction: String(order._id),
        cancel_time: order.paymeCancelTime,
        state: order.paymeState,
      }));
    }

    if (method === "CheckTransaction") {
      const order = await Order.findOne({ paymeTransactionId: params.id });

      if (!order) {
        return res.json(paymeError(id, -31003, "Транзакция не найдена"));
      }

      return res.json(paymeResult(id, {
        create_time: order.paymeCreateTime,
        perform_time: order.paymePerformTime || 0,
        cancel_time: order.paymeCancelTime || 0,
        transaction: String(order._id),
        state: order.paymeState,
        reason: null,
      }));
    }

    return res.json(paymeError(id, -32601, "Метод не найден"));
  } catch (e) {
    console.error("Payme callback xato:", e.message);
    return res.json(paymeError(id, -32400, "Системная ошибка"));
  }
});

// ════ CLICK SHOP API CALLBACKS ════════════════════════════════════════════════
router.post("/api/payments/click/prepare", async (req, res) => {
  console.log("Click prepare headers:", req.headers["content-type"]);
  console.log("Click prepare body:", req.body);
  try {
    const body = req.body || {};
    console.log("Click prepare:", body);

    if (String(body.service_id) !== String(process.env.CLICK_SERVICE_ID)) {
      return res.json(clickError(-2, "Incorrect service_id"));
    }

    if (!checkClickSign(body)) {
      return res.json(clickError(-1, "SIGN CHECK FAILED!"));
    }

    if (String(body.action) !== "0") {
      return res.json(clickError(-3, "Action not found"));
    }

    const order = await Order.findById(body.merchant_trans_id);

    if (!order) {
      return res.json(clickError(-5, "Order not found"));
    }

    if (order.status === "cancelled") {
      return res.json(clickError(-5, "Order cancelled"));
    }

    if (Number(order.paymentAmount || order.totalPrice) !== Number(body.amount)) {
      return res.json(clickError(-2, "Incorrect amount"));
    }

    if (order.paymentStatus === "paid") {
      return res.json(clickError(-4, "Already paid"));
    }

    order.paymentProvider = "click";
    order.paymentStatus = "pending";
    order.clickTransId = String(body.click_trans_id || "");
    order.clickPaydocId = String(body.click_paydoc_id || "");
    order.clickPrepareId = String(order._id);
    order.paymentTransactionId = String(body.click_trans_id || "");
    await order.save();

    return res.json(clickOk({
      click_trans_id: body.click_trans_id,
      merchant_trans_id: body.merchant_trans_id,
      merchant_prepare_id: String(order._id),
    }));
  } catch (e) {
    console.error("Click prepare xato:", e.message);
    return res.json(clickError(-9, "System error"));
  }
});

router.post("/api/payments/click/complete", async (req, res) => {
  console.log("Click complete headers:", req.headers["content-type"]);
  console.log("Click complete body:", req.body);
  try {
    const body = req.body || {};
    console.log("Click complete:", body);

    if (String(body.service_id) !== String(process.env.CLICK_SERVICE_ID)) {
      return res.json(clickError(-2, "Incorrect service_id"));
    }

    if (!checkClickSign(body)) {
      return res.json(clickError(-1, "SIGN CHECK FAILED!"));
    }

    if (String(body.action) !== "1") {
      return res.json(clickError(-3, "Action not found"));
    }

    const order = await Order.findById(body.merchant_trans_id);

    if (!order) {
      return res.json(clickError(-5, "Order not found"));
    }

    // Takroriy webhook: allaqachon to'langan bo'lsa, idempotent OK qaytaramiz
    if (order.paymentStatus === "paid") {
      return res.json(clickOk({
        click_trans_id: body.click_trans_id,
        merchant_trans_id: body.merchant_trans_id,
        merchant_confirm_id: String(order._id),
      }));
    }

    if (String(body.error) !== "0") {
      order.paymentStatus = "failed";
      await order.save();

      return res.json(clickError(Number(body.error), body.error_note || "Click payment failed", {
        click_trans_id: body.click_trans_id,
        merchant_trans_id: body.merchant_trans_id,
        merchant_confirm_id: String(order._id),
      }));
    }

    if (Number(order.paymentAmount || order.totalPrice) !== Number(body.amount)) {
      return res.json(clickError(-2, "Incorrect amount"));
    }

    order.paymentProvider = "click";
    order.paymentStatus = "paid";
    order.clickCompleteId = String(body.click_trans_id || "");
    order.paymentTransactionId = String(body.click_trans_id || "");
    await order.save();

    // To'lov tasdiqlandi → taxi chaqiramiz va oshxonaga xabar beramiz
    await fulfillAcceptedOrder(order);

    return res.json(clickOk({
      click_trans_id: body.click_trans_id,
      merchant_trans_id: body.merchant_trans_id,
      merchant_confirm_id: String(order._id),
    }));
  } catch (e) {
    console.error("Click complete xato:", e.message);
    return res.json(clickError(-9, "System error"));
  }
});

module.exports = router;
