import { useState } from "react";
import { api } from "../api";
import { compressImage, uploadToServer, getField, sortCategories, LANGS, LANG_LABELS } from "../adminUtils";

// Taomlar tabi — forma, rasm yuklash, kategoriya, ro'yxat, modal.
// foods/categories shell'da (Banner bilan bo'lishiladi) → prop orqali keladi.
export default function FoodsTab({ foods, setFoods, categories, setCategories, refetch }) {
  const [activeLang, setActiveLang] = useState("uz");
  const [titles, setTitles] = useState({ uz: "", ru: "", en: "" });
  const [descs, setDescs] = useState({ uz: "", ru: "", en: "" });
  const [price, setPrice] = useState("");
  const [selectedCat, setSelectedCat] = useState({ uz: "", ru: "", en: "" });
  const [catNames, setCatNames] = useState({ uz: "", ru: "", en: "" });
  const [showCatInput, setShowCatInput] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [foodLoading, setFoodLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);

  const resetForm = () => {
    setTitles({ uz: "", ru: "", en: "" });
    setDescs({ uz: "", ru: "", en: "" });
    setSelectedCat({ uz: "", ru: "", en: "" });
    setPrice(""); setIsAvailable(true); setImageFile(null); setImagePreview(null); setUploadedUrl(""); setEditId(null);
  };

  const addCategory = () => {
    if (!catNames.uz.trim()) { alert("O'zbek tilidagi nomi shart!"); return; }
    const newCat = { uz: catNames.uz.trim(), ru: catNames.ru.trim() || catNames.uz.trim(), en: catNames.en.trim() || catNames.uz.trim() };
    setCategories(prev => sortCategories([...prev, newCat]));
    setSelectedCat(newCat);
    setCatNames({ uz: "", ru: "", en: "" });
    setShowCatInput(false);
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCompressing(true); setUploadedUrl(""); setImagePreview(null);
    try {
      const compressed = await compressImage(file);
      setImageFile(compressed);
      const reader = new FileReader();
      reader.onload = ev => setImagePreview(ev.target.result);
      reader.readAsDataURL(compressed);
    } catch { setImageFile(file); }
    finally { setCompressing(false); }
  };

  const handleUpload = async () => {
    if (!imageFile) { alert("Avval rasm tanlang!"); return; }
    setUploading(true);
    try {
      const url = await uploadToServer(imageFile);
      setUploadedUrl(url); setImagePreview(url);
      alert("✅ Rasm yuklandi!");
    } catch (e) { alert("Yuklash xatosi: " + e.message); }
    finally { setUploading(false); }
  };

  const handleFoodSubmit = async (e) => {
    e.preventDefault();
    if (!titles.uz.trim()) { alert("O'zbek tili nomini kiriting!"); return; }
    if (!selectedCat.uz) { alert("Kategoriya tanlang!"); return; }
    if (!uploadedUrl && !editId) {
      alert("Rasmni serverga yuklang!\n\n1. Fayl tanlang\n2. 'Serverga yuklash' tugmasini bosing");
      return;
    }
    setFoodLoading(true);
    try {
      const body = {
        title_uz: titles.uz, title_ru: titles.ru || titles.uz, title_en: titles.en || titles.uz,
        price: String(Number(price) || 0),
        category_uz: selectedCat.uz, category_ru: selectedCat.ru || selectedCat.uz, category_en: selectedCat.en || selectedCat.uz,
        desc_uz: descs.uz, desc_ru: descs.ru || descs.uz, desc_en: descs.en || descs.uz,
        isAvailable,
      };
      if (uploadedUrl) body.imageUrl = uploadedUrl;
      if (editId) await api.put(`/api/foods/${editId}`, body, true);
      else await api.post("/api/foods", body, true);
      alert(editId ? "✅ Yangilandi!" : "✅ Qo'shildi!");
      resetForm(); refetch();
    } catch (err) { alert("Xato: " + err.message); }
    finally { setFoodLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await api.del(`/api/foods/${id}`, true); setSelectedFood(null); refetch(); } catch {}
  };

  const toggleFoodAvailability = async (food, e) => {
    e?.stopPropagation?.();
    try {
      const updated = await api.patch(`/api/foods/${food._id}/availability`, { isAvailable: food.isAvailable === false }, true);
      setFoods(prev => prev.map(f => f._id === updated._id ? updated : f));
      setSelectedFood(prev => prev && prev._id === updated._id ? updated : prev);
    } catch (err) { alert(err.message || "Holatni o'zgartirishda xato"); }
  };

  const handleEdit = (food) => {
    setTitles({ uz: getField(food.title, "uz"), ru: getField(food.title, "ru"), en: getField(food.title, "en") });
    setDescs({ uz: getField(food.description, "uz"), ru: getField(food.description, "ru"), en: getField(food.description, "en") });
    const cat = typeof food.category === "object" ? food.category : { uz: food.category, ru: food.category, en: food.category };
    setSelectedCat(cat);
    setPrice(food.price);
    setIsAvailable(food.isAvailable !== false);
    setEditId(food._id);
    setUploadedUrl(food.image || "");
    setImagePreview(food.image || null);
    setImageFile(null);
    setSelectedFood(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <div className="admin-section">
        <h2 className="section-title">{editId ? "✏️ Taomni tahrirlash" : "➕ Yangi taom qo'shish"}</h2>
        <form onSubmit={handleFoodSubmit} className="food-form">
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {LANGS.map(l => (
              <button key={l} type="button" className={`cat-chip ${activeLang === l ? "selected" : ""}`} onClick={() => setActiveLang(l)}>
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>Nomi — {LANG_LABELS[activeLang]} {activeLang === "uz" && "*"}</label>
              <input type="text"
                placeholder={activeLang === "uz" ? "Masalan: Osh" : activeLang === "ru" ? "Например: Плов" : "e.g. Pilaf"}
                value={titles[activeLang]}
                onChange={e => setTitles(t => ({ ...t, [activeLang]: e.target.value }))}
                required={activeLang === "uz"} />
            </div>
            <div className="input-group">
              <label>Narxi (so'm) *</label>
              <input type="number" placeholder="35000" value={price} onChange={e => setPrice(e.target.value)} required />
            </div>
          </div>

          <div className="input-group">
            <label>Tavsif — {LANG_LABELS[activeLang]}</label>
            <textarea rows={3}
              placeholder={activeLang === "uz" ? "Taom haqida..." : activeLang === "ru" ? "Описание..." : "Description..."}
              value={descs[activeLang]}
              onChange={e => setDescs(d => ({ ...d, [activeLang]: e.target.value }))} />
          </div>

          <div className="availability-editor">
            <div>
              <strong>{isAvailable ? "✅ Taom mavjud" : "❌ Hozircha yo‘q"}</strong>
              <p>O‘chirib qo‘yilsa, mijoz savatga qo‘sha olmaydi.</p>
            </div>
            <label className="availability-switch">
              <input type="checkbox" checked={isAvailable} onChange={e => setIsAvailable(e.target.checked)} />
              <span></span>
            </label>
          </div>

          <div className="input-group">
            <label>Kategoriya *</label>
            <div className="cat-select-wrap">
              <div className="cat-chips">
                {categories.map((cat, idx) => (
                  <button key={idx} type="button"
                    className={`cat-chip ${selectedCat.uz === getField(cat, "uz") ? "selected" : ""}`}
                    onClick={() => setSelectedCat(typeof cat === "object" ? cat : { uz: cat, ru: cat, en: cat })}>
                    {getField(cat, activeLang) || getField(cat, "uz")}
                  </button>
                ))}
                <button type="button" className="cat-chip add-cat-btn" onClick={() => setShowCatInput(!showCatInput)}>
                  + Yangi kategoriya
                </button>
              </div>

              {showCatInput && (
                <div style={{ background: "var(--g3)", borderRadius: 14, padding: 16, marginTop: 12 }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 10 }}>Yangi kategoriya — 3 tilda</p>
                  {LANGS.map(l => (
                    <div key={l} className="input-group" style={{ marginBottom: 8 }}>
                      <label>{LANG_LABELS[l]} {l === "uz" && "*"}</label>
                      <input type="text"
                        placeholder={l === "uz" ? "Salatlar" : l === "ru" ? "Салаты" : "Salads"}
                        value={catNames[l]}
                        onChange={e => setCatNames(n => ({ ...n, [l]: e.target.value }))} />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn-primary" onClick={addCategory}>✅ Qo'shish</button>
                    <button type="button" className="btn-secondary" onClick={() => setShowCatInput(false)}>Bekor</button>
                  </div>
                </div>
              )}

              {selectedCat.uz && (
                <p className="selected-cat-label">✅ {selectedCat.uz}{selectedCat.ru && selectedCat.ru !== selectedCat.uz ? ` / ${selectedCat.ru}` : ""}</p>
              )}
            </div>
          </div>

          <div className="input-group">
            <label>Rasm {!editId && "*"}</label>
            <label className="upload-zone">
              <input type="file" accept="image/*" onChange={handleImageChange} hidden />
              <span className="upload-zone-icon">📷</span>
              <span className="upload-zone-text">
                {imageFile ? imageFile.name : (uploadedUrl ? "Rasm yuklandi — almashtirish uchun bosing" : "Rasm tanlash uchun bosing")}
              </span>
            </label>
            {compressing && <p style={{ color: "var(--g)", fontSize: "0.82rem", marginTop: 4 }}>⏳ Optimallashtirilmoqda...</p>}

            {imageFile && !uploadedUrl && !compressing && (
              <button type="button" className="btn-primary" style={{ marginTop: 10 }} onClick={handleUpload} disabled={uploading}>
                {uploading ? "⏳ Yuklanmoqda..." : "☁️ Serverga yuklash"}
              </button>
            )}

            {uploadedUrl && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#d1fae5", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.85rem", color: "#065f46", fontWeight: 700 }}>
                  ✅ Rasm yuklandi! {imageFile && `(${Math.round(imageFile.size / 1024)} KB)`}
                </span>
                <button type="button" onClick={() => { setUploadedUrl(""); setImagePreview(null); setImageFile(null); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#e53e3e", fontSize: 18 }}>✕</button>
              </div>
            )}

            {!editId && !uploadedUrl && (
              <p style={{ fontSize: "0.78rem", color: "#e53e3e", marginTop: 6, fontWeight: 600 }}>
                ⚠️ Fayl tanlang → "Serverga yuklash" tugmasini bosing!
              </p>
            )}

            {imagePreview && (
              <img src={imagePreview} alt="preview"
                style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, border: "2px solid var(--border)", marginTop: 10 }} />
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={foodLoading || compressing || uploading}>
              {foodLoading ? "Saqlanmoqda..." : editId ? "💾 Saqlash" : "➕ Qo'shish"}
            </button>
            {editId && <button type="button" className="btn-secondary" onClick={resetForm}>Bekor qilish</button>}
          </div>
        </form>
      </div>

      <div className="admin-section">
        <h2 className="section-title">📋 Mavjud taomlar ({foods.length})</h2>
        <div className="food-admin-grid">
          {foods.map(food => (
            <div key={food._id} className={`food-admin-card ${food.isAvailable === false ? "unavailable" : ""}`} onClick={() => setSelectedFood(food)}>
              <div className="food-admin-img-wrap">
                <img src={food.image || "https://placehold.co/200x120/e8f5ee/1d6b3e?text=Rasm"}
                  alt={getField(food.title, "uz")} className="food-admin-img"
                  onError={e => e.target.src = "https://placehold.co/200x120/e8f5ee/1d6b3e?text=Rasm"} />
                <span className={`availability-badge ${food.isAvailable === false ? "off" : "on"}`}>
                  {food.isAvailable === false ? "Hozircha yo‘q" : "Mavjud"}
                </span>
              </div>
              <div className="food-admin-info">
                <span className="food-admin-cat">{getField(food.category, "uz")}</span>
                <h4>{getField(food.title, "uz")}</h4>
                <p className="food-admin-price">{food.price?.toLocaleString()} so'm</p>
                <p className="food-admin-desc">{getField(food.description, "uz")}</p>
                <div className="food-admin-btns" onClick={e => e.stopPropagation()}>
                  <button className="btn-edit" onClick={() => handleEdit(food)}>✏️ Tahrirlash</button>
                  <button className={food.isAvailable === false ? "btn-available" : "btn-unavailable"} onClick={(e) => toggleFoodAvailability(food, e)}>
                    {food.isAvailable === false ? "✅ Sotuvga qaytarish" : "🚫 Sotuvdan olish"}
                  </button>
                  <button className="btn-delete" onClick={() => handleDelete(food._id)}>🗑 O'chirish</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedFood && (
        <div className="modal-overlay" onClick={() => setSelectedFood(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedFood(null)}>✕</button>
            <img src={selectedFood.image || "https://placehold.co/400x200/e8f5ee/1d6b3e?text=Rasm"}
              alt={getField(selectedFood.title, "uz")} className="modal-img"
              onError={e => e.target.src = "https://placehold.co/400x200/e8f5ee/1d6b3e?text=Rasm"} />
            <div className="modal-body">
              <span className="food-admin-cat">{getField(selectedFood.category, "uz")}</span>
              <span className={`availability-badge ${selectedFood.isAvailable === false ? "off" : "on"}`}>
                {selectedFood.isAvailable === false ? "Hozircha yo‘q" : "Mavjud"}
              </span>
              <h2 className="modal-title">{getField(selectedFood.title, "uz")}</h2>
              <p className="modal-price">{selectedFood.price?.toLocaleString()} so'm</p>
              <p className="modal-desc">{getField(selectedFood.description, "uz")}</p>
              <div className="modal-actions">
                <button className="btn-edit" onClick={() => handleEdit(selectedFood)}>✏️ Tahrirlash</button>
                <button className={selectedFood.isAvailable === false ? "btn-available" : "btn-unavailable"} onClick={(e) => toggleFoodAvailability(selectedFood, e)}>
                  {selectedFood.isAvailable === false ? "✅ Sotuvga qaytarish" : "🚫 Sotuvdan olish"}
                </button>
                <button className="btn-delete" onClick={() => handleDelete(selectedFood._id)}>🗑 O'chirish</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
