require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const https = require("https");
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const connectDB = require("./db");
const Food = require("./models/Food");
const Order = require("./models/Order");
const AdminUser = require("./models/AdminUser");
const Banner = require("./models/Banner");
const Image = require("./models/Image");

const crypto = require("crypto");

const app = express();
const milleniumHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
});
const JWT_SECRET = process.env.JWT_SECRET || "restoran_secret_key_2024";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
app.use("/uploads", express.static("uploads"));
connectDB();

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token yo'q!" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ message: "Token noto'g'ri!" }); }
};
const superAdmin = (req, res, next) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ message: "Ruxsat yo'q!" });
  next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    /jpeg|jpg|png|webp|gif|mp4|webm/.test(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("Faqat rasm yoki video!"));
  },
});

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const TG_CHANNEL = process.env.TELEGRAM_CHANNEL_ID;
const sendTelegram = async (text) => {
  if (!TG_TOKEN) return;
  for (const chatId of [TG_CHAT, TG_CHANNEL].filter(Boolean)) {
    try {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      });
    } catch (e) { console.error("Telegram:", e.message); }
  }
};
const toTiyin = (amount) => Math.round(Number(amount || 0) * 100);

const nowMs = () => Date.now();

// const paymeError = (id, code, message, data = null) => ({
//   jsonrpc: "2.0",
//   id,
//   error: {
//     code,
//     message: {
//       uz: message,
//       ru: message,
//       en: message,
//     },
//     data,
//   },
// });

const paymeError = (id, code, message, data = null) => {
  console.log("PAYME ERROR:", code, message, data);

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message: String(message),
      data,
    },
  };
};

const paymeResult = (id, result) => ({
  jsonrpc: "2.0",
  id,
  result,
});

const checkPaymeAuth = (req) => {
  const auth = req.headers.authorization || "";
  const expected = Buffer.from(
    `${process.env.PAYME_LOGIN || "Paycom"}:${process.env.PAYME_KEY || ""}`
  ).toString("base64");

  return auth === `Basic ${expected}`;
};

const makePaymePaymentUrl = (order) => {
  const merchantId = process.env.PAYME_MERCHANT_ID;
  if (!merchantId) return "";

  const amountTiyin = toTiyin(order.totalPrice);
  const returnUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  const params = [
    `m=${merchantId}`,
    `ac.order_num=${order._id}`,
    `a=${amountTiyin}`,
    `l=uz`,
    `c=${encodeURIComponent(`${returnUrl}/orders`)}`,
  ].join(";");

  const encoded = Buffer.from(params).toString("base64");
  return `https://checkout.paycom.uz/${encoded}`;
};

const makeClickPaymentUrl = (order) => {
  const merchantId = process.env.CLICK_MERCHANT_ID;
  const serviceId = process.env.CLICK_SERVICE_ID;
  if (!merchantId || !serviceId) return "";

  const returnUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  const params = new URLSearchParams({
    service_id: String(serviceId),
    merchant_id: String(merchantId),
    amount: String(Number(order.totalPrice || 0)),
    transaction_param: String(order._id),
    return_url: `${returnUrl}/orders`,
  });

  return `https://my.click.uz/services/pay?${params.toString()}`;
};

const checkClickSign = (body) => {
  const secretKey = process.env.CLICK_SECRET_KEY || "";

  const {
    click_trans_id,
    service_id,
    merchant_trans_id,
    merchant_prepare_id,
    amount,
    action,
    sign_time,
    sign_string,
  } = body;

  const base = action === "1" || action === 1
    ? `${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${merchant_prepare_id}${amount}${action}${sign_time}`
    : `${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${amount}${action}${sign_time}`;

  const calculated = crypto.createHash("md5").update(base).digest("hex");
  return calculated === sign_string;
};

const FILIALS = {
  rustaveli: {
    name: "Yalpiz — Shota Rustaveli, 115",
    address: "Shota Rustaveli ko'chasi, 115, Toshkent",
    // Yandex link: ll=69.228442,41.261532
    lat: 41.261532,
    lng: 69.228442,
  },
  mvd: {
    name: "Yalpiz MVD — Mirobod, 1/1",
    address: "Mirobod ko'chasi, 1/1, Toshkent",
    // Google linkdan aniq koordinata ko'rinmagani uchun hozirgi koordinata qoldirildi.
    lat: 41.3015,
    lng: 69.2850,
  },
};

const makeSourceTime = () => {
  const now = new Date();
  return now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0");
};

const normalizeMilleniumPhone = (phone) => {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = "998" + digits;
  return digits;
};

const getSelectedFilial = (filialId) => {
  return FILIALS[filialId] || FILIALS.rustaveli;
};

const getMilleniumBaseUrl = () => {
  const milUrl = process.env.MILLENIUM_API_URL || "";
  if (!milUrl) throw new Error("MILLENIUM_API_URL sozlanmagan");
  return milUrl.startsWith("http") ? milUrl : `https://${milUrl}`;
};

const makeMilleniumHeaders = (jsonBody) => {
  const apiKey = process.env.MILLENIUM_API_KEY || "";
  if (!apiKey) throw new Error("MILLENIUM_API_KEY sozlanmagan");

  const signature = crypto
    .createHash("md5")
    .update(jsonBody + apiKey)
    .digest("hex");

  const headers = {
    "Content-Type": "application/json",
    "Signature": signature,
  };

  if (process.env.MILLENIUM_USER_ID) {
    headers["X-User-Id"] = process.env.MILLENIUM_USER_ID;
  }

  return headers;
};

const callMillenium = async (endpoint, payload) => {
  const fullUrl = getMilleniumBaseUrl();
  const jsonBody = JSON.stringify(payload);
  const headers = makeMilleniumHeaders(jsonBody);

  const response = await fetch(`${fullUrl}${endpoint}`, {
    method: "POST",
    headers,
    body: jsonBody,
    agent: fullUrl.startsWith("https") ? milleniumHttpsAgent : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Millenium HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
};

const extractMilleniumPrice = (data) => {
  const candidates = [
    data?.data?.sum,
    data?.data?.total_sum,
    data?.data?.total_cost,
    data?.data?.cost,
    data?.data?.price,
    data?.sum,
    data?.total_sum,
    data?.total_cost,
    data?.cost,
    data?.price,
  ];

  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
};

const calcMilleniumDeliveryPrice = async ({ filialId, location }) => {
  if (process.env.MILLENIUM_ENABLED !== "true") {
    throw new Error("Millenium integratsiyasi yoqilmagan");
  }
  if (!location?.lat || !location?.lng) {
    throw new Error("Mijoz lokatsiyasi kerak");
  }

  const restaurant = getSelectedFilial(filialId);
  const clientId = Number(process.env.MILLENIUM_CLIENT_ID || 0);
  const crewGroupId = Number(process.env.MILLENIUM_CREW_GROUP_ID || 0);

  if (!clientId) {
    throw new Error("MILLENIUM_CLIENT_ID env qo'yilmagan");
  }
  if (!crewGroupId) {
    throw new Error("MILLENIUM_CREW_GROUP_ID env qo'yilmagan");
  }

  // Support tavsiyasi: calc_order_cost2 uchun phone emas, client_id yuboriladi.
  const payload = {
    crew_group_id: crewGroupId,
    client_id: clientId,
    analyze_route: true,
    source_time: makeSourceTime(),
    source_lon: Number(restaurant.lng),
    source_lat: Number(restaurant.lat),
    dest_lon: Number(location.lng),
    dest_lat: Number(location.lat),
  };

  const milData = await callMillenium("/common_api/1.0/calc_order_cost2", payload);
  console.log("Millenium calc_order_cost2 response:", JSON.stringify(milData, null, 2));

  if (!milData || Number(milData.code) !== 0) {
    throw new Error(milData?.descr || "Millenium narx hisoblashda xato qaytardi");
  }

  const price = extractMilleniumPrice(milData);
  if (!price) {
    throw new Error("Millenium javobida narx topilmadi. Response fieldlarini tekshiring.");
  }

  return {
    price,
    source: "millenium",
    restaurant,
    raw: milData,
  };
};

const createFirstAdmin = async () => {
  try {
    if (!await AdminUser.findOne({ username: "superadmin" })) {
      await new AdminUser({ username: "superadmin", password: await bcrypt.hash("Admin123!", 10), role: "superadmin" }).save();
      console.log("SuperAdmin: superadmin / Admin123!");
    }
  } catch (e) { console.error(e); }
};

// ════ IMAGE UPLOAD ════════════════════════════════════════════════════════════
app.post("/api/upload", auth, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Rasm shart!" });
    const ext = path.extname(req.file.originalname).replace(".", "").toLowerCase() || "jpg";
    const mimeType = req.file.mimetype || `image/${ext}`;
    const dataUrl = `data:${mimeType};base64,${req.file.buffer.toString("base64")}`;
    const image = await new Image({ name: req.file.originalname, mimeType, size: req.file.size, data: dataUrl }).save();
    const imageUrl = `${process.env.BACKEND_URL || ""}/api/images/${image._id}`;
    res.json({ success: true, url: imageUrl, id: image._id });
  } catch (e) { res.status(500).json({ message: "Yuklashda xato: " + e.message }); }
});

app.get("/api/images/:id", async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).send("Not found");
    const buffer = Buffer.from(image.data.replace(/^data:[^;]+;base64,/, ""), "base64");
    res.set("Content-Type", image.mimeType);
    res.set("Cache-Control", "public, max-age=31536000");
    res.send(buffer);
  } catch { res.status(500).send("Error"); }
});

// ════ AUTH ════════════════════════════════════════════════════════════════════
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await AdminUser.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password))
      return res.status(401).json({ message: "Username yoki parol xato!" });
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token, user: { username: user.username, role: user.role } });
  } catch { res.status(500).json({ message: "Server xatosi" }); }
});

app.post("/auth/create-admin", auth, superAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (await AdminUser.findOne({ username })) return res.status(400).json({ message: "Username band!" });
    const a = await new AdminUser({ username, password: await bcrypt.hash(password, 10), role }).save();
    res.status(201).json({ message: "Admin yaratildi", admin: { username: a.username, role: a.role } });
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.get("/auth/admins", auth, superAdmin, async (req, res) => {
  try { res.json(await AdminUser.find().select("-password")); } catch { res.status(500).json({ message: "Xato" }); }
});

app.delete("/auth/admins/:id", auth, superAdmin, async (req, res) => {
  try {
    const a = await AdminUser.findById(req.params.id);
    if (!a) return res.status(404).json({ message: "Topilmadi" });
    if (a.role === "superadmin") return res.status(403).json({ message: "Superadminni o'chirib bo'lmaydi!" });
    await AdminUser.findByIdAndDelete(req.params.id);
    res.json({ message: "O'chirildi" });
  } catch { res.status(500).json({ message: "Xato" }); }
});

// ════ FOODS ═══════════════════════════════════════════════════════════════════
// Helper: eski string format ni yangi object formatga o'girish
const parseField = (val, fallback = "") => {
  if (!val) return { uz: fallback, ru: fallback, en: fallback };
  if (typeof val === "object") return val;
  return { uz: val, ru: val, en: val };
};

app.get("/api/foods", async (req, res) => {
  try {
    const filter = req.query.category ? { "category.uz": req.query.category } : {};
    const foods = await Food.find(filter).sort({ createdAt: -1 });
    res.json(foods);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.get("/api/foods/:id", async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);
    if (!food) return res.status(404).json({ message: "Topilmadi" });
    res.json(food);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.post("/api/foods", auth, async (req, res) => {
  try {
    const { title_uz, title_ru, title_en, price, category_uz, category_ru, category_en, desc_uz, desc_ru, desc_en, imageUrl, isAvailable = true } = req.body;
    if (!imageUrl) return res.status(400).json({ message: "Rasm shart! Avval yuklang." });
    if (!title_uz) return res.status(400).json({ message: "O'zbek tili nomi shart!" });

    const food = await new Food({
      title: { uz: title_uz, ru: title_ru || title_uz, en: title_en || title_uz },
      price: parseFloat(String(price).replace(/[^0-9.]/g,'')) || 0,
      category: { uz: category_uz, ru: category_ru || category_uz, en: category_en || category_uz },
      description: { uz: desc_uz || "", ru: desc_ru || "", en: desc_en || "" },
      image: imageUrl,
      isAvailable: isAvailable !== false && isAvailable !== "false",
    }).save();
    res.status(201).json(food);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

app.put("/api/foods/:id", auth, async (req, res) => {
  try {
    const { title_uz, title_ru, title_en, price, category_uz, category_ru, category_en, desc_uz, desc_ru, desc_en, imageUrl, isAvailable } = req.body;
    const update = {
      price: parseFloat(String(price).replace(/[^0-9.]/g,'')) || 0,
      title: { uz: title_uz, ru: title_ru || title_uz, en: title_en || title_uz },
      category: { uz: category_uz, ru: category_ru || category_uz, en: category_en || category_uz },
      description: { uz: desc_uz || "", ru: desc_ru || "", en: desc_en || "" },
    };
    if (isAvailable !== undefined) update.isAvailable = isAvailable !== false && isAvailable !== "false";
    if (imageUrl) update.image = imageUrl;
    const updated = await Food.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ message: "Topilmadi" });
    res.json(updated);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

app.patch("/api/foods/:id/availability", auth, async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const food = await Food.findByIdAndUpdate(
      req.params.id,
      { isAvailable: isAvailable !== false && isAvailable !== "false" },
      { new: true }
    );
    if (!food) return res.status(404).json({ message: "Topilmadi" });
    res.json(food);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

app.delete("/api/foods/:id", auth, async (req, res) => {
  try {
    await Food.findByIdAndDelete(req.params.id);
    res.json({ message: "O'chirildi" });
  } catch { res.status(500).json({ message: "Xato" }); }
});


app.post("/api/millenium/calc-price", async (req, res) => {
  try {
    const { filialId, location } = req.body || {};
    if (!filialId || !FILIALS[filialId]) {
      return res.status(400).json({ success: false, message: "Filial noto'g'ri yoki tanlanmagan" });
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
app.post("/api/orders", async (req, res) => {
  try {
    const { customerName, customerPhone, items, totalPrice, address, location, orderType, tableNumber, paymentType, filialId, filialName } = req.body;
    if (!customerName || !customerPhone || !items?.length)
      return res.status(400).json({ message: "Ism, telefon va taomlar shart!" });

    const normalizedOrderType = orderType || "delivery";
    const normalizedPaymentType = paymentType || "click";
    if (!["click", "payme"].includes(normalizedPaymentType)) {
      return res.status(400).json({ message: "Faqat Click yoki Payme orqali to'lov qabul qilinadi." });
    }

    const foodIds = [...new Set(items.map(i => String(i.foodId || "")).filter(Boolean))];
    const validFoodIds = foodIds.filter(id => /^[a-f0-9]{24}$/i.test(id));
    if (validFoodIds.length !== foodIds.length) {
      return res.status(400).json({ message: "Taom ID noto'g'ri. Savatni yangilang." });
    }

    if (validFoodIds.length) {
      const dbFoods = await Food.find({ _id: { $in: validFoodIds } }).select("title isAvailable");
      if (dbFoods.length !== validFoodIds.length) {
        return res.status(400).json({ message: "Savatdagi ayrim taomlar topilmadi. Savatni yangilang." });
      }
      const unavailable = dbFoods.find(f => f.isAvailable === false);
      if (unavailable) {
        const title = unavailable.title?.uz || "Tanlangan taom";
        return res.status(400).json({ message: `${title} hozircha mavjud emas. Iltimos, savatdan olib tashlang.` });
      }
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

    const order = await new Order({
      customerName,
      customerPhone,
      items,
      totalPrice,
      address,
      location,
      orderType: normalizedOrderType,
      tableNumber: tableNumber || "",
      paymentType: normalizedPaymentType,
      paymentProvider: normalizedPaymentType,
      paymentStatus: "pending",
      filialId: filialId || null,
      filialName: filialName || null,
      deliveryPrice: deliveryCalc?.price || 0,
      deliveryPriceSource: deliveryCalc?.source || "",
      deliveryPriceCalculatedAt: deliveryCalc ? new Date() : null,
      deliveryPriceRaw: deliveryCalc?.raw || null,
      status: "new"
    }).save();

    if (normalizedPaymentType === "payme") {
      order.paymentUrl = makePaymePaymentUrl(order);
      await order.save();
    }

    if (normalizedPaymentType === "click") {
      order.paymentUrl = makeClickPaymentUrl(order);
      await order.save();
    }

    // Millenium Taxi ga yuborish (create_order2, faqat delivery bo'lsa)
    if (
      process.env.MILLENIUM_ENABLED === "true" &&
      normalizedOrderType === "delivery" &&
      process.env.MILLENIUM_API_URL
    ) {
      try {
        const crypto = require("crypto");

        const milUrl = process.env.MILLENIUM_API_URL;
        const apiKey = process.env.MILLENIUM_API_KEY || "";
        const userId = process.env.MILLENIUM_USER_ID || "";

        const fullUrl = milUrl.startsWith("http") ? milUrl : `https://${milUrl}`;

        const now = new Date();
        const sourceTime =
          now.getFullYear().toString() +
          String(now.getMonth() + 1).padStart(2, "0") +
          String(now.getDate()).padStart(2, "0") +
          String(now.getHours()).padStart(2, "0") +
          String(now.getMinutes()).padStart(2, "0") +
          String(now.getSeconds()).padStart(2, "0");

        const selectedRestaurant = FILIALS[filialId] || null;
        const restaurantAddress =
          selectedRestaurant?.address || process.env.RESTAURANT_ADDRESS || "Yalpiz restoran, Toshkent";

        const restaurantLat = selectedRestaurant?.lat || Number(process.env.RESTAURANT_LAT || 41.261532);
        const restaurantLng = selectedRestaurant?.lng || Number(process.env.RESTAURANT_LNG || 69.228442);

        const milleniumPhone = normalizeMilleniumPhone(customerPhone);

        console.log("Customer phone original:", customerPhone);
        console.log("Customer phone Millenium:", milleniumPhone);

        if (!milleniumPhone || milleniumPhone.length < 9) {
          console.log("⚠️ Millenium order yuborilmadi: telefon raqam noto‘g‘ri yoki bo‘sh");
          return;
        }

        // +998781295555

        const payload = {
          phone: milleniumPhone,
          phone_to_dial: milleniumPhone,
          source_time: sourceTime,
          is_prior: false,
          check_duplicate: true,
          customer: customerName,
          passenger: customerName,
          comment: `Yalpiz delivery order #${order._id}. Taomlar: ${Number(totalPrice || 0).toLocaleString()} so'm. Oldindan hisoblangan taxi: ${Number(order.deliveryPrice || 0).toLocaleString()} so'm. To'lov: ${paymentType}. Taxi pulini mijoz haydovchiga alohida to'laydi.`,
          addresses: [
            {
              address: restaurantAddress,
              lat: restaurantLat,
              lon: restaurantLng,
            },
            {
              address: address || "Mijoz manzili",
              lat: location?.lat ? Number(location.lat) : undefined,
              lon: location?.lng ? Number(location.lng) : undefined,
            },
          ],
        };


        if (process.env.MILLENIUM_CREW_GROUP_ID) {
          payload.crew_group_id = Number(process.env.MILLENIUM_CREW_GROUP_ID);
        }

        // undefined fieldlarni olib tashlash
        payload.addresses = payload.addresses.map((addr) => {
          const clean = {};
          Object.keys(addr).forEach((key) => {
            if (addr[key] !== undefined && addr[key] !== null && addr[key] !== "") {
              clean[key] = addr[key];
            }
          });
          return clean;
        });

        const jsonBody = JSON.stringify(payload);

        const signature = crypto
          .createHash("md5")
          .update(jsonBody + apiKey)
          .digest("hex");

        const headers = {
          "Content-Type": "application/json",
          "Signature": signature,
        };

        if (userId) {
          headers["X-User-Id"] = userId;
        }

        const milRes = await fetch(`${fullUrl}/common_api/1.0/create_order2`, {
          method: "POST",
          headers,
          body: jsonBody,
          agent: fullUrl.startsWith("https") ? milleniumHttpsAgent : undefined,
        });

        const milData = await milRes.json();
        console.log("Millenium create_order2 response:", JSON.stringify(milData, null, 2));

        if (milData && milData.code === 0 && milData.data?.order_id) {
          order.milleniumOrderId = String(milData.data.order_id);
          await order.save();
          console.log("✅ Millenium order yaratildi:", order.milleniumOrderId);
        } else {
          console.log("⚠️ Millenium order yaratilmadi:", milData?.descr || milData);
        }
      } catch (milErr) {
        console.error("⚠️ Millenium API xato:", milErr.message);
      }
    }
    const itemsList = items.map(i => `  • ${i.title} × ${i.quantity} = ${(i.price * i.quantity).toLocaleString()} so'm`).join("\n");
    const locText = location ? `\n🗺 <a href="https://yandex.com/maps/?pt=${location.lng},${location.lat}&z=16&l=map">Xaritada ko'rish</a>` : "";
    const deliveryText = order.deliveryPrice ? `\n🚕 <b>Taxi: ${order.deliveryPrice.toLocaleString()} so'm</b> (haydovchiga alohida)` : "";
    await sendTelegram(`🛎 <b>YANGI BUYURTMA!</b>\n\n👤 <b>${customerName}</b>\n📞 ${customerPhone}\n${address ? `📍 ${address}\n` : ""}${locText}\n\n🍽 <b>Taomlar:</b>\n${itemsList}\n\n💰 <b>Taomlar jami: ${totalPrice?.toLocaleString()} so'm</b>${deliveryText}`);
    res.status(201).json({
      message: "Buyurtma qabul qilindi! ✅",
      order,
      paymentUrl: order.paymentUrl || "",
    });
  } catch (e) { res.status(500).json({ message: "Xato", error: e.message }); }
});

app.get("/api/orders", auth, async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    res.json(await Order.find(filter).sort({ createdAt: -1 }));
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.get("/api/orders/my/:phone", async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    res.json(await Order.find({ customerPhone: phone }).sort({ createdAt: -1 }).limit(20));
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.put("/api/orders/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["new","preparing","delivered","cancelled"].includes(status))
      return res.status(400).json({ message: "Noto'g'ri status!" });
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: "Topilmadi" });
    const emoji = { preparing:"🍳", delivered:"✅", cancelled:"❌" };
    const label = { preparing:"Tayyorlanmoqda", delivered:"Yetkazildi", cancelled:"Bekor" };
    if (emoji[status]) await sendTelegram(`${emoji[status]} <b>${label[status]}</b>\n👤 ${order.customerName} | 📞 ${order.customerPhone}`);
    res.json(order);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.delete("/api/orders/:id", auth, async (req, res) => {
  try { await Order.findByIdAndDelete(req.params.id); res.json({ message: "O'chirildi" }); }
  catch { res.status(500).json({ message: "Xato" }); }
});

// ════ PAYME MERCHANT API CALLBACK ═════════════════════════════════════════════
app.post("/api/payments/payme", async (req, res) => {
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

      if (toTiyin(order.totalPrice) !== Number(params.amount)) {
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

      if (toTiyin(order.totalPrice) !== Number(params.amount)) {
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

      await sendTelegram(
        `✅ <b>PAYME TO‘LOV QILINDI</b>\n\n` +
        `👤 ${order.customerName}\n` +
        `📞 ${order.customerPhone}\n` +
        `💰 ${order.totalPrice?.toLocaleString()} so'm\n` +
        `🧾 Order: ${order._id}`
      );

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
const clickOk = (data) => ({
  error: 0,
  error_note: "Success",
  ...data,
});

const clickError = (code, note, data = {}) => ({
  error: code,
  error_note: note,
  ...data,
});

app.post("/api/payments/click/prepare", async (req, res) => {
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

    if (Number(order.totalPrice) !== Number(body.amount)) {
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

app.post("/api/payments/click/complete", async (req, res) => {
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

    if (String(body.error) !== "0") {
      order.paymentStatus = "failed";
      await order.save();

      return res.json(clickError(Number(body.error), body.error_note || "Click payment failed", {
        click_trans_id: body.click_trans_id,
        merchant_trans_id: body.merchant_trans_id,
        merchant_confirm_id: String(order._id),
      }));
    }

    if (Number(order.totalPrice) !== Number(body.amount)) {
      return res.json(clickError(-2, "Incorrect amount"));
    }

    order.paymentProvider = "click";
    order.paymentStatus = "paid";
    order.clickCompleteId = String(body.click_trans_id || "");
    order.paymentTransactionId = String(body.click_trans_id || "");
    await order.save();

    await sendTelegram(
      `✅ <b>CLICK TO‘LOV QILINDI</b>\n\n` +
      `👤 ${order.customerName}\n` +
      `📞 ${order.customerPhone}\n` +
      `💰 ${order.totalPrice?.toLocaleString()} so'm\n` +
      `🧾 Order: ${order._id}`
    );

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

// ════ MILLENIUM WEBHOOK ═══════════════════════════════════════════════════════
const pick = (...values) => {
  return values.find(v => v !== undefined && v !== null && String(v).trim() !== "");
};

const parseIds = (envName) => {
  return (process.env[envName] || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
};

const mapMilleniumStatus = (payload) => {
  const data = payload.data || {};

  const stateId = String(pick(
    payload.state_id,
    payload.stateId,
    payload.status_id,
    data.state_id,
    data.stateId,
    data.status_id,
    ""
  ));

  const stateText = String(pick(
    payload.state,
    payload.status,
    payload.status_name,
    data.state,
    data.status,
    data.status_name,
    ""
  )).toLowerCase();

  const preparingIds = parseIds("MILLENIUM_PREPARING_STATE_IDS");
  const deliveredIds = parseIds("MILLENIUM_DELIVERED_STATE_IDS");
  const cancelledIds = parseIds("MILLENIUM_CANCELLED_STATE_IDS");

  if (cancelledIds.includes(stateId)) return "cancelled";
  if (deliveredIds.includes(stateId)) return "delivered";
  if (preparingIds.includes(stateId)) return "preparing";

  if (
    stateText.includes("cancel") ||
    stateText.includes("отмен") ||
    stateText.includes("bekor")
  ) {
    return "cancelled";
  }

  if (
    stateText.includes("delivered") ||
    stateText.includes("complete") ||
    stateText.includes("выполн") ||
    stateText.includes("заверш") ||
    stateText.includes("достав")
  ) {
    return "delivered";
  }

  if (
    stateText.includes("driver") ||
    stateText.includes("assigned") ||
    stateText.includes("экипаж") ||
    stateText.includes("назнач") ||
    stateText.includes("way") ||
    stateText.includes("в пути")
  ) {
    return "preparing";
  }

  return null;
};

app.get("/webhook/millenium", (req, res) => {
  res.json({
    status: "ok",
    message: "Millenium webhook ishlayapti ✅",
    method: "POST"
  });
});

app.post("/webhook/millenium", async (req, res) => {
  try {
    console.log("📩 Millenium webhook:", JSON.stringify(req.body, null, 2));

    const body = req.body || {};
    const data = body.data || {};

    const milleniumOrderId = String(pick(
      body.order_id,
      body.orderId,
      body.id_order,
      body.milleniumOrderId,
      data.order_id,
      data.orderId,
      data.id_order,
      data.milleniumOrderId,
      ""
    ));

    if (!milleniumOrderId) {
      return res.json({
        ok: false,
        message: "Millenium order_id topilmadi",
        received: body
      });
    }

    const driverName = pick(
      body.driver_name,
      body.driverName,
      body.driver?.name,
      data.driver_name,
      data.driverName,
      data.driver?.name,
      data.crew?.driver_name,
      data.crew?.driverName
    );

    const driverPhone = pick(
      body.driver_phone,
      body.driverPhone,
      body.driver?.phone,
      data.driver_phone,
      data.driverPhone,
      data.driver?.phone,
      data.crew?.driver_phone,
      data.crew?.driverPhone
    );

    const carModel = pick(
      body.car_model,
      body.carModel,
      body.car?.model,
      data.car_model,
      data.carModel,
      data.car?.model,
      data.crew?.car_model,
      data.crew?.carModel
    );

    const driverLat = pick(
      body.driver_lat,
      body.driverLat,
      body.driverLocation?.lat,
      data.driver_lat,
      data.driverLat,
      data.driverLocation?.lat,
      data.crew?.lat
    );

    const driverLng = pick(
      body.driver_lon,
      body.driver_lng,
      body.driverLng,
      body.driverLocation?.lng,
      data.driver_lon,
      data.driver_lng,
      data.driverLng,
      data.driverLocation?.lng,
      data.crew?.lon,
      data.crew?.lng
    );

    const mappedStatus = mapMilleniumStatus(body);

    const update = {};

    if (driverName) update.driverName = String(driverName);
    if (driverPhone) update.driverPhone = String(driverPhone);
    if (carModel) update.carModel = String(carModel);

    if (driverLat && driverLng) {
      update.driverLocation = {
        lat: Number(driverLat),
        lng: Number(driverLng),
      };
    }

    if (mappedStatus) {
      update.status = mappedStatus;
    }

    const order = await Order.findOneAndUpdate(
      { milleniumOrderId },
      { $set: update },
      { new: true }
    );

    if (!order) {
      return res.json({
        ok: false,
        message: "Bu Millenium order_id bilan lokal order topilmadi",
        milleniumOrderId
      });
    }

    console.log("✅ Millenium webhook order yangilandi:", order._id);

    res.json({
      ok: true,
      message: "Order yangilandi",
      order
    });
  } catch (e) {
    console.error("Millenium webhook xato:", e.message);
    res.status(500).json({
      ok: false,
      message: e.message
    });
  }
});

// ════ BANNERS (ko'p banner, slider) ══════════════════════════════════════════

// GET - faol bannerlar (mijozlar uchun)
app.get("/api/banners", async (req, res) => {
  try {
    const now = new Date();
    const all = await Banner.find().sort({ order: 1, createdAt: -1 });
    const active = all.filter(b => {
      if (!b.isActive) return false;
      if (b.startDate && new Date(b.startDate) > now) return false;
      if (b.endDate && new Date(b.endDate) < now) return false;
      return true;
    });
    if (active.length === 0) {
      return res.json([{ _id:"default", title:"Mazali taomlar", subtitle:"Yalpiz restoranidan 🚀", description:"Tez, yangi va arzon", bgColor:"#1a5c30", mediaType:"none", mediaUrl:"", events:[], isActive:true }]);
    }
    res.json(active);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET all - admin uchun (hammasi)
app.get("/api/banners/all", auth, async (req, res) => {
  try { res.json(await Banner.find().sort({ order: 1, createdAt: -1 })); }
  catch(e) { res.status(500).json({ message: e.message }); }
});

// POST - yangi banner (faqat superadmin)
app.post("/api/banners", auth, superAdmin, upload.single("media"), async (req, res) => {
  try {
    const { title, subtitle, description, bgColor, events, mediaType, imageUrl, buttonText, buttonLink, startDate, endDate, order, isActive } = req.body;
    let mediaUrl = imageUrl || "";
    if (req.file && mediaType !== "none") {
      const ext = path.extname(req.file.originalname).replace(".", "").toLowerCase() || "jpg";
      const mime = req.file.mimetype || `image/${ext}`;
      const dataUrl = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
      const img = await new Image({ name: req.file.originalname, mimeType: mime, size: req.file.size, data: dataUrl }).save();
      mediaUrl = `${process.env.BACKEND_URL || ""}/api/images/${img._id}`;
    }
    const banner = await new Banner({
      title: title || "Yangi banner",
      subtitle: subtitle || "",
      description: description || "",
      bgColor: bgColor || "#1a5c30",
      mediaType: mediaType || "none",
      mediaUrl,
      buttonText: buttonText || "",
      buttonLink: buttonLink || "",
      events: events ? JSON.parse(events) : [],
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      order: order ? parseInt(order) : 0,
      isActive: isActive === "false" ? false : true,
    }).save();
    res.status(201).json(banner);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// PUT - bannerni yangilash (faqat superadmin)
app.put("/api/banners/:id", auth, superAdmin, upload.single("media"), async (req, res) => {
  try {
    const { title, subtitle, description, bgColor, events, mediaType, imageUrl, buttonText, buttonLink, startDate, endDate, order, isActive } = req.body;
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: "Topilmadi" });
    if (title !== undefined) banner.title = title;
    if (subtitle !== undefined) banner.subtitle = subtitle;
    if (description !== undefined) banner.description = description;
    if (bgColor !== undefined) banner.bgColor = bgColor;
    if (mediaType !== undefined) banner.mediaType = mediaType;
    if (buttonText !== undefined) banner.buttonText = buttonText;
    if (buttonLink !== undefined) banner.buttonLink = buttonLink;
    if (events !== undefined) banner.events = JSON.parse(events);
    if (startDate !== undefined) banner.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) banner.endDate = endDate ? new Date(endDate) : null;
    if (order !== undefined) banner.order = parseInt(order);
    if (isActive !== undefined) banner.isActive = isActive === "true" || isActive === true;
    if (mediaType === "none") { banner.mediaUrl = ""; }
    else if (imageUrl) { banner.mediaUrl = imageUrl; }
    else if (req.file) {
      const ext = path.extname(req.file.originalname).replace(".", "").toLowerCase() || "jpg";
      const mime = req.file.mimetype || `image/${ext}`;
      const dataUrl = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
      const img = await new Image({ name: req.file.originalname, mimeType: mime, size: req.file.size, data: dataUrl }).save();
      banner.mediaUrl = `${process.env.BACKEND_URL || ""}/api/images/${img._id}`;
    }
    await banner.save();
    res.json(banner);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// DELETE banner (faqat superadmin)
app.delete("/api/banners/:id", auth, superAdmin, async (req, res) => {
  try { await Banner.findByIdAndDelete(req.params.id); res.json({ message: "O'chirildi" }); }
  catch(e) { res.status(500).json({ message: e.message }); }
});

// Eski endpoint - backwards compat
app.get("/api/banner", async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({ order: 1 });
    res.json(banners[0] || { title:"Mazali taomlar", subtitle:"Yalpiz restoranidan", bgColor:"#1a5c30" });
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.put("/api/banner", auth, upload.single("media"), async (req, res) => {
  try {
    const { title, subtitle, description, bgColor, events, mediaType, imageUrl } = req.body;
    let banner = await Banner.findOne();
    if (!banner) banner = new Banner({});
    if (title !== undefined) banner.title = title;
    if (subtitle !== undefined) banner.subtitle = subtitle;
    if (description !== undefined) banner.description = description;
    if (bgColor !== undefined) banner.bgColor = bgColor;
    if (mediaType !== undefined) banner.mediaType = mediaType;
    if (events !== undefined) banner.events = JSON.parse(events);
    if (mediaType === "none") { banner.mediaUrl = ""; }
    else if (imageUrl) { banner.mediaUrl = imageUrl; }
    else if (req.file) {
      const ext = path.extname(req.file.originalname).replace(".", "").toLowerCase() || "jpg";
      const dataUrl = `data:image/${ext};base64,${req.file.buffer.toString("base64")}`;
      const image = await new Image({ name: req.file.originalname, mimeType: `image/${ext}`, size: req.file.size, data: dataUrl }).save();
      banner.mediaUrl = `${process.env.BACKEND_URL || ""}/api/images/${image._id}`;
    }
    await banner.save();
    res.json(banner);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server http://localhost:${PORT}`);
  await createFirstAdmin();
});
