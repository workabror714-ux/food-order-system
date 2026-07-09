const router = require("express").Router();
const { rateLimit } = require("../middleware/rateLimit");
const { tgApi, TG_STAFF, TG_CHAT } = require("../integrations/telegram");

const esc = (s) =>
  String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const cleanPhone = (p) => String(p || "").replace(/[^\d+]/g, "");

// Joy bron qilish arizasi — xodimlar guruhiga tushadi, mas'ul mijoz bilan bog'lanadi
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
    ].filter(Boolean);

    const staffChat = TG_STAFF || TG_CHAT;
    if (staffChat) {
      await tgApi("sendMessage", { chat_id: staffChat, text: lines.join("\n"), parse_mode: "HTML" });
    } else {
      console.warn("[booking] staff chat sozlanmagan (TELEGRAM_STAFF_CHAT_ID)");
    }

    res.status(201).json({ message: "Arizangiz qabul qilindi. Tez orada bog'lanamiz." });
  } catch (e) {
    console.error("[booking]", e);
    res.status(500).json({ message: "Server xatosi, keyinroq urinib ko'ring" });
  }
});

module.exports = router;
