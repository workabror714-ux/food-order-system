const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

const connectDB = require("./db");
const Food = require("./models/Food");
const AdminUser = require("./models/AdminUser");
const Order = require("./models/Order");

const app = express();
const JWT_SECRET = "super_secret_key_12345";

const TELEGRAM_TOKEN = "8688570283:AAHbt4iK_OerNsjW7oXyvdjNHzLJPw_HESI";
const CHAT_ID = "5954123597";

connectDB();

app.use(cors());
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "images")));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "images"));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const sendTelegramMessage = async (text) => {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
      }),
    });
  } catch (error) {
    console.log("Telegram error:", error);
  }
};

const createDefaultSuperadmin = async () => {
  try {
    const existing = await AdminUser.findOne({ username: "superadmin" });

    if (!existing) {
      const hashedPassword = await bcrypt.hash("12345678", 10);

      await AdminUser.create({
        username: "superadmin",
        password: hashedPassword,
        role: "superadmin",
      });

      console.log("Default superadmin yaratildi");
      console.log("login: superadmin");
      console.log("password: 12345678");
    }
  } catch (error) {
    console.log("SUPERADMIN CREATE ERROR:", error);
  }
};

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token yo‘q" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await AdminUser.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "Foydalanuvchi topilmadi" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Noto‘g‘ri token" });
  }
};

const superadminMiddleware = (req, res, next) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Faqat superadmin mumkin" });
  }

  next();
};

app.get("/", (req, res) => {
  res.send("Food Order Server ishlayapti");
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await AdminUser.findOne({ username });

    if (!user) {
      return res.status(400).json({ message: "Login yoki parol noto‘g‘ri" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Login yoki parol noto‘g‘ri" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/auth/me", authMiddleware, async (req, res) => {
  res.json(req.user);
});

app.post("/auth/create-admin", authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username va password kerak" });
    }

    const existing = await AdminUser.findOne({ username });

    if (existing) {
      return res.status(400).json({ message: "Bunday username bor" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await AdminUser.create({
      username,
      password: hashedPassword,
      role: role === "superadmin" ? "superadmin" : "admin",
    });

    res.status(201).json({
      id: newAdmin._id,
      username: newAdmin.username,
      role: newAdmin.role,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/auth/admins", authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const admins = await AdminUser.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/auth/admins/:id", authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi" });
    }

    if (admin.username === "superadmin") {
      return res.status(400).json({ message: "Default superadminni o‘chirib bo‘lmaydi" });
    }

    await AdminUser.findByIdAndDelete(req.params.id);
    res.json({ message: "Admin o‘chirildi" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/foods", async (req, res) => {
  try {
    const foods = await Food.find().sort({ createdAt: -1 });
    res.json(foods);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/foods", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    if (
      !req.body.title ||
      !req.body.price ||
      !req.body.category ||
      !req.body.description ||
      !req.file
    ) {
      return res.status(400).json({ message: "Ma'lumot to‘liq emas" });
    }

    const newFood = new Food({
      title: req.body.title,
      price: Number(req.body.price),
      category: req.body.category,
      description: req.body.description,
      image: req.file.filename,
    });

    await newFood.save();
    res.status(201).json(newFood);
  } catch (error) {
    console.log("POST ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

app.put("/foods/:id", authMiddleware, async (req, res) => {
  try {
    const updatedFood = await Food.findByIdAndUpdate(
      req.params.id,
      {
        title: req.body.title,
        price: Number(req.body.price),
        category: req.body.category,
        description: req.body.description,
      },
      { new: true }
    );

    if (!updatedFood) {
      return res.status(404).json({ message: "Taom topilmadi" });
    }

    res.json(updatedFood);
  } catch (error) {
    console.log("PUT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

app.delete("/foods/:id", authMiddleware, async (req, res) => {
  try {
    const deletedFood = await Food.findByIdAndDelete(req.params.id);

    if (!deletedFood) {
      return res.status(404).json({ message: "Taom topilmadi" });
    }

    res.json({ message: "Taom o‘chirildi" });
  } catch (error) {
    console.log("DELETE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

app.post("/orders", async (req, res) => {
  try {
    const { customerName, customerPhone, tableNumber, paymentMethod, items } = req.body;

    if (!customerName || !customerPhone || !tableNumber || !items || items.length === 0) {
      return res.status(400).json({ message: "Ma'lumot to‘liq emas" });
    }

    const totalPrice = items.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    const newOrder = new Order({
      customerName,
      customerPhone,
      tableNumber,
      paymentMethod,
      items,
      totalPrice,
      status: "new",
    });

    await newOrder.save();

    let message = `🆕 Yangi buyurtma\n\n`;
    message += `👤 Ism: ${customerName}\n`;
    message += `📞 Tel: ${customerPhone}\n`;
    message += `🪑 Stol: ${tableNumber}\n`;
    message += `💳 To‘lov: ${paymentMethod === "card" ? "Karta" : "Naqd"}\n\n`;

    items.forEach((item) => {
      message += `🍽 ${item.title} x ${item.quantity}\n`;
    });

    message += `\n💰 Jami: ${totalPrice} so‘m`;

    await sendTelegramMessage(message);

    res.status(201).json(newOrder);
  } catch (error) {
    console.log("ORDER CREATE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

app.get("/orders", authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.log("ORDER LIST ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

app.put("/orders/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }

    res.json(updatedOrder);
  } catch (error) {
    console.log("ORDER STATUS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

app.delete("/orders/:id", authMiddleware, async (req, res) => {
  try {
    const deletedOrder = await Order.findByIdAndDelete(req.params.id);

    if (!deletedOrder) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }

    res.json({ message: "Buyurtma o‘chirildi" });
  } catch (error) {
    console.log("ORDER DELETE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
});

app.listen(5000, async () => {
  console.log("Server 5000 portda ishlayapti");
  await createDefaultSuperadmin();
});