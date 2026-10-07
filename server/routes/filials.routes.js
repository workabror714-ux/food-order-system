const router = require("express").Router();
const { auth } = require("../middleware/auth");
const Filial = require("../models/Filial");
const { makeFilialSlug, reloadFilialsCache } = require("../services/filials");
const { isValidTime, isFilialOpenNow } = require("../lib/workingHours");

router.get("/api/filials", async (req, res) => {
  try {
    const list = await Filial.find({}).sort({ order: 1, createdAt: 1 });
    res.json(list.map(f => ({
      id: f.slug,
      name: f.name,
      address: f.address || "",
      lat: f.lat,
      lng: f.lng,
      isActive: f.isActive !== false,
      useSchedule: !!f.useSchedule,
      openTime: f.openTime || "",
      closeTime: f.closeTime || "",
      isOpenNow: isFilialOpenNow(f),
    })));
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// Admin uchun — barcha filiallar (to'liq, _id bilan)
router.get("/api/filials/all", auth, async (req, res) => {
  try {
    const list = await Filial.find({}).sort({ order: 1, createdAt: 1 });
    res.json(list.map(f => ({ ...f.toObject(), isOpenNow: isFilialOpenNow(f) })));
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// Yangi filial qo'shish
router.post("/api/filials", auth, async (req, res) => {
  try {
    const { name, address, lat, lng, isActive, order, useSchedule, openTime, closeTime } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Filial nomi shart" });
    }
    const scheduleOn = useSchedule === true || useSchedule === "true";
    if (scheduleOn && (!isValidTime(openTime) || !isValidTime(closeTime))) {
      return res.status(400).json({ message: "Ish vaqti jadvali uchun ochilish va yopilish vaqtini to'g'ri kiriting (soat:daqiqa, masalan 09:00)" });
    }
    const filial = await new Filial({
      slug: makeFilialSlug(name),
      name: String(name).trim(),
      address: address || "",
      lat: lat === "" || lat === undefined ? null : Number(lat),
      lng: lng === "" || lng === undefined ? null : Number(lng),
      isActive: isActive !== false && isActive !== "false",
      order: Number(order) || 0,
      useSchedule: scheduleOn,
      openTime: openTime || "",
      closeTime: closeTime || "",
    }).save();
    await reloadFilialsCache();
    res.status(201).json(filial);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// Filialni tahrirlash (slug o'zgarmaydi — eski buyurtmalar saqlanadi)
router.put("/api/filials/:id", auth, async (req, res) => {
  try {
    const filial = await Filial.findById(req.params.id);
    if (!filial) return res.status(404).json({ message: "Topilmadi" });

    const { name, address, lat, lng, isActive, order, useSchedule, openTime, closeTime } = req.body;
    if (name !== undefined) filial.name = String(name).trim();
    if (address !== undefined) filial.address = address;
    if (lat !== undefined) filial.lat = lat === "" ? null : Number(lat);
    if (lng !== undefined) filial.lng = lng === "" ? null : Number(lng);
    if (isActive !== undefined) filial.isActive = isActive !== false && isActive !== "false";
    if (order !== undefined) filial.order = Number(order) || 0;
    if (useSchedule !== undefined) filial.useSchedule = useSchedule === true || useSchedule === "true";
    if (openTime !== undefined) filial.openTime = openTime || "";
    if (closeTime !== undefined) filial.closeTime = closeTime || "";

    if (filial.useSchedule && (!isValidTime(filial.openTime) || !isValidTime(filial.closeTime))) {
      return res.status(400).json({ message: "Ish vaqti jadvali uchun ochilish va yopilish vaqtini to'g'ri kiriting (soat:daqiqa, masalan 09:00)" });
    }

    await filial.save();
    await reloadFilialsCache();
    res.json(filial);
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

// Yoqish / o'chirish (vaqtincha yopish)
router.patch("/api/filials/:id/toggle", auth, async (req, res) => {
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
router.delete("/api/filials/:id", auth, async (req, res) => {
  try {
    const filial = await Filial.findByIdAndDelete(req.params.id);
    if (!filial) return res.status(404).json({ message: "Topilmadi" });
    await reloadFilialsCache();
    res.json({ message: "O'chirildi" });
  } catch (e) { res.status(500).json({ message: "Xato: " + e.message }); }
});

module.exports = router;
