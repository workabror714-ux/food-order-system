require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");
const connectDB = require("./db");
const Food = require("./models/Food");
const Order = require("./models/Order");
const AdminUser = require("./models/AdminUser");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "restoran_secret_key_2024";

// ─── TELEGRAM ────────────────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;

const sendTelegram = async (text) => {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("Telegram xato:", e.message);
  }
};

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");

// ─── DATABASE ─────────────────────────────────────────────────────────────────
connectDB();

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token yo'q!" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Token noto'g'ri yoki muddati o'tgan!" });
  }
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
      console.log("🚀 SuperAdmin yaratildi → username: superadmin | parol: Admin123!");
    }
  } catch (err) { console.error("Admin yaratishda xato:", err); }
};

// ─── MULTER ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    /jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("Faqat rasm!"));
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
    const food = await new Food({ title, price: Number(price), category, description, image: `/uploads/${req.file.filename}` }).save();
    res.status(201).json(food);
  } catch (e) { res.status(500).json({ message: "Xato", error: e.message }); }
});

app.put("/api/foods/:id", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { title, price, category, description } = req.body;
    const update = { title, price: Number(price), category, description };
    if (req.file) {
      const old = await Food.findById(req.params.id);
      if (old?.image) { const p = path.join(".", old.image); if (fs.existsSync(p)) fs.unlinkSync(p); }
      update.image = `/uploads/${req.file.filename}`;
    }
    const updated = await Food.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ message: "Topilmadi" });
    res.json(updated);
  } catch { res.status(500).json({ message: "Xato" }); }
});

app.delete("/api/foods/:id", authMiddleware, async (req, res) => {
  try {
    const food = await Food.findByIdAndDelete(req.params.id);
    if (!food) return res.status(404).json({ message: "Topilmadi" });
    if (food.image) { const p = path.join(".", food.image); if (fs.existsSync(p)) fs.unlinkSync(p); }
    res.json({ message: "O'chirildi" });
  } catch { res.status(500).json({ message: "Xato" }); }
});

// ════ ORDERS ══════════════════════════════════════════════════════════════════
app.post("/api/orders", async (req, res) => {
  try {
    const { customerName, customerPhone, items, totalPrice, address } = req.body;
    if (!customerName || !customerPhone || !items?.length)
      return res.status(400).json({ message: "Ism, telefon va taomlar shart!" });

    const order = await new Order({ customerName, customerPhone, items, totalPrice, address, status: "new" }).save();

    // ─── Telegram xabar ─────────────────────────────────────────────────────
    const itemsList = items.map((i) => `  • ${i.title} × ${i.quantity} = ${(i.price * i.quantity).toLocaleString()} so'm`).join("\n");
    const msg =
      `🛎 <b>YANGI BUYURTMA!</b>\n\n` +
      `👤 <b>Mijoz:</b> ${customerName}\n` +
      `📞 <b>Telefon:</b> ${customerPhone}\n` +
      (address ? `📍 <b>Manzil:</b> ${address}\n` : "") +
      `\n🍽 <b>Taomlar:</b>\n${itemsList}\n\n` +
      `💰 <b>Jami: ${totalPrice?.toLocaleString()} so'm</b>`;
    await sendTelegram(msg);

    res.status(201).json({ message: "Buyurtma qabul qilindi! ✅", order });
  } catch (e) { res.status(500).json({ message: "Xato", error: e.message }); }
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

    // Telegram status xabari
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