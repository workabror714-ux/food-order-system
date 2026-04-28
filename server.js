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

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "restoran_secret_key_2024";

// ─── RASM YUKLASH ─────────────────────────────────────────────────────────────
// Ustuvorlik: 1) Cloudinary  2) ImgBB  3) Local
const uploadImage = async (fileBuffer, fileName) => {
  // 1. Cloudinary
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
    } catch (e) { console.error("Cloudinary xato:", e.message); }
  }

  // 2. ImgBB
  if (process.env.IMGBB_API_KEY) {
    try {
      const base64 = fileBuffer.toString("base64");
      const params = new URLSearchParams();
      params.append("key", process.env.IMGBB_API_KEY);
      params.append("image", base64);
      params.append("name", fileName);
      const res = await fetch("https://api.imgbb.com/1/upload", {
        method: "POST", body: params,
      });
      const data = await res.json();
      if (data.success) return data.data.url;
      console.error("ImgBB xato:", JSON.stringify(data));
    } catch (e) { console.error("ImgBB xato:", e.message); }
  }

  // 3. Local fallback
  if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
  const filename = Date.now() + path.extname(fileName);
  fs.writeFileSync(`./uploads/${filename}`, fileBuffer);
  return `/uploads/${filename}`;
};

// ─── TELEGRAM ─────────────────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;
const TG_CHANNEL = process.env.TELEGRAM_CHANNEL_ID;

const sendTelegram = async (text) => {
  if (!TG_TOKEN) return;
  const targets = [TG_CHAT, TG_CHANNEL].filter(Boolean);
  for (const chatId of targets) {
    try {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      });
    } catch (e) { console.error("Telegram xato:", e.message); }
  }
};

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");

connectDB();

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token yo'q!" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ message: "Token noto'g'ri yoki muddati o'tgan!" }); }
};
const superAdminMiddleware = (req, res, next) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ message: "Ruxsat yo'q!" });
  next();
};

// ─── FIRST ADMIN ─────────────────────────────────────────────────────────────
const createFirstAdmin = async () => {
  try {
    const exists = await AdminUser.findOne({ username: "superadmin" });
    if (!exists) {
      const hashed = await bcrypt.hash("Admin123!", 10);
      await new AdminUser({ username: "superadmin", password: hashed, role: "superadmin" }).save();
      console.log("🚀 SuperAdmin yaratildi → superadmin / Admin123!");
    }
  } catch (err) { console.error("Admin yaratishda xato:", err); }
};

// ─── MULTER ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    /jpeg|jpg|png|webp|gif/.test(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("Faqat rasm fayllari!"));
  },
});

// ════ AUTH ════════════════════════════════════════════════════════════════════
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username va parol shart!" });
    const user = await AdminUser.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: "Username yoki parol xato!" });
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token, user: { username: user.username, role: user.role } });
  } catch { res.status(500).json({ message: "Server xatosi" }); }
});

app.post("/auth/create-admin", authMiddleware, superAdminMiddleware, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (await AdminUser.findOne({ username })) return res.status(400).json({ message: "Bu username band!" });
    const hashed = await bcrypt.hash(password, 10);
    const a = await new AdminUser({ username, password: hashed, role }).save();
    res.status(201).json({ message: "Admin yaratildi", admin: { username: a.username, role: a.role } });
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.get("/auth/admins", authMiddleware, superAdminMiddleware, async (req, res) => {
  try { res.json(await AdminUser.find().select("-password")); }
  catch { res.status(500).json({ message: "Xato" }); }
});

app.delete("/auth/admins/:id", authMiddleware, superAdminMiddleware, async (req, res) => {
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

app.post("/api/foods", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Rasm shart!" });
    const { title, price, category, description } = req.body;
    const imageUrl = await uploadImage(req.file.buffer, req.file.originalname);
    const food = await new Food({ title, price: Number(price), category, description, image: imageUrl }).save();
    res.status(201).json(food);
  } catch (e) {
    console.error("Food POST xato:", e);
    res.status(500).json({ message: "Xato: " + e.message });
  }
});

app.put("/api/foods/:id", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { title, price, category, description } = req.body;
    const update = { title, price: Number(price), category, description };
    if (req.file) {
      update.image = await uploadImage(req.file.buffer, req.file.originalname);
    }
    const updated = await Food.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ message: "Topilmadi" });
    res.json(updated);
  } catch (e) {
    console.error("Food PUT xato:", e);
    res.status(500).json({ message: "Xato: " + e.message });
  }
});

app.delete("/api/foods/:id", authMiddleware, async (req, res) => {
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

    const order = await new Order({
      customerName, customerPhone, items, totalPrice, address, location, status: "new"
    }).save();

    const itemsList = items.map(i =>
      `  • ${i.title} × ${i.quantity} = ${(i.price * i.quantity).toLocaleString()} so'm`
    ).join("\n");
    const locationText = location
      ? `\n🗺 <b>Lokatsiya:</b> <a href="https://yandex.com/maps/?pt=${location.lng},${location.lat}&z=16&l=map">Xaritada ko'rish</a>`
      : "";
    const msg =
      `🛎 <b>YANGI BUYURTMA!</b>\n\n` +
      `👤 <b>Mijoz:</b> ${customerName}\n` +
      `📞 <b>Telefon:</b> ${customerPhone}\n` +
      (address ? `📍 <b>Manzil:</b> ${address}\n` : "") +
      locationText + "\n" +
      `\n🍽 <b>Taomlar:</b>\n${itemsList}\n\n` +
      `💰 <b>Jami: ${totalPrice?.toLocaleString()} so'm</b>`;
    await sendTelegram(msg);

    res.status(201).json({ message: "Buyurtma qabul qilindi! ✅", order });
  } catch (e) {
    console.error("Order POST xato:", e);
    res.status(500).json({ message: "Xato", error: e.message });
  }
});

app.get("/api/orders", authMiddleware, async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    res.json(await Order.find(filter).sort({ createdAt: -1 }));
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.put("/api/orders/:id/status", authMiddleware, async (req, res) => {
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
        `${emoji[status]} <b>Buyurtma holati o'zgardi</b>\n\n` +
        `👤 ${order.customerName} | 📞 ${order.customerPhone}\n` +
        `📦 Holat: <b>${label[status]}</b>`
      );
    }
    res.json(order);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.delete("/api/orders/:id", authMiddleware, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "O'chirildi" });
  } catch { res.status(500).json({ message: "Xato" }); }
});

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server http://localhost:${PORT} da ishlayapti`);
  await createFirstAdmin();
});