const router = require("express").Router();
const { rateLimit } = require("../middleware/rateLimit");
const { tgApi, TG_STAFF, TG_CHAT, TG_CHANNEL } = require("../integrations/telegram");

const esc = (s) =>
  String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");

// Joy bron qilish arizasi — avval buyurtmalar kanali, keyin xodimlar guruhi,
// oxirgi fallback sifatida bot egasining shaxsiy chati ishlatiladi.
router.post("/api/booking", rateLimit({ windowMs: 60000, max: 5 }), async (req, res) => {
  try {
    const { name, phone, date, time, guests, eventType, note } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Ism majburiy" });
    }
    const ph = cleanPhone(phone);
    if (!/^\+?\d{9,15}$/.test(ph)) {
      return res.status(400).json({ message: "Telefon raqami noto'g'ri" });
    }

    const lines = [
      "🎉 <b>YANGI BRON ARIZASI</b>",
      "",
      `👤 <b>Ism:</b> ${esc(name)}`,
      `📞 <b>Telefon:</b> ${esc(phone)}`,
      date ? `📅 <b>Sana:</b> ${esc(date)}` : null,
      time ? `🕐 <b>Vaqt:</b> ${esc(time)}` : null,
      guests ? `👥 <b>Mehmonlar:</b> ${esc(guests)}` : null,
      eventType ? `🎊 <b>Tadbir:</b> ${esc(eventType)}` : null,
      note ? `📝 <b>Izoh:</b> ${esc(note)}` : null,
      "",
      "🌐 <b>Manba:</b> yalpiz-restaurant.uz",
    ].filter(Boolean);

    // Buyurtmalar tushayotgan kanal birinchi o'rinda turadi.
    const bookingChat = TG_CHANNEL || TG_STAFF || TG_CHAT;

    if (!bookingChat) {
      console.error("[booking] Telegram chat sozlanmagan");
      return res.status(503).json({ message: "Bron xizmati vaqtincha mavjud emas" });
    }

    const telegramResponse = await tgApi("sendMessage", {
      chat_id: bookingChat,
      text: lines.join("\n"),
      parse_mode: "HTML",
    });

    if (!telegramResponse?.ok) {
      console.error("[booking] Telegram xatosi:", telegramResponse);
      return res.status(502).json({ message: "Bron arizasini yuborib bo'lmadi" });
    }

    return res.status(201).json({ message: "Arizangiz qabul qilindi. Tez orada bog'lanamiz." });
  } catch (e) {
    console.error("[booking]", e);
    return res.status(500).json({ message: "Server xatosi, keyinroq urinib ko'ring" });
  }
});

module.exports = router;
