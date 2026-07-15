require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("./db");
const AdminUser = require("./models/AdminUser");

// Middleware + xizmatlar
const { securityHeaders, sanitize } = require("./middleware/security");
const { globalRateLimit } = require("./middleware/rateLimit");
const { seedFilials } = require("./services/filials");
const { autoCancelUnpaidOrders } = require("./services/orderJobs");
const { redis } = require("./lib/redis");

const app = express();

// ── CORS: CORS_ORIGINS env bo'lsa faqat shu domenlar; bo'lmasa hammaga (dev) ──
// Trailing slash'ga chidamli: origin brauzerda slashsiz keladi, env'da slash bo'lsa ham mos keladi.
const stripSlash = (s) => s.replace(/\/+$/, "");
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map(s => stripSlash(s.trim())).filter(Boolean);
if (corsOrigins.length === 0) console.warn("⚠️  CORS_ORIGINS env yo'q — barcha domenlarga ochiq (faqat dev uchun).");
app.use(cors({
  origin: corsOrigins.length ? (origin, cb) => cb(null, !origin || corsOrigins.includes(stripSlash(origin))) : true,
  credentials: true,
}));

// ── Xavfsizlik + body parser + sanitatsiya ──
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: true, limit: "200kb" }));
app.use(sanitize);

if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
app.use("/uploads", express.static("uploads"));

// Health/readiness — load balancer / container uchun (rate-limitdan oldin)
app.get(["/health", "/healthz"], (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  const healthy = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    db: ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown",
    redis: !!redis,
    uptime: Math.round(process.uptime()),
    ts: new Date().toISOString(),
  });
});

// Reverse-proxy ortida (nginx) haqiqiy IP uchun + global flood himoyasi
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);
app.use(globalRateLimit);

connectDB();

// Birinchi ishga tushganda superadmin yaratish
const createFirstAdmin = async () => {
  try {
    if (!await AdminUser.findOne({ username: "superadmin" })) {
      await new AdminUser({ username: "superadmin", password: await bcrypt.hash("Admin123!", 10), role: "superadmin" }).save();
      console.log("SuperAdmin: superadmin / Admin123!");
    }
  } catch (e) { console.error(e); }
};

// ════ ROUTE'LAR (domenlar bo'yicha) ═══════════════════════════════════════════
app.use(require("./routes/images.routes"));
app.use(require("./routes/auth.routes"));
app.use(require("./routes/filials.routes"));
app.use(require("./routes/foods.routes"));
app.use(require("./routes/orders.routes"));
app.use(require("./routes/booking.routes"));
app.use(require("./routes/payments.routes"));
app.use(require("./routes/webhooks.routes"));
app.use(require("./routes/banners.routes"));
app.use(require("./routes/customers.routes"));
app.use(require("./routes/delever.routes"));

// ════ FON JARAYONLARI ════════════════════════════════════════════════════════
// Ko'p instance bo'lsa: lock orqali faqat BITTA instance sweepni bajaradi (dublikatsiz).
// Alohida worker ishlatilsa: API'da RUN_JOBS=false qo'ying, `node worker.js` ishga tushiring.
const { tryLock } = require("./lib/redis");
if (process.env.RUN_JOBS !== "false") {
  const autoCancelTimer = setInterval(async () => {
    if (await tryLock("lock:autocancel", 290)) await autoCancelUnpaidOrders();
  }, 5 * 60 * 1000);
  autoCancelTimer.unref?.();

  const { startDeleverJobs } = require("./services/deleverJobs");
  startDeleverJobs();
}

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
  console.log(`Server http://localhost:${PORT}`);
  await createFirstAdmin();
  await seedFilials();
});

// ─── GRACEFUL SHUTDOWN (container/k8s SIGTERM uchun) ──────────────────────────
let shuttingDown = false;
const shutdown = (sig) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${sig} qabul qilindi — yumshoq to'xtatish...`);
  server.close(() => {
    Promise.resolve()
      .then(() => mongoose.connection.close(false))
      .then(() => redis && redis.quit().catch(() => {}))
      .finally(() => { console.log("✅ Toza yopildi"); process.exit(0); });
  });
  // 10s ichida yopilmasa — majburiy chiqish
  setTimeout(() => { console.error("⏱ Majburiy chiqish"); process.exit(1); }, 10000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
