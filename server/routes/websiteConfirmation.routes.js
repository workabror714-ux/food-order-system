const crypto = require("crypto");
const router = require("express").Router();

const Food = require("../models/Food");
const PendingWebsiteOrder = require("../models/PendingWebsiteOrder");
const BotSubscriber = require("../models/BotSubscriber");
const { rateLimit } = require("../middleware/rateLimit");
const { tgApi } = require("../integrations/telegram");
const fetch = require("../lib/fetch");

const CONFIRM_MINUTES = Math.max(3, Number(process.env.WEBSITE_ORDER_CONFIRM_MINUTES) || 10);
const BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || "restoran_buyurtma_bot").replace(/^@/, "");

const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");
const esc = (value) => String(value ?? "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char]));

const normalizeUzPhone = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 9) digits = `998${digits}`;
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits ? `+${digits}` : "";
};

const buildFingerprint = (phone, items) => {
  const normalized = [...items]
    .map((item) => `${item.foodId}:${item.quantity}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(`${phone}|${normalized}`).digest("hex");
};

const buildPendingText = (pending) => {
  const items = (pending.items || [])
    .map((item) => `• ${esc(item.title)} × ${item.quantity} = ${(Number(item.price) * Number(item.quantity)).toLocaleString()} so'm`)
    .join("\n");
  const payload = pending.payload || {};
  return [
    "🛡 <b>YALPIZ — BUYURTMANI TASDIQLASH</b>",
    "",
    `👤 <b>Mijoz:</b> ${esc(pending.customerName)}`,
    `📞 <b>Telefon:</b> ${esc(pending.customerPhone)}`,
    `🛍 <b>Turi:</b> ${payload.orderType === "pickup" ? "Olib ketish" : "Yetkazib berish"}`,
    payload.address ? `📍 <b>Manzil:</b> ${esc(payload.address)}` : null,
    "",
    "🍽 <b>Taomlar:</b>",
    items,
    "",
    `💰 <b>Jami:</b> ${Number(pending.totalPrice || 0).toLocaleString()} so'm`,
    "",
    `⏳ Havola ${CONFIRM_MINUTES} daqiqa amal qiladi.`,
    "Buyurtmani faqat o'zingiz bergan bo'lsangiz tasdiqlang.",
  ].filter(Boolean).join("\n");
};

const sendConfirmationMessage = async (pending, chatId) => {
  const response = await tgApi("sendMessage", {
    chat_id: chatId,
    text: buildPendingText(pending),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Tasdiqlash", callback_data: `woc:${pending._id}:yes` },
        { text: "❌ Bekor qilish", callback_data: `woc:${pending._id}:no` },
      ]],
    },
  });

  if (!response?.ok || !response.result?.message_id) {
    throw new Error(response?.description || "Telegram tasdiqlash xabarini yubora olmadi");
  }

  pending.telegramMessageId = response.result.message_id;
  await pending.save();
  return response;
};

const verifyWebhookSecret = (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    res.sendStatus(403);
    return false;
  }
  return true;
};

router.post(
  "/api/website-orders",
  rateLimit({ windowMs: 10 * 60 * 1000, max: Number(process.env.WEBSITE_ORDER_MAX_PER_10_MIN) || 5 }),
  async (req, res) => {
    try {
      const {
        customerName,
        customerPhone,
        items,
        orderType,
        paymentType,
        address,
        location,
        filialId,
        filialName,
        persons,
        comment,
      } = req.body || {};

      if (orderType !== "pickup" || paymentType !== "cash") {
        return res.status(400).json({ message: "Bu endpoint faqat naqd olib ketish buyurtmasini Telegram orqali tasdiqlash uchun." });
      }

      const name = String(customerName || "").trim().slice(0, 80);
      const phone = normalizeUzPhone(customerPhone);
      if (!name) return res.status(400).json({ message: "Ism majburiy." });
      if (!/^\+998\d{9}$/.test(phone)) return res.status(400).json({ message: "Telefon raqami +998XXXXXXXXX formatida bo'lishi kerak." });
      if (!Array.isArray(items) || !items.length || items.length > 50) return res.status(400).json({ message: "Savat bo'sh yoki juda katta." });

      const normalizedItems = items.map((item) => ({
        foodId: String(item?.foodId || ""),
        quantity: Number(item?.quantity),
      }));

      for (const item of normalizedItems) {
        if (!/^[a-f0-9]{24}$/i.test(item.foodId)) return res.status(400).json({ message: "Taom ID noto'g'ri. Savatni yangilang." });
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return res.status(400).json({ message: "Taom miqdori noto'g'ri." });
      }

      const ids = [...new Set(normalizedItems.map((item) => item.foodId))];
      const foods = await Food.find({ _id: { $in: ids } }).select("title price isAvailable isDeletedInSource");
      if (foods.length !== ids.length) return res.status(400).json({ message: "Savatdagi ayrim taomlar topilmadi. Savatni yangilang." });

      const foodMap = new Map(foods.map((food) => [String(food._id), food]));
      const safeItems = normalizedItems.map((item) => {
        const food = foodMap.get(item.foodId);
        if (!food || food.isAvailable === false || food.isDeletedInSource === true) {
          throw new Error(`${food?.title?.uz || "Tanlangan taom"} hozircha mavjud emas.`);
        }
        return {
          foodId: item.foodId,
          title: String(food.title?.uz || food.title?.ru || "Taom"),
          price: Math.max(0, Number(food.price) || 0),
          quantity: item.quantity,
        };
      });

      const totalPrice = safeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      if (totalPrice <= 0) return res.status(400).json({ message: "Buyurtma summasi noto'g'ri." });

      const cartFingerprint = buildFingerprint(phone, safeItems);
      const duplicate = await PendingWebsiteOrder.findOne({
        customerPhone: phone,
        cartFingerprint,
        status: { $in: ["pending", "bound", "processing"] },
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });
      if (duplicate) return res.status(409).json({ message: "Xuddi shu buyurtma tasdiqlanishi kutilmoqda. Telegramdagi oldingi havolani oching." });

      const cleanComment = String(comment || "").trim().slice(0, 300);
      const cleanAddress = String(address || filialName || "Yalpiz — Shota Rustaveli 115").trim().slice(0, 500);
      const finalAddress = cleanComment && !cleanAddress.includes("Izoh:") ? `${cleanAddress} | Izoh: ${cleanComment}` : cleanAddress;

      const token = crypto.randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + CONFIRM_MINUTES * 60 * 1000);
      const payload = {
        customerName: name,
        customerPhone: phone,
        items: safeItems.map((item) => ({ foodId: item.foodId, title: item.title, quantity: item.quantity })),
        orderType: "pickup",
        paymentType: "cash",
        address: finalAddress,
        location: location || null,
        filialId: filialId || null,
        filialName: filialName || null,
        persons: Math.max(1, Math.min(30, Number(persons) || 1)),
      };

      const pending = await PendingWebsiteOrder.create({
        tokenHash: hashToken(token),
        status: "pending",
        customerName: name,
        customerPhone: phone,
        items: safeItems,
        totalPrice,
        payload,
        cartFingerprint,
        expiresAt,
      });

      return res.status(201).json({
        message: "Buyurtma yaratildi. Telegram orqali tasdiqlang.",
        pendingOrderId: String(pending._id),
        confirmationUrl: `https://t.me/${BOT_USERNAME}?start=confirm_${token}`,
        confirmationToken: token,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[website-order]", error);
      return res.status(400).json({ message: error.message || "Buyurtmani tayyorlab bo'lmadi." });
    }
  }
);

router.get("/api/website-orders/:id/status", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const token = String(req.query.token || "");
    if (!/^[a-f0-9]{24}$/i.test(id) || !token) return res.status(400).json({ message: "Tasdiqlash ma'lumoti noto'g'ri." });

    const pending = await PendingWebsiteOrder.findOne({ _id: id, tokenHash: hashToken(token) });
    if (!pending) return res.status(404).json({ message: "Tasdiqlash topilmadi." });

    if (pending.expiresAt <= new Date() && ["pending", "bound"].includes(pending.status)) {
      pending.status = "expired";
      await pending.save();
    }

    return res.json({
      status: pending.status,
      message: pending.error || "",
      orderId: pending.actualOrderId ? String(pending.actualOrderId) : "",
      paymentUrl: pending.paymentUrl || "",
      phoneVerified: Boolean(pending.phoneVerified),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Holatni tekshirib bo'lmadi." });
  }
});

// Asosiy Telegram webhook'dan OLDIN mount qilinadi. Faqat website confirmation update'larini ushlab qoladi.
router.post("/webhook/telegram", async (req, res, next) => {
  try {
    if (!verifyWebhookSecret(req, res)) return;
    const update = req.body || {};
    const text = String(update.message?.text || "").trim();
    const startMatch = text.match(/^\/start(?:@\w+)?\s+confirm_([A-Za-z0-9_-]+)$/i);

    if (startMatch) {
      const token = startMatch[1];
      const pending = await PendingWebsiteOrder.findOne({ tokenHash: hashToken(token) });
      const chatId = String(update.message.chat.id);

      if (!pending) {
        await tgApi("sendMessage", { chat_id: chatId, text: "❌ Tasdiqlash havolasi topilmadi yoki eskirgan." });
        return res.sendStatus(200);
      }
      if (pending.expiresAt <= new Date() && !["confirmed", "cancelled"].includes(pending.status)) {
        pending.status = "expired";
        await pending.save();
      }
      if (pending.status === "expired") {
        await tgApi("sendMessage", { chat_id: chatId, text: "⏳ Tasdiqlash vaqti tugagan. Saytdan buyurtmani qayta yuboring." });
        return res.sendStatus(200);
      }
      if (pending.status === "confirmed") {
        await tgApi("sendMessage", { chat_id: chatId, text: `✅ Bu buyurtma allaqachon tasdiqlangan. Order: ${pending.actualOrderId || "—"}` });
        return res.sendStatus(200);
      }
      if (pending.telegramChatId && pending.telegramChatId !== chatId) {
        await tgApi("sendMessage", { chat_id: chatId, text: "❌ Bu buyurtma boshqa Telegram akkauntiga bog'langan." });
        return res.sendStatus(200);
      }

      pending.status = "bound";
      pending.telegramChatId = chatId;
      pending.telegramUserId = String(update.message.from?.id || "");
      pending.telegramUsername = String(update.message.from?.username || "");
      await pending.save();

      if (update.message.chat.type === "private") {
        await BotSubscriber.updateOne(
          { chatId },
          { $set: { chatId, firstName: update.message.from?.first_name || "", username: update.message.from?.username || "", active: true } },
          { upsert: true }
        ).catch(() => {});
      }

      if (pending.phoneVerified) {
        await sendConfirmationMessage(pending, chatId);
      } else {
        const response = await tgApi("sendMessage", {
          chat_id: chatId,
          text: [
            "📱 <b>Telefon raqamingizni tasdiqlang</b>",
            "",
            `Saytda kiritilgan raqam: <code>${esc(pending.customerPhone)}</code>`,
            "Pastdagi tugma orqali Telegram akkauntingizga tegishli raqamni yuboring.",
            "Raqamlar mos kelgandan keyin buyurtmani tasdiqlash tugmasi chiqadi.",
          ].join("\n"),
          parse_mode: "HTML",
          reply_markup: {
            keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
            input_field_placeholder: "Telefon raqamni tasdiqlang",
          },
        });
        if (!response?.ok) {
          pending.status = "failed";
          pending.error = response?.description || "Telegram telefon tasdiqlash xabarini yubora olmadi";
          await pending.save();
        }
      }
      return res.sendStatus(200);
    }

    const contact = update.message?.contact;
    if (contact) {
      const chatId = String(update.message.chat.id);
      const userId = String(update.message.from?.id || "");
      const contactUserId = String(contact.user_id || "");

      if (contactUserId && contactUserId !== userId) {
        await tgApi("sendMessage", {
          chat_id: chatId,
          text: "❌ Boshqa kishining telefon raqami qabul qilinmaydi. Pastdagi tugma orqali o‘zingizning raqamingizni yuboring.",
        });
        return res.sendStatus(200);
      }

      const pending = await PendingWebsiteOrder.findOne({
        telegramChatId: chatId,
        telegramUserId: userId,
        status: { $in: ["bound", "failed"] },
        expiresAt: { $gt: new Date() },
      }).sort({ updatedAt: -1 });

      if (!pending) {
        return next();
      }

      const telegramPhone = normalizeUzPhone(contact.phone_number);
      if (telegramPhone !== pending.customerPhone) {
        pending.error = `Telegram raqami (${telegramPhone || "noma’lum"}) saytdagi raqamga mos emas.`;
        await pending.save();
        await tgApi("sendMessage", {
          chat_id: chatId,
          text: [
            "❌ <b>Telefon raqamlar mos kelmadi.</b>",
            `Saytda: <code>${esc(pending.customerPhone)}</code>`,
            `Telegramda: <code>${esc(telegramPhone || "—")}</code>`,
            "",
            "Saytga qayting, telefon raqamingizni to‘g‘rilab buyurtmani qayta yuboring.",
          ].join("\n"),
          parse_mode: "HTML",
          reply_markup: { remove_keyboard: true },
        });
        return res.sendStatus(200);
      }

      pending.phoneVerified = true;
      pending.telegramPhone = telegramPhone;
      pending.status = "bound";
      pending.error = "";
      await pending.save();

      await tgApi("sendMessage", {
        chat_id: chatId,
        text: "✅ Telefon raqamingiz tasdiqlandi.",
        reply_markup: { remove_keyboard: true },
      });
      await sendConfirmationMessage(pending, chatId);
      return res.sendStatus(200);
    }

    const cb = update.callback_query;
    if (!cb?.data?.startsWith("woc:")) return next();

    const [, id, action] = cb.data.split(":");
    if (!/^[a-f0-9]{24}$/i.test(id || "") || !["yes", "no"].includes(action)) {
      await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Noto'g'ri so'rov" });
      return res.sendStatus(200);
    }

    const chatId = String(cb.message?.chat?.id || "");
    const pending = await PendingWebsiteOrder.findById(id);
    if (!pending) {
      await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Buyurtma topilmadi" });
      return res.sendStatus(200);
    }
    if (pending.telegramChatId !== chatId || pending.telegramUserId !== String(cb.from?.id || "")) {
      await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Bu buyurtmani siz tasdiqlay olmaysiz", show_alert: true });
      return res.sendStatus(200);
    }
    if (!pending.phoneVerified) {
      await tgApi("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "Avval Telegram orqali telefon raqamingizni tasdiqlang",
        show_alert: true,
      });
      return res.sendStatus(200);
    }
    if (pending.expiresAt <= new Date() && !["confirmed", "cancelled"].includes(pending.status)) {
      pending.status = "expired";
      await pending.save();
    }
    if (["confirmed", "cancelled", "expired"].includes(pending.status)) {
      await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: `Holat: ${pending.status}` });
      return res.sendStatus(200);
    }

    if (action === "no") {
      pending.status = "cancelled";
      await pending.save();
      await tgApi("editMessageText", {
        chat_id: chatId,
        message_id: cb.message.message_id,
        text: "❌ <b>Buyurtma bekor qilindi.</b>\nKassaga hech narsa yuborilmadi.",
        parse_mode: "HTML",
      });
      await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Bekor qilindi" });
      return res.sendStatus(200);
    }

    const claimed = await PendingWebsiteOrder.findOneAndUpdate(
      { _id: pending._id, status: { $in: ["pending", "bound", "failed"] } },
      { $set: { status: "processing", error: "" } },
      { new: true }
    );
    if (!claimed) {
      await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Buyurtma qayta ishlanmoqda" });
      return res.sendStatus(200);
    }

    await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Buyurtma kassaga yuborilmoqda…" });
    const internalUrl = String(process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 5000}`).replace(/\/+$/, "");

    try {
      const response = await fetch(`${internalUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(claimed.payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || `Order API ${response.status}`);

      claimed.status = "confirmed";
      claimed.actualOrderId = data?.order?._id || null;
      claimed.paymentUrl = data?.paymentUrl || "";
      claimed.confirmedAt = new Date();
      claimed.error = "";
      await claimed.save();

      await tgApi("editMessageText", {
        chat_id: chatId,
        message_id: cb.message.message_id,
        text: [
          "✅ <b>BUYURTMA TASDIQLANDI</b>",
          "",
          `🧾 Order: <code>${esc(data?.order?._id || "—")}</code>`,
          `💰 Jami: <b>${Number(claimed.totalPrice || 0).toLocaleString()} so'm</b>`,
          "",
          "Buyurtma qabul qilindi. Delever, Neon Alisa va xodimlar kanaliga yuborish jarayoni ishga tushdi.",
        ].join("\n"),
        parse_mode: "HTML",
      });
      return res.sendStatus(200);
    } catch (error) {
      claimed.status = "failed";
      claimed.error = String(error.message || "Buyurtmani kassaga yuborib bo'lmadi").slice(0, 500);
      await claimed.save();
      await tgApi("editMessageText", {
        chat_id: chatId,
        message_id: cb.message.message_id,
        text: `⚠️ <b>Buyurtmani yuborib bo'lmadi.</b>\n${esc(claimed.error)}\n\nRestoran: +998 95 193 98 98`,
        parse_mode: "HTML",
      });
      return res.sendStatus(200);
    }
  } catch (error) {
    console.error("[website-order-confirmation]", error);
    return res.sendStatus(200);
  }
});

module.exports = router;
