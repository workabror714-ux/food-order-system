const router = require("express").Router();
const { auth, superAdmin } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const Order = require("../models/Order");
const Food = require("../models/Food");
const { getFilial } = require("../services/filials");
const { calcMilleniumDeliveryPrice } = require("../integrations/millenium");
const { makePaymePaymentUrl } = require("../integrations/payme");
const { makeClickPaymentUrl } = require("../integrations/click");
const { editStaffOrderMessage } = require("../services/orderMessaging");
const { fulfillAcceptedOrder } = require("../services/orderFulfillment");
const { getConfig: getDeleverConfig } = require("../integrations/delever");
const { sendTelegram } = require("../integrations/telegram");
const { ORDER_STATUSES, STATUS_LABELS } = require("../config/constants");
const { autoCancelUnpaidOrders } = require("../services/orderJobs");

router.post("/api/millenium/calc-price", async (req, res) => {
  try {
    const { filialId, location } = req.body || {};
    const cpFilial = getFilial(filialId);
    if (!filialId || !cpFilial) {
      return res.status(400).json({ success: false, message: "Filial noto'g'ri yoki tanlanmagan" });
    }
    if (cpFilial.isActive === false) {
      return res.status(400).json({ success: false, message: "Bu filial vaqtincha yopiq" });
    }
    if (!location?.lat || !location?.lng) {
      return res.status(400).json({ success: false, message: "Lokatsiya kerak" });
    }

    const result = await calcMilleniumDeliveryPrice({ filialId, location });

    res.json({
      success: true,
      price: result.price,
      source: result.source,
      filial: {
        id: filialId,
        name: result.restaurant.name,
      },
      raw: result.raw?.data || null,
    });
  } catch (e) {
    console.error("Millenium calc-price xato:", e.message);
    res.status(400).json({
      success: false,
      message: e.message || "Millenium narxini hisoblab bo'lmadi",
    });
  }
});

// ════ ORDERS ══════════════════════════════════════════════════════════════════
router.post("/api/orders", async (req, res) => {
  try {
    const { customerName, customerPhone, items, totalPrice, address, location, orderType, paymentType, filialId, filialName } = req.body;
    if (!customerName || !customerPhone || !items?.length)
      return res.status(400).json({ message: "Ism, telefon va taomlar shart!" });

    const normalizedOrderType = orderType || "delivery";
    const normalizedPaymentType = paymentType || "click";
    if (!["click", "payme", "cash"].includes(normalizedPaymentType)) {
      return res.status(400).json({ message: "To'lov turi noto'g'ri." });
    }
    // Naqd faqat olib ketish (pickup) uchun
    if (normalizedPaymentType === "cash" && normalizedOrderType !== "pickup") {
      return res.status(400).json({ message: "Naqd to'lov faqat olib ketishda mumkin. Yetkazib berishda online to'lov shart." });
    }

    // Yopiq filialga buyurtma qabul qilinmaydi
    const orderFilial = getFilial(filialId);
    if (filialId && orderFilial && orderFilial.isActive === false) {
      return res.status(400).json({ message: "Tanlangan filial vaqtincha yopiq. Boshqa filialni tanlang." });
    }

    // ── Narxni SERVER hisoblaydi (mijoz yuborgan narx/jami summaga ISHONILMAYDI) ──
    // Har bir savat elementi haqiqiy foodId (24-hex) ga ega bo'lishi shart.
    const cartItems = (items || []).filter(Boolean);
    for (const it of cartItems) {
      if (!/^[a-f0-9]{24}$/i.test(String(it.foodId || ""))) {
        return res.status(400).json({ message: "Taom ID noto'g'ri. Savatni yangilang." });
      }
    }
    const wantedIds = [...new Set(cartItems.map(i => String(i.foodId)))];
    const dbFoods = await Food.find({ _id: { $in: wantedIds } }).select("title price isAvailable deleverId source");
    if (dbFoods.length !== wantedIds.length) {
      return res.status(400).json({ message: "Savatdagi ayrim taomlar topilmadi. Savatni yangilang." });
    }
    const unavailable = dbFoods.find(f => f.isAvailable === false);
    if (unavailable) {
      const title = unavailable.title?.uz || "Tanlangan taom";
      return res.status(400).json({ message: `${title} hozircha mavjud emas. Iltimos, savatdan olib tashlang.` });
    }
    const foodMap = new Map(dbFoods.map(f => [String(f._id), f]));

    // Delever yoqilganda buyurtmadagi barcha taomlar tashqi menyu ID'siga ega bo'lishi shart.
    // Bu Neon Alisa'ga noto'g'ri/local ID yuborilishining oldini oladi.
    const deleverConfig = getDeleverConfig();
    if (
      deleverConfig.orderEnabled &&
      String(
        process.env.DELEVER_REQUIRE_EXTERNAL_ITEMS || "true"
      ).toLowerCase() !== "false"
    ) {
      const withoutDeleverId = dbFoods.find(f => !f.deleverId);
      if (withoutDeleverId) {
        const title = withoutDeleverId.title?.uz || "Tanlangan taom";
        return res.status(409).json({ message: `${title} Delever menyusi bilan hali sinxronlashmagan. Iltimos, birozdan keyin qayta urinib ko'ring.` });
      }
    }

    // Miqdor musbat butun son; narx faqat DB'dan olinadi (mijoz narxi e'tiborsiz).
    const serverItems = cartItems.map(it => {
      const f = foodMap.get(String(it.foodId));
      return {
        foodId: String(it.foodId),
        deleverProductId: String(f.deleverId || ""),
        title: String(f.title?.uz || it.title || "Taom"),
        price: Number(f.price) || 0,
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 0)),
        modifiers: [],
      };
    });
    const serverTotal = serverItems.reduce((s, i) => s + i.price * i.quantity, 0);
    if (serverTotal <= 0) {
      return res.status(400).json({ message: "Buyurtma summasi noto'g'ri. Savatni yangilang." });
    }

    let deliveryCalc = null;
    if (normalizedOrderType === "delivery") {
      if (!location?.lat || !location?.lng) {
        return res.status(400).json({ message: "Yetkazish uchun lokatsiya shart." });
      }
      try {
        deliveryCalc = await calcMilleniumDeliveryPrice({ filialId, location });
      } catch (calcErr) {
        return res.status(400).json({
          message: `Taxi narxini Milleniumdan hisoblab bo'lmadi: ${calcErr.message}`
        });
      }
    }

    // Online to'lov summasi: FAQAT taomlar. Taxi pulini mijoz haydovchiga naqd to'laydi.
    const paymentAmount = serverTotal;

    const order = await new Order({
      customerName,
      customerPhone,
      items: serverItems,
      totalPrice: serverTotal,
      address,
      location,
      orderType: normalizedOrderType,
      paymentType: normalizedPaymentType,
      paymentProvider: normalizedPaymentType,
      paymentStatus: normalizedPaymentType === "cash" ? "unpaid" : "pending",
      filialId: filialId || null,
      filialName: filialName || null,
      deliveryPrice: deliveryCalc?.price || 0,
      deliveryPriceSource: deliveryCalc?.source || "",
      deliveryPriceCalculatedAt: deliveryCalc ? new Date() : null,
      deliveryPriceRaw: deliveryCalc?.raw || null,
      paymentAmount,
      status: "new"
      deleverSyncStatus: deleverConfig.orderEnabled
        ? "pending"
        : "not_required",
    }).save();

    if (normalizedPaymentType === "payme") {
      order.paymentUrl = makePaymePaymentUrl(order);
      await order.save();
    }

    if (normalizedPaymentType === "click") {
      order.paymentUrl = makeClickPaymentUrl(order);
      await order.save();
    }

    // NAQD (pickup): to'lov kutilmaydi — buyurtma darrov oshxonaga tushadi
    if (normalizedPaymentType === "cash") {
      const fulfillment = await fulfillAcceptedOrder(order);
      return res.status(201).json({
        message: "Buyurtma qabul qilindi! ✅",
        order: fulfillment.order || order,
        paymentUrl: "",
      });
    }

    // Taxi chaqirish va oshxona telegrami ENDI BU YERDA EMAS —
    // to'lov tasdiqlangandan keyin (Payme PerformTransaction / Click complete)
    // dispatchMilleniumOrder() va sendPaidOrderTelegram() chaqiriladi.
    res.status(201).json({
      message: "Buyurtma qabul qilindi! ✅",
      order,
      paymentUrl: order.paymentUrl || "",
    });
  } catch (e) { res.status(500).json({ message: "Xato", error: e.message }); }
});

router.get("/api/orders", auth, async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    res.json(await Order.find(filter).sort({ createdAt: -1 }));
  } catch { res.status(500).json({ message: "Xato" }); }
});

// Mijoz o'z buyurtmalarini telefon orqali ko'radi — rate-limit bilan
// (telefon raqamlarini brute-force enumeratsiya qilishni cheklaydi).
const ordersMyMax = Number(process.env.ORDERS_MY_MAX) || 30;
const ordersMyWindow = Number(process.env.ORDERS_MY_WINDOW_MS) || 5 * 60 * 1000;
router.get("/api/orders/my/:phone",
  rateLimit({ windowMs: ordersMyWindow, max: ordersMyMax }),
  async (req, res) => {
    try {
      const phone = decodeURIComponent(req.params.phone);
      // Faqat to'liq mos telefon raqami (regex/qisman moslik emas)
      if (!/^\+?\d{9,15}$/.test(phone)) {
        return res.status(400).json({ message: "Telefon raqami noto'g'ri." });
      }
      res.json(await Order.find({ customerPhone: phone }).sort({ createdAt: -1 }).limit(20));
    } catch { res.status(500).json({ message: "Xato" }); }
  });

router.put("/api/orders/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!ORDER_STATUSES.includes(status))
      return res.status(400).json({ message: "Noto'g'ri status!" });
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status, statusUpdatedBy: "Admin panel" },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: "Topilmadi" });
    // Xodimlar guruhidagi tugmali xabarni sinxron yangilaymiz
    if (order.tgChatId && order.tgMessageId) {
      await editStaffOrderMessage(order);
    } else if (STATUS_LABELS[status] && status !== "new") {
      await sendTelegram(`${STATUS_LABELS[status]}\n👤 ${order.customerName} | 📞 ${order.customerPhone}`);
    }
    res.json(order);
  } catch { res.status(500).json({ message: "Xato" }); }
});

router.delete("/api/orders/:id", auth, async (req, res) => {
  try { await Order.findByIdAndDelete(req.params.id); res.json({ message: "O'chirildi" }); }
  catch { res.status(500).json({ message: "Xato" }); }
});

router.post("/api/admin/auto-cancel-run", auth, superAdmin, async (req, res) => {
  const cancelled = await autoCancelUnpaidOrders();
  res.json({ ok: true, cancelled });
});

module.exports = router;
