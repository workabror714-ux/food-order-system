require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const connectDB = require("./db");
const Food = require("./models/Food");
const Order = require("./models/Order");
const AdminUser = require("./models/AdminUser");
const Banner = require("./models/Banner");
const Image = require("./models/Image");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "restoran_secret_key_2024";

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
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
    const { title_uz, title_ru, title_en, price, category_uz, category_ru, category_en, desc_uz, desc_ru, desc_en, imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ message: "Rasm shart! Avval yuklang." });
    if (!title_uz) return res.status(400).json({ message: "O'zbek tili nomi shart!" });

    const food = await new Food({
      title: { uz: title_uz, ru: title_ru || title_uz, en: title_en || title_uz },
      price: parseFloat(String(price).replace(/[^0-9.]/g,'')) || 0,
      category: { uz: category_uz, ru: category_ru || category_uz, en: category_en || category_uz },
      description: { uz: desc_uz || "", ru: desc_ru || "", en: desc_en || "" },
      image: imageUrl,
    }).save();
    res.status(201).json(food);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

app.put("/api/foods/:id", auth, async (req, res) => {
  try {
    const { title_uz, title_ru, title_en, price, category_uz, category_ru, category_en, desc_uz, desc_ru, desc_en, imageUrl } = req.body;
    const update = {
      price: parseFloat(String(price).replace(/[^0-9.]/g,'')) || 0,
      title: { uz: title_uz, ru: title_ru || title_uz, en: title_en || title_uz },
      category: { uz: category_uz, ru: category_ru || category_uz, en: category_en || category_uz },
      description: { uz: desc_uz || "", ru: desc_ru || "", en: desc_en || "" },
    };
    if (imageUrl) update.image = imageUrl;
    const updated = await Food.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ message: "Topilmadi" });
    res.json(updated);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

app.delete("/api/foods/:id", auth, async (req, res) => {
  try {
    await Food.findByIdAndDelete(req.params.id);
    res.json({ message: "O'chirildi" });
  } catch { res.status(500).json({ message: "Xato" }); }
});

// ════ ORDERS ══════════════════════════════════════════════════════════════════
app.post("/api/orders", async (req, res) => {
  try {
    const { customerName, customerPhone, items, totalPrice, address, location, orderType, tableNumber, paymentType } = req.body;
    if (!customerName || !customerPhone || !items?.length)
      return res.status(400).json({ message: "Ism, telefon va taomlar shart!" });
    const order = await new Order({ customerName, customerPhone, items, totalPrice, address, location, orderType: orderType || "delivery", tableNumber: tableNumber || "", paymentType: paymentType || "cash", status: "new" }).save();

    // Millenium Taxi ga yuborish (faqat delivery bo'lsa)
    if ((orderType === "delivery" || !orderType) && location && process.env.MILLENIUM_API_URL && process.env.MILLENIUM_TOKEN) {
      try {
        const milRes = await fetch(`${process.env.MILLENIUM_API_URL}`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": process.env.MILLENIUM_TOKEN
          },
          body: JSON.stringify({
            client_name: customerName,
            client_phone: customerPhone,
            address: address || "",
            total_sum: totalPrice,
            coords: location ? { lat: location.lat, lon: location.lng } : undefined,
            order_id: order._id.toString(),
          })
        });
        const milData = await milRes.json();
        if (milData && (milData.order_id || milData.id)) {
          order.milleniumOrderId = String(milData.order_id || milData.id);
          await order.save();
          console.log("✅ Millenium order yaratildi:", order.milleniumOrderId);
        }
      } catch(milErr) {
        console.error("⚠️ Millenium API xato:", milErr.message);
        // Xato bo'lsa ham davom etamiz
      }
    }
    const itemsList = items.map(i => `  • ${i.title} × ${i.quantity} = ${(i.price * i.quantity).toLocaleString()} so'm`).join("\n");
    const locText = location ? `\n🗺 <a href="https://yandex.com/maps/?pt=${location.lng},${location.lat}&z=16&l=map">Xaritada ko'rish</a>` : "";
    await sendTelegram(`🛎 <b>YANGI BUYURTMA!</b>\n\n👤 <b>${customerName}</b>\n📞 ${customerPhone}\n${address ? `📍 ${address}\n` : ""}${locText}\n\n🍽 <b>Taomlar:</b>\n${itemsList}\n\n💰 <b>Jami: ${totalPrice?.toLocaleString()} so'm</b>`);
    res.status(201).json({ message: "Buyurtma qabul qilindi! ✅", order });
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

// ════ MILLENIUM WEBHOOK ═══════════════════════════════════════════════════════

// GET - test uchun (browser da ochilganda)
app.get("/webhook/millenium", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Millenium webhook ishlayapti ✅",
    method: "Bu endpoint POST so'rovlarni qabul qiladi"
  });
});

// POST - Millenium dan kelgan status yangilanishi
app.post("/webhook/millenium", async (req, res) => {
  try {
    console.log("📦 Millenium webhook:", JSON.stringify(req.body, null, 2));
    
    const { 
      order_id,       // Millenium order ID
      state_id,       // Status raqami
      state_kind,     // Status nomi: accepted, on_place, in_car, aborted, finished
      driver_name,    // Haydovchi ismi
      driver_phone,   // Haydovchi telefoni
      car_model,      // Mashina modeli
      car_color,      // Mashina rangi
      car_gosnomer,   // Davlat raqami
      crew_coords,    // { lat, lon } - haydovchi koordinatalari
      total_sum,      // To'lov summasi
      client_name,    // Mijoz ismi
    } = req.body;

    // State_kind ni bizning statusga o'girish
    const statusMap = {
      "accepted":  "preparing",   // Haydovchi qabul qildi
      "on_place":  "preparing",   // Haydovchi manzilda
      "in_car":    "preparing",   // Mijoz mashinada
      "finished":  "delivered",   // Yetkazildi
      "aborted":   "cancelled",   // Bekor qilindi
    };

    const newStatus = statusMap[state_kind];

    // Millenium order_id bilan bizning orderni topish
    let order = null;
    if (order_id) {
      order = await Order.findOne({ milleniumOrderId: String(order_id) });
    }

    if (order && newStatus) {
      // Statusni yangilash
      order.status = newStatus;
      
      // Haydovchi ma'lumotlarini saqlash
      if (driver_name) order.driverName = driver_name;
      if (driver_phone) order.driverPhone = driver_phone;
      if (car_model) order.carModel = `${car_model} ${car_color || ""} ${car_gosnomer || ""}`.trim();
      if (crew_coords) order.driverLocation = { lat: crew_coords.lat, lng: crew_coords.lon };
      
      await order.save();
      console.log(`✅ Order ${order._id} status: ${newStatus}`);

      // Telegram ga xabar yuborish
      const stateLabels = {
        "accepted": "🚗 Haydovchi qabul qildi",
        "on_place": "📍 Haydovchi manzilda",
        "in_car":   "🚙 Yetkazilmoqda",
        "finished": "✅ Yetkazib berildi",
        "aborted":  "❌ Bekor qilindi",
      };
      if (stateLabels[state_kind]) {
        await sendTelegram(
          `${stateLabels[state_kind]}

` +
          `👤 ${order.customerName}
` +
          `📞 ${order.customerPhone}
` +
          (driver_name ? `🚗 Haydovchi: ${driver_name} (${driver_phone})
` : "") +
          (car_model ? `🚙 Mashina: ${car_model} ${car_color || ""}
` : "") +
          `💰 Jami: ${order.totalPrice?.toLocaleString()} so'm`
        );
      }
    } else {
      console.log(`⚠️ Order topilmadi: millenium_id=${order_id}, state=${state_kind}`);
    }

    // Milleniumga OK javob qaytarish (shart!)
    res.json({ success: true, received: true });

  } catch(e) {
    console.error("Webhook xato:", e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server http://localhost:${PORT}`);
  await createFirstAdmin();
});