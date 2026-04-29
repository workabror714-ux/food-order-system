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

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "restoran_secret_key_2024";

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────────
const uploadImage = async (fileBuffer, fileName) => {
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const base64 = fileBuffer.toString("base64");
      const ext = path.extname(fileName).replace(".", "") || "jpg";
      const dataUri = `data:image/${ext};base64,${base64}`;
      const formData = new URLSearchParams();
      formData.append("file", dataUri);
      formData.append("upload_preset", process.env.CLOUDINARY_UPLOAD_PRESET || "ml_default");
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (data.secure_url) return data.secure_url;
    } catch (e) { console.error("Cloudinary error:", e.message); }
  }
  if (process.env.IMGBB_API_KEY) {
    try {
      const base64 = fileBuffer.toString("base64");
      const params = new URLSearchParams();
      params.append("key", process.env.IMGBB_API_KEY);
      params.append("image", base64);
      params.append("name", fileName);
      const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: params });
      const data = await res.json();
      if (data.success) return data.data.url;
    } catch (e) { console.error("ImgBB error:", e.message); }
  }
  if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
  const filename = Date.now() + path.extname(fileName);
  fs.writeFileSync(`./uploads/${filename}`, fileBuffer);
  return `/uploads/${filename}`;
};

// ─── TELEGRAM ─────────────────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const TG_CHANNEL = process.env.TELEGRAM_CHANNEL_ID;

const sendTelegram = async (text) => {
  if (!TG_TOKEN) return;
  for (const chatId of [TG_CHAT, TG_CHANNEL].filter(Boolean)) {
    try {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      });
    } catch (e) { console.error("Telegram error:", e.message); }
  }
};

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
connectDB();

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
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

// ─── FIRST ADMIN ─────────────────────────────────────────────────────────────
const createFirstAdmin = async () => {
  try {
    if (!await AdminUser.findOne({ username: "superadmin" })) {
      await new AdminUser({
        username: "superadmin",
        password: await bcrypt.hash("Admin123!", 10),
        role: "superadmin"
      }).save();
      console.log("SuperAdmin created: superadmin / Admin123!");
    }
  } catch (e) { console.error(e); }
};

// ─── MULTER ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    /jpeg|jpg|png|webp|gif|mp4|webm/.test(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("Faqat rasm yoki video!"));
  },
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
  try { res.json(await AdminUser.find().select("-password")); }
  catch { res.status(500).json({ message: "Xato" }); }
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
app.get("/api/foods", async (req, res) => {
  try {
    const filter = req.query.category ? { category: req.query.category } : {};
    res.json(await Food.find(filter).sort({ createdAt: -1 }));
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.get("/api/foods/:id", async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);
    if (!food) return res.status(404).json({ message: "Topilmadi" });
    res.json(food);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.post("/api/foods", auth, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Rasm shart!" });
    const { title, price, category, description } = req.body;
    const imageUrl = await uploadImage(req.file.buffer, req.file.originalname);
    const food = await new Food({ title, price: Number(price), category, description, image: imageUrl }).save();
    res.status(201).json(food);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

app.put("/api/foods/:id", auth, upload.single("image"), async (req, res) => {
  try {
    const { title, price, category, description } = req.body;
    const update = { title, price: Number(price), category, description };
    if (req.file) update.image = await uploadImage(req.file.buffer, req.file.originalname);
    const updated = await Food.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ message: "Topilmadi" });
    res.json(updated);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

app.delete("/api/foods/:id", auth, async (req, res) => {
  try {
    const food = await Food.findByIdAndDelete(req.params.id);
    if (!food) return res.status(404).json({ message: "Topilmadi" });
    res.json({ message: "O'chirildi" });
  } catch { res.status(500).json({ message: "Xato" }); }
});

// ════ ORDERS ══════════════════════════════════════════════════════════════════
app.post("/api/orders", async (req, res) => {
  try {
    const { customerName, customerPhone, items, totalPrice, address, location } = req.body;
    if (!customerName || !customerPhone || !items?.length)
      return res.status(400).json({ message: "Ism, telefon va taomlar shart!" });

    const order = await new Order({ customerName, customerPhone, items, totalPrice, address, location, status: "new" }).save();

    const itemsList = items.map(i => `  • ${i.title} × ${i.quantity} = ${(i.price * i.quantity).toLocaleString()} so'm`).join("\n");
    const locationText = location
      ? `\n🗺 <b>Lokatsiya:</b> <a href="https://yandex.com/maps/?pt=${location.lng},${location.lat}&z=16&l=map">Xaritada ko'rish</a>`
      : "";
    await sendTelegram(
      `🛎 <b>YANGI BUYURTMA!</b>\n\n👤 <b>${customerName}</b>\n📞 ${customerPhone}\n` +
      (address ? `📍 ${address}\n` : "") + locationText +
      `\n\n🍽 <b>Taomlar:</b>\n${itemsList}\n\n💰 <b>Jami: ${totalPrice?.toLocaleString()} so'm</b>`
    );
    res.status(201).json({ message: "Buyurtma qabul qilindi! ✅", order });
  } catch (e) { res.status(500).json({ message: "Xato", error: e.message }); }
});

app.get("/api/orders", auth, async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    res.json(await Order.find(filter).sort({ createdAt: -1 }));
  } catch { res.status(500).json({ message: "Xato" }); }
});

// Mijoz o'z buyurtmalarini telefon raqami bilan oladi — AUTH YO'Q
app.get("/api/orders/my/:phone", async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    const orders = await Order.find({ customerPhone: phone }).sort({ createdAt: -1 }).limit(20);
    res.json(orders);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.put("/api/orders/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["new", "preparing", "delivered", "cancelled"].includes(status))
      return res.status(400).json({ message: "Noto'g'ri status!" });
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: "Topilmadi" });
    const emoji = { preparing: "🍳", delivered: "✅", cancelled: "❌" };
    const label = { preparing: "Tayyorlanmoqda", delivered: "Yetkazildi", cancelled: "Bekor qilindi" };
    if (emoji[status]) {
      await sendTelegram(
        `${emoji[status]} <b>Holat o'zgardi</b>\n👤 ${order.customerName} | 📞 ${order.customerPhone}\n📦 <b>${label[status]}</b>`
      );
    }
    res.json(order);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.delete("/api/orders/:id", auth, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "O'chirildi" });
  } catch { res.status(500).json({ message: "Xato" }); }
});

// ════ BANNER — MongoDB da saqlanadi ══════════════════════════════════════════
app.get("/api/banner", async (req, res) => {
  try {
    let banner = await Banner.findOne();
    if (!banner) banner = await new Banner({}).save();
    res.json(banner);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.put("/api/banner", auth, upload.single("media"), async (req, res) => {
  try {
    const { title, subtitle, description, bgColor, events, mediaType } = req.body;
    let banner = await Banner.findOne();
    if (!banner) banner = new Banner({});

    if (title !== undefined) banner.title = title;
    if (subtitle !== undefined) banner.subtitle = subtitle;
    if (description !== undefined) banner.description = description;
    if (bgColor !== undefined) banner.bgColor = bgColor;
    if (mediaType !== undefined) banner.mediaType = mediaType;
    if (events !== undefined) banner.events = JSON.parse(events);

    if (mediaType === "none") {
      banner.mediaUrl = "";
    } else if (req.file) {
      banner.mediaUrl = await uploadImage(req.file.buffer, req.file.originalname);
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