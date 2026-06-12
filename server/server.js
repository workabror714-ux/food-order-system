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
const Filial = require("./models/Filial");

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
const TG_STAFF = process.env.TELEGRAM_STAFF_CHAT_ID; // xodimlar guruhi (tugmali xabarlar)

// Telegram Bot API ga umumiy so'rov
const tgApi = async (method, payload) => {
  if (!TG_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) { console.error("Telegram API:", method, e.message); return null; }
};

const ORDER_STATUSES = ["new", "preparing", "on_way", "delivered", "cancelled"];
const STATUS_LABELS = {
  new: "🆕 Yangi",
  preparing: "🍳 Tayyorlanmoqda",
  on_way: "🚕 Yo'lda",
  delivered: "✅ Yetkazildi",
  cancelled: "❌ Bekor qilingan",
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

  const amountTiyin = toTiyin(order.paymentAmount || order.totalPrice);
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
    amount: String(Number(order.paymentAmount || order.totalPrice || 0)),
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

// Filiallar DB'da saqlanadi. Sinxron kodlar (taxi narxi, order) uchun
// xotirada cache saqlaymiz: { slug: {name,address,lat,lng,isActive} }
let FILIALS = {};

// Boshlang'ich filiallar (DB bo'sh bo'lsa, bir marta yoziladi)
const DEFAULT_FILIALS = [
  { slug: "rustaveli", name: "Yalpiz — Shota Rustaveli, 115", address: "Shota Rustaveli ko'chasi, 115, Toshkent", lat: 41.261532, lng: 69.228442, isActive: true, order: 0 },
  { slug: "mvd",       name: "Yalpiz MVD — Mirobod, 1/1",     address: "Mirobod ko'chasi, 1/1, Toshkent",     lat: 41.3015,   lng: 69.2850,   isActive: true, order: 1 },
];

// DB'dan o'qib, FILIALS cache'ni yangilaydi (slug -> obyekt)
const reloadFilialsCache = async () => {
  try {
    const list = await Filial.find({}).sort({ order: 1, createdAt: 1 });
    const next = {};
    for (const f of list) {
      next[f.slug] = {
        _id: String(f._id),
        slug: f.slug,
        name: f.name,
        address: f.address || "",
        lat: f.lat,
        lng: f.lng,
        isActive: f.isActive !== false,
      };
    }
    FILIALS = next;
    return list;
  } catch (e) {
    console.error("Filiallar cache xato:", e.message);
    return [];
  }
};

// Server ishga tushganda: DB bo'sh bo'lsa default filiallarni yozadi, keyin cache yuklaydi
const seedFilials = async () => {
  try {
    const count = await Filial.countDocuments();
    if (count === 0) {
      await Filial.insertMany(DEFAULT_FILIALS);
      console.log("✅ Boshlang'ich filiallar yozildi");
    }
    await reloadFilialsCache();
    console.log(`✅ ${Object.keys(FILIALS).length} ta filial yuklandi`);
  } catch (e) {
    console.error("Filiallar seed xato:", e.message);
  }
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
  if (filialId && FILIALS[filialId]) return FILIALS[filialId];
  // fallback: birinchi mavjud filial
  const first = Object.values(FILIALS)[0];
  return first || null;
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

// ════ FILIALLAR (Restoran filiallari) ═════════════════════════════════════════
// slug generatsiyasi: nomdan, lotin harflari + raqam, takrorlanmas
const makeFilialSlug = (name) => {
  const base = String(name || "filial")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "filial";
  return `${base}-${Date.now().toString(36)}`;
};

// Mijoz uchun — barcha filiallar (yopiqlar isActive:false flagi bilan)
app.get("/api/filials", async (req, res) => {
  try {
    const list = await Filial.find({}).sort({ order: 1, createdAt: 1 });
    res.json(list.map(f => ({
      id: f.slug,
      name: f.name,
      address: f.address || "",
      lat: f.lat,
      lng: f.lng,
      isActive: f.isActive !== false,
    })));
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// Admin uchun — barcha filiallar (to'liq, _id bilan)
app.get("/api/filials/all", auth, async (req, res) => {
  try {
    const list = await Filial.find({}).sort({ order: 1, createdAt: 1 });
    res.json(list);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// Yangi filial qo'shish
app.post("/api/filials", auth, async (req, res) => {
  try {
    const { name, address, lat, lng, isActive, order } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Filial nomi shart" });
    }
    const filial = await new Filial({
      slug: makeFilialSlug(name),
      name: String(name).trim(),
      address: address || "",
      lat: lat === "" || lat === undefined ? null : Number(lat),
      lng: lng === "" || lng === undefined ? null : Number(lng),
      isActive: isActive !== false && isActive !== "false",
      order: Number(order) || 0,
    }).save();
    await reloadFilialsCache();
    res.status(201).json(filial);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// Filialni tahrirlash (slug o'zgarmaydi — eski buyurtmalar saqlanadi)
app.put("/api/filials/:id", auth, async (req, res) => {
  try {
    const { name, address, lat, lng, isActive, order } = req.body;
    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (address !== undefined) update.address = address;
    if (lat !== undefined) update.lat = lat === "" ? null : Number(lat);
    if (lng !== undefined) update.lng = lng === "" ? null : Number(lng);
    if (isActive !== undefined) update.isActive = isActive !== false && isActive !== "false";
    if (order !== undefined) update.order = Number(order) || 0;
    const filial = await Filial.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!filial) return res.status(404).json({ message: "Topilmadi" });
    await reloadFilialsCache();
    res.json(filial);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// Yoqish / o'chirish (vaqtincha yopish)
app.patch("/api/filials/:id/toggle", auth, async (req, res) => {
  try {
    const { isActive } = req.body;
    const filial = await Filial.findByIdAndUpdate(
      req.params.id,
      { isActive: isActive !== false && isActive !== "false" },
      { new: true }
    );
    if (!filial) return res.status(404).json({ message: "Topilmadi" });
    await reloadFilialsCache();
    res.json(filial);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// O'chirish
app.delete("/api/filials/:id", auth, async (req, res) => {
  try {
    const filial = await Filial.findByIdAndDelete(req.params.id);
    if (!filial) return res.status(404).json({ message: "Topilmadi" });
    await reloadFilialsCache();
    res.json({ message: "O'chirildi" });
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

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
    if (FILIALS[filialId].isActive === false) {
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
app.post("/api/orders", async (req, res) => {
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
    if (filialId && FILIALS[filialId] && FILIALS[filialId].isActive === false) {
      return res.status(400).json({ message: "Tanlangan filial vaqtincha yopiq. Boshqa filialni tanlang." });
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

    // Jami to'lov summasi: taomlar + taxi (pickup'da taxi = 0)
    const paymentAmount = Number(totalPrice || 0) + (deliveryCalc?.price || 0);

    const order = await new Order({
      customerName,
      customerPhone,
      items,
      totalPrice,
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
      await sendPaidOrderTelegram(order);
      return res.status(201).json({
        message: "Buyurtma qabul qilindi! ✅",
        order,
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

app.delete("/api/orders/:id", auth, async (req, res) => {
  try { await Order.findByIdAndDelete(req.params.id); res.json({ message: "O'chirildi" }); }
  catch { res.status(500).json({ message: "Xato" }); }
});

// ════ PAYME MERCHANT API CALLBACK ═════════════════════════════════════════════
// ════ TO'LOVDAN KEYINGI ISHLAR: TAXI CHAQIRISH + OSHXONA TELEGRAMI ═════════════
// To'lov tasdiqlangach chaqiriladi (Payme PerformTransaction / Click complete).
const dispatchMilleniumOrder = async (order) => {
  try {
    if (process.env.MILLENIUM_ENABLED !== "true") return;
    if (!process.env.MILLENIUM_API_URL) return;
    if (order.orderType !== "delivery") return;
    if (order.milleniumOrderId) return; // allaqachon chaqirilgan — qayta chaqirmaymiz

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

    const selectedRestaurant = FILIALS[order.filialId] || null;
    const restaurantAddress =
      selectedRestaurant?.address || process.env.RESTAURANT_ADDRESS || "Yalpiz restoran, Toshkent";

    const restaurantLat = selectedRestaurant?.lat || Number(process.env.RESTAURANT_LAT || 41.261532);
    const restaurantLng = selectedRestaurant?.lng || Number(process.env.RESTAURANT_LNG || 69.228442);

    const milleniumPhone = normalizeMilleniumPhone(order.customerPhone);
    if (!milleniumPhone || milleniumPhone.length < 9) {
      console.log("⚠️ Millenium order yuborilmadi: telefon raqam noto‘g‘ri yoki bo‘sh");
      return;
    }

    const payload = {
      phone: milleniumPhone,
      phone_to_dial: milleniumPhone,
      source_time: sourceTime,
      is_prior: false,
      check_duplicate: true,
      customer: order.customerName,
      passenger: order.customerName,
      comment: `Yalpiz delivery order #${order._id}. Taomlar: ${Number(order.totalPrice || 0).toLocaleString()} so'm. Taxi: ${Number(order.deliveryPrice || 0).toLocaleString()} so'm. TO'LOV BEZNAL (korporativ hisob) — mijozdan pul OLINMASIN, hammasi online to'langan.`,
      addresses: [
        {
          address: restaurantAddress,
          lat: restaurantLat,
          lon: restaurantLng,
        },
        {
          address: order.address || "Mijoz manzili",
          lat: order.location?.lat ? Number(order.location.lat) : undefined,
          lon: order.location?.lng ? Number(order.location.lng) : undefined,
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
};

// Buyurtma matni (status qatori bilan) — yuborishda ham, tahrirlashda ham ishlatiladi
const buildOrderTelegramText = (order) => {
  const itemsList = (order.items || []).map(i => `  • ${i.title} × ${i.quantity} = ${(Number(i.price) * Number(i.quantity)).toLocaleString()} so'm`).join("\n");
  const locText = order.location?.lat ? `\n🗺 <a href="https://yandex.com/maps/?pt=${order.location.lng},${order.location.lat}&z=16&l=map">Xaritada ko'rish</a>` : "";
  const orderTypeText = order.orderType === "pickup" ? "🛍 <b>Olib ketish</b>" : "🛵 <b>Dastavka</b>";
  const isCash = order.paymentType === "cash";
  const payLabel = isCash ? "💵 Naqd" : (order.paymentProvider === "payme" ? "Payme" : "Click");
  const taxiText = order.orderType === "delivery"
    ? `\n🚕 Taxi: ${Number(order.deliveryPrice || 0).toLocaleString()} so'm (beznal — to'lovga kiritilgan)${order.milleniumOrderId ? ` | Millenium #${order.milleniumOrderId}` : "\n⚠️ <b>Millenium chaqirilmadi — taxini QO'LDA chaqiring!</b>"}`
    : "";
  const statusLine = `\n\n📌 <b>Holat: ${STATUS_LABELS[order.status] || order.status}</b>${order.statusUpdatedBy ? ` — ${order.statusUpdatedBy}` : ""}`;
  // Naqd va online uchun sarlavha + to'lov qatori farqli
  const header = isCash
    ? `🛎 <b>YANGI BUYURTMA — 💵 NAQD (olib ketganda)</b>\n${orderTypeText}\n\n`
    : `🛎 <b>YANGI BUYURTMA — ✅ TO'LANDI (${payLabel})</b>\n${orderTypeText}\n\n`;
  const payLine = isCash
    ? `💵 <b>Naqd to'lov: ${Number(order.paymentAmount || order.totalPrice || 0).toLocaleString()} so'm — olib ketganda</b>\n`
    : `💳 <b>Jami to'landi: ${Number(order.paymentAmount || order.totalPrice || 0).toLocaleString()} so'm</b>\n`;
  return (
    header +
    `👤 <b>${order.customerName}</b>\n📞 ${order.customerPhone}\n` +
    (order.address ? `📍 ${order.address}\n` : "") +
    `${locText}\n\n🍽 <b>Taomlar:</b>\n${itemsList}\n\n` +
    `💰 Taomlar: ${Number(order.totalPrice || 0).toLocaleString()} so'm${taxiText}\n` +
    payLine +
    `🧾 Order: ${order._id}` +
    statusLine
  );
};

// Holatga mos inline tugmalar
const buildStatusKeyboard = (order) => {
  const id = String(order._id);
  const btn = (text, st) => ({ text, callback_data: `st:${id}:${st}` });
  if (order.status === "new") {
    return { inline_keyboard: [[btn("🍳 Tayyorlanmoqda", "preparing"), btn("❌ Bekor", "cancelled")]] };
  }
  if (order.status === "preparing") {
    const next = order.orderType === "delivery" ? btn("🚕 Yo'lda", "on_way") : btn("✅ Yetkazildi", "delivered");
    return { inline_keyboard: [[next, btn("❌ Bekor", "cancelled")]] };
  }
  if (order.status === "on_way") {
    return { inline_keyboard: [[btn("✅ Yetkazildi", "delivered"), btn("❌ Bekor", "cancelled")]] };
  }
  return null; // delivered / cancelled — tugmalar olib tashlanadi
};

// Yakunlangan buyurtmaga o'chirish tugmasi (faqat delivered/cancelled holatida)
const buildDeleteKeyboard = (order) => {
  return { inline_keyboard: [[{ text: "🗑 O'chirish", callback_data: `del:${order._id}` }]] };
};

// Xodimlar guruhidagi xabarni tahrirlash (status o'zgarganda)
const editStaffOrderMessage = async (order) => {
  if (!order.tgChatId || !order.tgMessageId) return;
  const payload = {
    chat_id: order.tgChatId,
    message_id: order.tgMessageId,
    text: buildOrderTelegramText(order),
    parse_mode: "HTML",
  };
  const kb = buildStatusKeyboard(order);
  if (kb) {
    payload.reply_markup = kb;
  } else if (["delivered", "cancelled"].includes(order.status)) {
    // Yakunlangan — endi o'chirish tugmasi
    payload.reply_markup = buildDeleteKeyboard(order);
  }
  await tgApi("editMessageText", payload);
};

// ════ XODIMLAR GURUHI: QO'SHIMCHA KOMANDALAR (admin-uslub) ════════════════════

// Bitta buyurtmaning qisqa qatori (ro'yxatlar uchun)
const orderShortLine = (order) => {
  const idTail = String(order._id).slice(-5);
  const type = order.orderType === "pickup" ? "🛍" : "🛵";
  const sum = Number(order.paymentAmount || order.totalPrice || 0).toLocaleString();
  return `${STATUS_LABELS[order.status] || order.status} ${type} <code>${idTail}</code> — ${order.customerName} | ${sum} so'm | 📞 ${order.customerPhone}`;
};

// Aktiv buyurtmalar ro'yxati (new/preparing/on_way), to'langanlar
const sendActiveOrdersList = async (chatId) => {
  const list = await Order.find({
    status: { $in: ["new", "preparing", "on_way"] },
    paymentStatus: "paid",
  }).sort({ createdAt: -1 }).limit(20);

  if (!list.length) {
    await tgApi("sendMessage", { chat_id: chatId, text: "📭 Aktiv buyurtma yo'q.", parse_mode: "HTML" });
    return;
  }
  const lines = list.map((o, i) => `${i + 1}. ${orderShortLine(o)}`).join("\n");
  await tgApi("sendMessage", {
    chat_id: chatId,
    text: `📋 <b>Aktiv buyurtmalar (${list.length})</b>\n\n${lines}\n\nBatafsil: <code>/find ID-oxiri</code> yoki <code>/find telefon</code>`,
    parse_mode: "HTML",
  });
};

// Bugungi statistika
const sendTodayStats = async (chatId) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const paid = await Order.find({ createdAt: { $gte: start }, paymentStatus: "paid" });
  const totalSum = paid.reduce((s, o) => s + Number(o.paymentAmount || o.totalPrice || 0), 0);
  const foodSum = paid.reduce((s, o) => s + Number(o.totalPrice || 0), 0);
  const taxiSum = paid.reduce((s, o) => s + Number(o.deliveryPrice || 0), 0);
  const byStatus = {};
  for (const o of paid) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  const delivery = paid.filter(o => o.orderType === "delivery").length;
  const pickup = paid.filter(o => o.orderType === "pickup").length;

  const statusLines = Object.keys(byStatus)
    .map(st => `   ${STATUS_LABELS[st] || st}: ${byStatus[st]}`)
    .join("\n") || "   —";

  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `📊 <b>Bugungi statistika</b>\n\n` +
      `🧾 To'langan buyurtmalar: <b>${paid.length}</b>\n` +
      `   🛵 Dastavka: ${delivery} | 🛍 Olib ketish: ${pickup}\n\n` +
      `💰 Taomlar: ${foodSum.toLocaleString()} so'm\n` +
      `🚕 Taxi: ${taxiSum.toLocaleString()} so'm\n` +
      `💳 <b>Jami tushum: ${totalSum.toLocaleString()} so'm</b>\n\n` +
      `📌 Holatlar:\n${statusLines}`,
  });
};

// ID-oxiri yoki telefon bo'yicha qidirish, topilganini batafsil yuborish
const sendOrderSearch = async (chatId, query) => {
  const q = String(query || "").trim();
  if (!q) {
    await tgApi("sendMessage", { chat_id: chatId, text: "Qidiruv: <code>/find ID-oxiri</code> yoki <code>/find +998...</code>", parse_mode: "HTML" });
    return;
  }
  let orders = [];
  const digits = q.replace(/[^0-9]/g, "");
  if (digits.length >= 7) {
    // telefon bo'yicha
    orders = await Order.find({ customerPhone: { $regex: digits + "$" } }).sort({ createdAt: -1 }).limit(5);
  } else {
    // ID-oxiri bo'yicha (oxirgi belgilar)
    orders = await Order.find({}).sort({ createdAt: -1 }).limit(200);
    orders = orders.filter(o => String(o._id).endsWith(q)).slice(0, 5);
  }
  if (!orders.length) {
    await tgApi("sendMessage", { chat_id: chatId, text: `🔍 "${q}" bo'yicha buyurtma topilmadi.`, parse_mode: "HTML" });
    return;
  }
  for (const order of orders) {
    const payload = { chat_id: chatId, text: buildOrderTelegramText(order), parse_mode: "HTML" };
    const kb = ["delivered", "cancelled"].includes(order.status)
      ? buildDeleteKeyboard(order)
      : buildStatusKeyboard(order);
    if (kb) payload.reply_markup = kb;
    await tgApi("sendMessage", payload);
  }
};

const STAFF_HELP =
  "🤖 <b>Xodimlar uchun komandalar</b>\n\n" +
  "/active — aktiv buyurtmalar ro'yxati\n" +
  "/find &lt;ID-oxiri yoki telefon&gt; — buyurtma qidirish\n" +
  "/stats — bugungi statistika\n" +
  "/id — guruh ID raqami\n\n" +
  "Buyurtma ostidagi tugmalar orqali holatni o'zgartirasiz.";

const sendPaidOrderTelegram = async (order) => {
  try {
    const text = buildOrderTelegramText(order);
    const staffChat = TG_STAFF || TG_CHAT;

    // 1) Xodimlar guruhiga — tugmalar bilan
    if (staffChat) {
      const payload = { chat_id: staffChat, text, parse_mode: "HTML" };
      const kb = buildStatusKeyboard(order);
      if (kb) payload.reply_markup = kb;
      const resp = await tgApi("sendMessage", payload);
      if (resp?.ok && resp.result?.message_id) {
        order.tgChatId = String(staffChat);
        order.tgMessageId = resp.result.message_id;
        await order.save();
      }
    }

    // 2) Eski chat/kanalga nusxa — tugmasiz (xodimlar guruhi bilan bir xil bo'lsa, takrorlanmaydi)
    for (const chatId of [TG_CHAT, TG_CHANNEL].filter(Boolean)) {
      if (String(chatId) === String(staffChat)) continue;
      await tgApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
    }
  } catch (e) {
    console.error("Paid-order telegram xato:", e.message);
  }
};

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
      await dispatchMilleniumOrder(order);
      await sendPaidOrderTelegram(order);

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
    await dispatchMilleniumOrder(order);
    await sendPaidOrderTelegram(order);

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

// ════ TELEGRAM WEBHOOK (xodimlar tugmalari) ════════════════════════════════════
app.post("/webhook/telegram", async (req, res) => {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
      return res.sendStatus(403);
    }

    const update = req.body || {};

    // Guruhda /id yozilsa — chat ID ni aytadi (sozlashni osonlashtiradi)
    const msgText = update.message?.text || "";
    if (msgText.trim().startsWith("/id")) {
      await tgApi("sendMessage", {
        chat_id: update.message.chat.id,
        text: `Chat ID: <code>${update.message.chat.id}</code>`,
        parse_mode: "HTML",
      });
      return res.sendStatus(200);
    }

    // Xodimlar komandalar (matnli)
    if (msgText.trim()) {
      const text = msgText.trim();
      const chatId = update.message.chat.id;

      if (text.startsWith("/start") || text.startsWith("/help")) {
        await tgApi("sendMessage", { chat_id: chatId, text: STAFF_HELP, parse_mode: "HTML" });
        return res.sendStatus(200);
      }
      if (text.startsWith("/active")) {
        await sendActiveOrdersList(chatId);
        return res.sendStatus(200);
      }
      if (text.startsWith("/stats")) {
        await sendTodayStats(chatId);
        return res.sendStatus(200);
      }
      if (text.startsWith("/find")) {
        const query = text.replace(/^\/find(@\w+)?\s*/i, "");
        await sendOrderSearch(chatId, query);
        return res.sendStatus(200);
      }
    }

    const cb = update.callback_query;

    // O'chirish callback'i (yakunlangan buyurtma)
    if (cb?.data && cb.data.startsWith("del:")) {
      const orderId = cb.data.split(":")[1];
      if (!/^[a-f0-9]{24}$/i.test(orderId || "")) {
        await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Noto'g'ri so'rov" });
        return res.sendStatus(200);
      }
      const order = await Order.findById(orderId);
      if (!order) {
        await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Buyurtma topilmadi" });
        return res.sendStatus(200);
      }
      if (!["delivered", "cancelled"].includes(order.status)) {
        await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Faqat yakunlangan buyurtmani o'chirish mumkin" });
        return res.sendStatus(200);
      }
      const byName = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") || cb.from?.username || "Xodim";
      await Order.findByIdAndDelete(orderId);
      if (order.tgChatId && order.tgMessageId) {
        await tgApi("editMessageText", {
          chat_id: order.tgChatId,
          message_id: order.tgMessageId,
          text: `🗑 <b>O'chirildi</b> — ${byName}\n${order.customerName} | 📞 ${order.customerPhone}`,
          parse_mode: "HTML",
        });
      }
      await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "O'chirildi 🗑" });
      return res.sendStatus(200);
    }

    if (cb?.data && cb.data.startsWith("st:")) {
      const parts = cb.data.split(":");
      const orderId = parts[1];
      const newStatus = parts[2];

      if (!ORDER_STATUSES.includes(newStatus) || !/^[a-f0-9]{24}$/i.test(orderId || "")) {
        await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Noto'g'ri so'rov" });
        return res.sendStatus(200);
      }

      const existing = await Order.findById(orderId).select("status");
      if (!existing) {
        await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Buyurtma topilmadi" });
        return res.sendStatus(200);
      }
      if (["delivered", "cancelled"].includes(existing.status)) {
        await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Buyurtma allaqachon yakunlangan" });
        return res.sendStatus(200);
      }

      const byName =
        [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") ||
        cb.from?.username || "Xodim";

      const order = await Order.findByIdAndUpdate(
        orderId,
        { status: newStatus, statusUpdatedBy: byName },
        { new: true }
      );

      await editStaffOrderMessage(order);
      await tgApi("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: STATUS_LABELS[newStatus] || "Yangilandi",
      });
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error("Telegram webhook xato:", e.message);
    return res.sendStatus(200);
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

// ════ TO'LANMAGAN BUYURTMALARNI AVTO-BEKOR QILISH ══════════════════════════════
// 30 daqiqa ichida to'lanmagan buyurtmalar bekor qilinadi (har 5 daqiqada tekshiriladi).
// paymeState=1 (aktiv Payme tranzaksiyasi) bo'lganlar tegilmaydi — ularni Payme o'zi yopadi.
const AUTO_CANCEL_MINUTES = 30;
const autoCancelUnpaidOrders = async () => {
  try {
    const cutoff = new Date(Date.now() - AUTO_CANCEL_MINUTES * 60 * 1000);
    const result = await Order.updateMany(
      {
        status: "new",
        paymentStatus: { $in: ["unpaid", "pending"] },
        paymeState: { $ne: 1 },
        createdAt: { $lt: cutoff },
      },
      { $set: { status: "cancelled", paymentStatus: "cancelled" } }
    );
    if (result.modifiedCount) {
      console.log(`⏱ ${result.modifiedCount} ta to'lanmagan buyurtma avto-bekor qilindi (>${AUTO_CANCEL_MINUTES} daqiqa)`);
    }
  } catch (e) {
    console.error("Avto-bekor xato:", e.message);
  }
};
setInterval(autoCancelUnpaidOrders, 5 * 60 * 1000);

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server http://localhost:${PORT}`);
  await createFirstAdmin();
  await seedFilials();
});
