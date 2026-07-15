const router = require("express").Router();
const { auth } = require("../middleware/auth");
const Food = require("../models/Food");

const syncedMenuLocked = () => String(process.env.DELEVER_LOCK_SYNCED_MENU || "true").toLowerCase() !== "false";
const rejectSyncedFoodEdit = async (id, res) => {
  if (!syncedMenuLocked()) return false;
  const food = await Food.findById(id).select("source title");
  if (food?.source !== "delever") return false;
  res.status(409).json({
    message: "Bu taom Neon Alisa/Delever menyusidan kelgan. Uni ichki tizimda o'zgartiring — bot avtomatik yangilanadi.",
  });
  return true;
};

router.get("/api/foods", async (req, res) => {
  try {
    const filter = { isDeletedInSource: { $ne: true } };
    if (req.query.category) filter["category.uz"] = req.query.category;
    const foods = await Food.find(filter).sort({ sortOrder: 1, createdAt: -1 });
    res.json(foods);
  } catch { res.status(500).json({ message: "Xato" }); }
});

router.get("/api/foods/:id", async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);
    if (!food) return res.status(404).json({ message: "Topilmadi" });
    res.json(food);
  } catch { res.status(500).json({ message: "Xato" }); }
});

router.post("/api/foods", auth, async (req, res) => {
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

router.put("/api/foods/:id", auth, async (req, res) => {
  try {
    if (await rejectSyncedFoodEdit(req.params.id, res)) return;
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

router.patch("/api/foods/:id/availability", auth, async (req, res) => {
  try {
    if (await rejectSyncedFoodEdit(req.params.id, res)) return;
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

router.delete("/api/foods/:id", auth, async (req, res) => {
  try {
    if (await rejectSyncedFoodEdit(req.params.id, res)) return;
    await Food.findByIdAndDelete(req.params.id);
    res.json({ message: "O'chirildi" });
  } catch { res.status(500).json({ message: "Xato" }); }
});


module.exports = router;
