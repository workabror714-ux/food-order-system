import { useEffect, useState, useRef } from "react";
import { LOGO_WHITE } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Rasm compress - 2MB dan katta bo'lsa kichiklashtiradi
const compressImage = (file) => new Promise((resolve) => {
  if (file.size < 2 * 1024 * 1024) { resolve(file); return; }
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new window.Image();
    img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const maxW = 1920;
      if (width > maxW) { height = Math.round(height * maxW / width); width = maxW; }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        const out = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        resolve(blob.size > file.size ? file : out);
      }, "image/jpeg", 0.92);
    };
  };
});

const uploadToServer = async (file, token) => {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch(`${API}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Yuklash xatosi");
  return data.url;
};

const getField = (f, lang = "uz") => {
  if (!f) return "";
  if (typeof f === "string") return f;
  return f[lang] || f.uz || f.ru || f.en || "";
};

const CATEGORY_ORDER = [
  "Birinchi taomlar", "Suyuq taomlar", "Sho'rvalar",
  "Quyuq ovqat", "Ikkinchi taomlar", "Go'shtli asortiment",
  "Grill", "Hamir ovqat", "Pide",
  "Salatlar", "Fast food", "Burger", "Pizza",
  "Ichimliklar", "Bar", "Desertlar", "Desert"
];
const normalizeCat = (v) => String(v || "").toLowerCase().trim();
const getCategoryRank = (cat) => {
  const key = normalizeCat(getField(cat, "uz"));
  const idx = CATEGORY_ORDER.findIndex(c => normalizeCat(c) === key);
  return idx === -1 ? 999 : idx;
};
const sortCategories = (cats) => [...cats].sort((a, b) => {
  const rankA = getCategoryRank(a);
  const rankB = getCategoryRank(b);
  if (rankA !== rankB) return rankA - rankB;
  return normalizeCat(getField(a, "uz")).localeCompare(normalizeCat(getField(b, "uz")));
});

const LANGS = ["uz", "ru", "en"];
const LANG_LABELS = { uz: "🇺🇿 O'zbek", ru: "🇷🇺 Русский", en: "🇬🇧 English" };

export default function Admin() {
  const token = localStorage.getItem("token");
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token) window.location.href = "/login"; }, [token]);

  const [tab, setTab] = useState("foods");
  const [activeLang, setActiveLang] = useState("uz");

  // Food form
  const [titles, setTitles] = useState({ uz: "", ru: "", en: "" });
  const [descs, setDescs] = useState({ uz: "", ru: "", en: "" });
  const [price, setPrice] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState({ uz: "", ru: "", en: "" });
  const [catNames, setCatNames] = useState({ uz: "", ru: "", en: "" });
  const [showCatInput, setShowCatInput] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);

  // Rasm
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [foods, setFoods] = useState([]);
  const [editId, setEditId] = useState(null);
  const [foodLoading, setFoodLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);

  // Orders
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Admins
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [admins, setAdmins] = useState([]);

  // Banners (multi)
  const [banners, setBanners] = useState([]);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [editBanner, setEditBanner] = useState(null);
  const [bannerMediaFile, setBannerMediaFile] = useState(null);
  const [newBannerEvent, setNewBannerEvent] = useState({ label: "", emoji: "🔥" });
  const defaultBannerForm = { title:"", subtitle:"", description:"", bgColor:"#1a5c30", mediaType:"none", mediaUrl:"", buttonText:"", buttonLink:"", startDate:"", endDate:"", order:0, isActive:true, events:[], promoCategory:"", promoLabel:"Aksiya taomlar" };
  const [bannerForm, setBannerForm] = useState(defaultBannerForm);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchFoods = async () => {
    try {
      const res = await fetch(`${API}/api/foods`);
      if (res.ok) {
        const data = await res.json();
        setFoods(data);
        const cats = [];
        data.forEach(f => {
          const key = getField(f.category, "uz");
          if (key && !cats.find(c => getField(c, "uz") === key)) cats.push(f.category);
        });
        setCategories(sortCategories(cats));
      }
    } catch {}
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const url = orderFilter === "all" ? `${API}/api/orders` : `${API}/api/orders?status=${orderFilter}`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.status === 401) { localStorage.clear(); window.location.href = "/login"; return; }
      if (res.ok) setOrders(await res.json());
    } catch {} finally { setOrdersLoading(false); }
  };

  const fetchAdmins = async () => {
    if (savedUser.role !== "superadmin") return;
    try { const res = await fetch(`${API}/auth/admins`, { headers: authHeaders }); if (res.ok) setAdmins(await res.json()); } catch {}
  };

  const fetchBanners = async () => {
    try {
      const res = await fetch(`${API}/api/banners/all`, { headers: authHeaders });
      if (res.ok) setBanners(await res.json());
    } catch {}
  };

  const saveBanner = async () => {
    setBannerLoading(true);
    try {
      let mediaUrl = bannerForm.mediaUrl;
      if (bannerMediaFile && bannerForm.mediaType !== "none") {
        const fd = new FormData();
        fd.append("image", bannerMediaFile);
        const r = await fetch(`${API}/api/upload`, { method:"POST", headers:authHeaders, body:fd });
        const d = await r.json();
        if (r.ok) mediaUrl = d.url;
      }
      const fd = new FormData();
      Object.entries({...bannerForm, mediaUrl, events: JSON.stringify(bannerForm.events)}).forEach(([k,v]) => {
        if (v !== null && v !== undefined) fd.append(k, v);
      });
      const url = editBanner ? `${API}/api/banners/${editBanner}` : `${API}/api/banners`;
      const method = editBanner ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authHeaders, body: fd });
      if (res.ok) {
        alert(editBanner ? "✅ Yangilandi!" : "✅ Banner qo'shildi!");
        setShowBannerForm(false); setEditBanner(null); setBannerForm(defaultBannerForm);
        setBannerMediaFile(null); fetchBanners();
      } else {
        const d = await res.json(); alert("Xato: " + d.message);
      }
    } catch(e) { alert("Server xatosi: " + e.message); }
    finally { setBannerLoading(false); }
  };

  const deleteBanner = async (id) => {
    if (!window.confirm("Bannerni o'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/api/banners/${id}`, { method:"DELETE", headers: authHeaders });
    if (res.ok) fetchBanners();
  };

  const addBannerEvent = () => {
    if (!newBannerEvent.label.trim()) return;
    setBannerForm(f => ({ ...f, events: [...f.events, { id: Date.now().toString(), ...newBannerEvent }] }));
    setNewBannerEvent({ label: "", emoji: "🔥" });
  };

  useEffect(() => { fetchFoods(); fetchAdmins(); fetchBanners(); }, []);
  useEffect(() => { if (tab === "orders") fetchOrders(); }, [tab, orderFilter]);

  const resetForm = () => {
    setTitles({ uz: "", ru: "", en: "" });
    setDescs({ uz: "", ru: "", en: "" });
    setSelectedCat({ uz: "", ru: "", en: "" });
    setPrice(""); setIsAvailable(true); setImageFile(null); setImagePreview(null); setUploadedUrl(""); setEditId(null);
  };

  const addCategory = () => {
    if (!catNames.uz.trim()) { alert("O'zbek tilidagi nomi shart!"); return; }
    const newCat = {
      uz: catNames.uz.trim(),
      ru: catNames.ru.trim() || catNames.uz.trim(),
      en: catNames.en.trim() || catNames.uz.trim(),
    };
    setCategories(prev => sortCategories([...prev, newCat]));
    setSelectedCat(newCat);
    setCatNames({ uz: "", ru: "", en: "" });
    setShowCatInput(false);
  };

  // Rasm tanlash
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCompressing(true);
    setUploadedUrl("");
    setImagePreview(null);
    try {
      const compressed = await compressImage(file);
      setImageFile(compressed);
      const reader = new FileReader();
      reader.onload = ev => setImagePreview(ev.target.result);
      reader.readAsDataURL(compressed);
    } catch { setImageFile(file); }
    finally { setCompressing(false); }
  };

  // Serverga yuklash
  const handleUpload = async () => {
    if (!imageFile) { alert("Avval rasm tanlang!"); return; }
    setUploading(true);
    try {
      const url = await uploadToServer(imageFile, token);
      setUploadedUrl(url);
      setImagePreview(url);
      alert("✅ Rasm yuklandi!");
    } catch (e) {
      alert("Yuklash xatosi: " + e.message);
    } finally { setUploading(false); }
  };

  // Food saqlash
  const handleFoodSubmit = async (e) => {
    e.preventDefault();
    if (!titles.uz.trim()) { alert("O'zbek tili nomini kiriting!"); return; }
    if (!selectedCat.uz) { alert("Kategoriya tanlang!"); return; }

    // Yangi taom uchun rasm shart, tahrirlashda eski rasm saqlanadi
    if (!uploadedUrl && !editId) {
      alert("Rasmni serverga yuklang!\n\n1. Fayl tanlang\n2. 'Serverga yuklash' tugmasini bosing");
      return;
    }

    setFoodLoading(true);
    try {
      const body = {
        title_uz: titles.uz,
        title_ru: titles.ru || titles.uz,
        title_en: titles.en || titles.uz,
        price: String(Number(price) || 0),
        category_uz: selectedCat.uz,
        category_ru: selectedCat.ru || selectedCat.uz,
        category_en: selectedCat.en || selectedCat.uz,
        desc_uz: descs.uz,
        desc_ru: descs.ru || descs.uz,
        desc_en: descs.en || descs.uz,
        isAvailable,
      };
      if (uploadedUrl) body.imageUrl = uploadedUrl;

      const url = editId ? `${API}/api/foods/${editId}` : `${API}/api/foods`;
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        alert(editId ? "✅ Yangilandi!" : "✅ Qo'shildi!");
        resetForm(); fetchFoods();
      } else {
        alert("Xato: " + (data.message || JSON.stringify(data)));
      }
    } catch (err) { alert("Server xatosi: " + err.message); }
    finally { setFoodLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/api/foods/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) { setSelectedFood(null); fetchFoods(); }
  };

  const toggleFoodAvailability = async (food, e) => {
    e?.stopPropagation?.();
    const next = food.isAvailable === false;
    const res = await fetch(`${API}/api/foods/${food._id}/availability`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailable: next }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFoods(prev => prev.map(f => f._id === updated._id ? updated : f));
      setSelectedFood(prev => prev && prev._id === updated._id ? updated : prev);
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.message || "Holatni o'zgartirishda xato");
    }
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
    setSelectedFood(null); setTab("foods");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateOrderStatus = async (id, status) => {
    const res = await fetch(`${API}/api/orders/${id}/status`, {
      method: "PUT", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchOrders();
  };

  const deleteOrder = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/api/orders/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) fetchOrders();
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/auth/create-admin`, {
      method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    });
    const data = await res.json();
    if (res.ok) { alert("✅ Admin yaratildi!"); setNewUsername(""); setNewPassword(""); fetchAdmins(); }
    else alert(data.message);
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/auth/admins/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) fetchAdmins();
  };


  const handleLogout = () => { localStorage.clear(); window.location.href = "/login"; };

  const newOrderCount = orders.filter(o => o.status === "new").length;
  const statusLabel = { new: "Yangi", preparing: "Tayyorlanmoqda", delivered: "Yetkazildi", cancelled: "Bekor" };
  const statusColor = { new: "#3b82f6", preparing: "#f59e0b", delivered: "#10b981", cancelled: "#ef4444" };

  return (
    <div className="admin-root">
      {/* TOPBAR */}
      <div className="admin-topbar">
        <div className="admin-logo">
          <img src={LOGO_WHITE} alt="Yalpiz" className="admin-logo-img" />
          <span style={{ fontSize: "0.88rem", fontWeight: 700, opacity: 0.9 }}>Admin Panel</span>
        </div>
        <div className="admin-user-info">
          <span className="admin-username">{savedUser.username}</span>
          <span className="admin-role-badge">{savedUser.role}</span>
          <button className="logout-btn" onClick={handleLogout}>Chiqish</button>
        </div>
      </div>

      {/* TABS */}
      <div className="admin-tabs">
        <button className={`admin-tab ${tab === "foods" ? "active" : ""}`} onClick={() => setTab("foods")}>🍜 Taomlar</button>
        <button className={`admin-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          📋 Buyurtmalar {newOrderCount > 0 && <span className="tab-badge">{newOrderCount}</span>}
        </button>
        <button className={`admin-tab ${tab === "banner" ? "active" : ""}`} onClick={() => setTab("banner")}>🎨 Banner</button>
        {savedUser.role === "superadmin" && (
          <button className={`admin-tab ${tab === "admins" ? "active" : ""}`} onClick={() => setTab("admins")}>👤 Adminlar</button>
        )}
      </div>

      <div className="admin-content">

        {/* ══ FOODS ══ */}
        {tab === "foods" && (
          <>
            <div className="admin-section">
              <h2 className="section-title">{editId ? "✏️ Taomni tahrirlash" : "➕ Yangi taom qo'shish"}</h2>
              <form onSubmit={handleFoodSubmit} className="food-form">

                {/* Til tabs */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  {LANGS.map(l => (
                    <button key={l} type="button"
                      className={`cat-chip ${activeLang === l ? "selected" : ""}`}
                      onClick={() => setActiveLang(l)}>
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
                      required={activeLang === "uz"}
                    />
                  </div>
                  <div className="input-group">
                    <label>Narxi (so'm) *</label>
                    <input type="number" placeholder="35000" value={price}
                      onChange={e => setPrice(e.target.value)} required />
                  </div>
                </div>

                <div className="input-group">
                  <label>Tavsif — {LANG_LABELS[activeLang]}</label>
                  <textarea rows={3}
                    placeholder={activeLang === "uz" ? "Taom haqida..." : activeLang === "ru" ? "Описание..." : "Description..."}
                    value={descs[activeLang]}
                    onChange={e => setDescs(d => ({ ...d, [activeLang]: e.target.value }))}
                  />
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

                {/* Kategoriya */}
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
                      <button type="button" className="cat-chip add-cat-btn"
                        onClick={() => setShowCatInput(!showCatInput)}>
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
                              onChange={e => setCatNames(n => ({ ...n, [l]: e.target.value }))}
                            />
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

                {/* RASM YUKLASH */}
                <div className="input-group">
                  <label>Rasm {!editId && "*"}</label>

                  <input type="file" accept="image/*" onChange={handleImageChange} />
                  {compressing && <p style={{ color: "var(--g)", fontSize: "0.82rem", marginTop: 4 }}>⏳ Optimallashtirilmoqda...</p>}

                  {/* Serverga yuklash tugmasi - faqat fayl tanlanganda, hali yuklanmaganda */}
                  {imageFile && !uploadedUrl && !compressing && (
                    <button type="button" className="btn-primary" style={{ marginTop: 10 }}
                      onClick={handleUpload} disabled={uploading}>
                      {uploading ? "⏳ Yuklanmoqda..." : "☁️ Serverga yuklash"}
                    </button>
                  )}

                  {/* Yuklandi holati */}
                  {uploadedUrl && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#d1fae5", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.85rem", color: "#065f46", fontWeight: 700 }}>
                        ✅ Rasm yuklandi! {imageFile && `(${Math.round(imageFile.size / 1024)} KB)`}
                      </span>
                      <button type="button" onClick={() => { setUploadedUrl(""); setImagePreview(null); setImageFile(null); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#e53e3e", fontSize: 18 }}>✕</button>
                    </div>
                  )}

                  {/* Yangi taom uchun ogohlantirish */}
                  {!editId && !uploadedUrl && (
                    <p style={{ fontSize: "0.78rem", color: "#e53e3e", marginTop: 6, fontWeight: 600 }}>
                      ⚠️ Fayl tanlang → "Serverga yuklash" tugmasini bosing!
                    </p>
                  )}

                  {/* Preview */}
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

            {/* Taomlar ro'yxati */}
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
                          {food.isAvailable === false ? "✅ Yoqish" : "⛔ O‘chirish"}
                        </button>
                        <button className="btn-delete" onClick={() => handleDelete(food._id)}>🗑 O'chirish</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══ ORDERS ══ */}
        {tab === "orders" && (
          <div className="admin-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>📋 Buyurtmalar</h2>
              <button className="filter-btn" onClick={fetchOrders}>🔄 Yangilash</button>
            </div>
            <div className="order-filter-bar">
              {["all", "new", "preparing", "delivered", "cancelled"].map(s => (
                <button key={s} className={`filter-btn ${orderFilter === s ? "active" : ""}`} onClick={() => setOrderFilter(s)}>
                  {s === "all" ? "Barchasi" : statusLabel[s]}
                  {s === "new" && newOrderCount > 0 && (
                    <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", padding: "1px 6px", fontSize: 11, marginLeft: 6 }}>
                      {newOrderCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {ordersLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Buyurtmalar yo'q</div>
            ) : (
              <div className="orders-list">
                {orders.map(order => (
                  <div key={order._id} className="order-card">
                    <div className="order-card-header">
                      <div>
                        <span className="order-name">{order.customerName}</span>
                        <span className="order-phone">📞 {order.customerPhone}</span>
                        {order.address && <span className="order-address">📍 {order.address}</span>}
                        {order.location && (
                          <a className="order-address"
                            href={`https://yandex.com/maps/?pt=${order.location.lng},${order.location.lat}&z=16&l=map`}
                            target="_blank" rel="noreferrer">🗺 Xaritada ko'rish</a>
                        )}
                        {order.orderType === "dine_in" && order.tableNumber && (
                          <span className="order-address">🍽 Restoran — Stol №{order.tableNumber}</span>
                        )}
                        {order.orderType === "delivery" && (
                          <span className={`millenium-badge ${order.milleniumOrderId ? "success" : "pending"}`}>
                            🚕 Millenium: {order.milleniumOrderId ? `#${order.milleniumOrderId}` : "yuborilmagan"}
                            {(order.driverName || order.driverPhone || order.carModel) && (
                              <div className="driver-info-box">
                                <div className="driver-info-title">🚗 Kuryer ma'lumotlari</div>
                                {order.driverName && <div>👤 {order.driverName}</div>}
                                {order.driverPhone && <div>📞 {order.driverPhone}</div>}
                                {order.carModel && <div>🚙 {order.carModel}</div>}
                                {order.driverLocation?.lat && (
                                  <a
                                    href={`https://yandex.com/maps/?pt=${order.driverLocation.lng},${order.driverLocation.lat}&z=16&l=map`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    🗺 Kuryerni xaritada ko‘rish
                                  </a>
                                )}
                              </div>
                            )}
                          </span>

                        )}
                      </div>
                      <div className="order-right">
                        <span className="order-status-badge"
                          style={{ backgroundColor: statusColor[order.status] + "22", color: statusColor[order.status] }}>
                          {statusLabel[order.status]}
                        </span>
                        {order.paymentType && (
                          <span style={{ fontSize: "0.72rem", color: "#888", display: "block", marginTop: 2 }}>
                            {order.paymentType === "cash" && "💵 Naqd"}
                            {order.paymentType === "click" && "🟦 Click"}
                            {order.paymentType === "payme" && "🟩 Payme"}
                            {order.paymentType === "card" && "💳 Karta"}
                            {order.paymentStatus && (
                              <span className={`millenium-badge ${order.paymentStatus === "paid" ? "success" : "pending"}`}>
                                To‘lov: {order.paymentStatus}
                              </span>
                            )}
                          </span>
                        )}
                        <span className="order-date">{new Date(order.createdAt).toLocaleString("uz-UZ")}</span>
                      </div>
                    </div>
                    <div className="order-items">
                      {order.items.map((item, i) => (
                        <span key={i} className="order-item-chip">{item.title} × {item.quantity}</span>
                      ))}
                    </div>
                    <div className="order-card-footer">
                      <span className="order-total">Jami: <strong>{order.totalPrice?.toLocaleString()} so'm</strong></span>
                      <div className="order-actions">
                        {order.status === "new" && (
                          <button className="status-btn preparing" onClick={() => updateOrderStatus(order._id, "preparing")}>🍳 Tayyorlash</button>
                        )}
                        {order.status === "preparing" && (
                          <button className="status-btn delivered" onClick={() => updateOrderStatus(order._id, "delivered")}>✅ Yetkazildi</button>
                        )}
                        {(order.status === "new" || order.status === "preparing") && (
                          <button className="status-btn cancelled" onClick={() => updateOrderStatus(order._id, "cancelled")}>✕ Bekor</button>
                        )}
                        <button className="status-btn delete-order" onClick={() => deleteOrder(order._id)}>🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ BANNER ══ */}
        {tab === "banner" && (
          <div>
            {/* Banner ro'yxati */}
            <div className="admin-section">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h2 className="section-title" style={{marginBottom:0}}>🎨 Bannerlar ({banners.length})</h2>
                {savedUser.role === "superadmin" && (
                  <button className="btn-primary" onClick={() => { setEditBanner(null); setBannerForm(defaultBannerForm); setShowBannerForm(true); }}>
                    + Yangi banner
                  </button>
                )}
              </div>

              {banners.length === 0 ? (
                <div style={{textAlign:"center",padding:"40px 20px",color:"var(--gray)"}}>
                  <p>Hali banner yo'q</p>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {banners.map(b => (
                    <div key={b._id} style={{border:`2px solid ${b.isActive ? "var(--g3)" : "#fee2e2"}`,borderRadius:16,overflow:"hidden",background:"white"}}>
                      {/* Preview */}
                      <div style={{background:b.bgColor,padding:"16px 18px",position:"relative",overflow:"hidden",minHeight:80,display:"flex",alignItems:"center",gap:12}}>
                        {b.mediaType==="image" && b.mediaUrl && (
                          <img src={b.mediaUrl} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:0.3}} />
                        )}
                        <div style={{position:"relative",zIndex:1,flex:1}}>
                          <div style={{fontWeight:900,color:"white",fontSize:"1rem"}}>{b.title}</div>
                          <div style={{color:"#a3d45b",fontWeight:700,fontSize:"0.88rem"}}>{b.subtitle}</div>
                          {b.description && <div style={{color:"rgba(255,255,255,0.8)",fontSize:"0.78rem",marginTop:2}}>{b.description}</div>}
                          {b.events?.length > 0 && (
                            <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                              {b.events.map(ev => <span key={ev.id} style={{background:"rgba(255,255,255,0.15)",color:"white",padding:"2px 10px",borderRadius:20,fontSize:"0.75rem"}}>{ev.emoji} {ev.label}</span>)}
                            </div>
                          )}
                        </div>
                        <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                          {b.startDate && <span style={{background:"rgba(0,0,0,0.3)",color:"white",padding:"2px 8px",borderRadius:10,fontSize:"0.7rem"}}>🕐 {new Date(b.startDate).toLocaleDateString()}</span>}
                          {b.endDate && <span style={{background:"rgba(0,0,0,0.3)",color:"white",padding:"2px 8px",borderRadius:10,fontSize:"0.7rem"}}>⏰ {new Date(b.endDate).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      {/* Actions */}
                      <div style={{padding:"10px 14px",display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontSize:"0.78rem",color:b.isActive?"var(--g)":"#ef4444",fontWeight:700,flex:1}}>
                          {b.isActive ? "✅ Faol" : "❌ Nofaol"}
                          {b.endDate && new Date(b.endDate) < new Date() ? " (muddati o'tgan)" : ""}
                        </span>
                        <span style={{fontSize:"0.75rem",color:"var(--gray)"}}>Tartib: {b.order}</span>
                        {savedUser.role === "superadmin" && (
                          <>
                            <button className="btn-edit" onClick={() => {
                              setEditBanner(b._id);
                              setBannerForm({
                                title: b.title, subtitle: b.subtitle, description: b.description || "",
                                bgColor: b.bgColor, mediaType: b.mediaType, mediaUrl: b.mediaUrl || "",
                                buttonText: b.buttonText || "", buttonLink: b.buttonLink || "",
                                startDate: b.startDate ? new Date(b.startDate).toISOString().split("T")[0] : "",
                                endDate: b.endDate ? new Date(b.endDate).toISOString().split("T")[0] : "",
                                order: b.order || 0, isActive: b.isActive, events: b.events || [],
                                promoCategory: b.promoCategory || "", promoLabel: b.promoLabel || "Aksiya taomlar",
                              });
                              setShowBannerForm(true);
                            }}>✏️ Tahrirlash</button>
                            <button className="btn-delete" onClick={() => deleteBanner(b._id)}>🗑</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Banner forma (superadmin) */}
            {showBannerForm && savedUser.role === "superadmin" && (
              <div className="admin-section">
                <h2 className="section-title">{editBanner ? "✏️ Bannerni tahrirlash" : "➕ Yangi banner"}</h2>
                <div className="food-form">
                  <div className="form-grid">
                    <div className="input-group"><label>Sarlavha *</label><input type="text" value={bannerForm.title} onChange={e => setBannerForm(f=>({...f,title:e.target.value}))} /></div>
                    <div className="input-group"><label>Kichik sarlavha</label><input type="text" value={bannerForm.subtitle} onChange={e => setBannerForm(f=>({...f,subtitle:e.target.value}))} /></div>
                    <div className="input-group"><label>Tavsif</label><input type="text" value={bannerForm.description} onChange={e => setBannerForm(f=>({...f,description:e.target.value}))} /></div>
                    <div className="input-group">
                      <label>Fon rangi</label>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <input type="color" value={bannerForm.bgColor} onChange={e => setBannerForm(f=>({...f,bgColor:e.target.value}))} style={{width:50,height:38,border:"none",borderRadius:8,cursor:"pointer"}} />
                        <input type="text" value={bannerForm.bgColor} onChange={e => setBannerForm(f=>({...f,bgColor:e.target.value}))} style={{flex:1}} />
                      </div>
                    </div>
                    <div className="input-group"><label>Tugma matni</label><input type="text" placeholder="Batafsil..." value={bannerForm.buttonText} onChange={e => setBannerForm(f=>({...f,buttonText:e.target.value}))} /></div>
                  </div>

                  {/* Aksiya taomlar sektsiyasi */}
                  <div style={{background:"#fff9e6",borderRadius:14,padding:16,border:"2px solid #fde68a"}}>
                    <p style={{fontWeight:800,fontSize:"0.88rem",marginBottom:12,color:"#92400e"}}>🔥 Banner ostida aksiya taomlar</p>
                    <div className="form-grid">
                      <div className="input-group">
                        <label>Kategoriya (aksiya uchun)</label>
                        <select value={bannerForm.promoCategory} onChange={e => setBannerForm(f=>({...f,promoCategory:e.target.value}))}>
                          <option value="">— Yo'q —</option>
                          {categories.map((cat, i) => {
                            const key = typeof cat==="object" ? cat.uz : cat;
                            return <option key={i} value={key}>{key}</option>;
                          })}
                        </select>
                        <span style={{fontSize:"0.72rem",color:"#92400e"}}>Bu kategoriya taomlar banner ostida chiqadi</span>
                      </div>
                      <div className="input-group">
                        <label>Aksiya sarlavhasi</label>
                        <input type="text" placeholder="Aksiya taomlar" value={bannerForm.promoLabel} onChange={e => setBannerForm(f=>({...f,promoLabel:e.target.value}))} />
                      </div>
                    </div>
                  </div>
                  <div className="form-grid" style={{display:"none"}}>
                    <div className="input-group">
                      <label>Tartib raqami</label>
                      <input type="number" min="0" value={bannerForm.order} onChange={e => setBannerForm(f=>({...f,order:parseInt(e.target.value)||0}))} />
                    </div>
                  </div>

                  {/* Muddatli aksiya */}
                  <div style={{background:"var(--g3)",borderRadius:14,padding:16}}>
                    <p style={{fontWeight:700,fontSize:"0.88rem",marginBottom:12}}>⏰ Muddatli aksiya (ixtiyoriy)</p>
                    <div className="form-grid">
                      <div className="input-group">
                        <label>Boshlanish sanasi</label>
                        <input type="date" value={bannerForm.startDate} onChange={e => setBannerForm(f=>({...f,startDate:e.target.value}))} />
                      </div>
                      <div className="input-group">
                        <label>Tugash sanasi</label>
                        <input type="date" value={bannerForm.endDate} onChange={e => setBannerForm(f=>({...f,endDate:e.target.value}))} />
                      </div>
                    </div>
                    <p style={{fontSize:"0.75rem",color:"var(--gray)",marginTop:8}}>⚠️ Tugash sanasi o'tsa — banner avtomatik yashirinadi</p>
                  </div>

                  {/* Faollik */}
                  <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"white",borderRadius:12,border:"2px solid var(--border)"}}>
                    <input type="checkbox" id="isActive" checked={bannerForm.isActive}
                      onChange={e => setBannerForm(f=>({...f,isActive:e.target.checked}))}
                      style={{width:18,height:18,cursor:"pointer"}} />
                    <label htmlFor="isActive" style={{fontWeight:700,cursor:"pointer"}}>Banner faol</label>
                  </div>

                  {/* Media */}
                  <div className="input-group">
                    <label>Media turi</label>
                    <div style={{display:"flex",gap:10}}>
                      {["none","image","video"].map(type => (
                        <button key={type} type="button" className={`cat-chip ${bannerForm.mediaType===type?"selected":""}`}
                          onClick={() => setBannerForm(f=>({...f,mediaType:type}))}>
                          {type==="none"?"🚫 Yo'q":type==="image"?"🖼 Rasm":"🎬 Video"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {bannerForm.mediaType !== "none" && (
                    <div className="input-group">
                      <label>Rasm / Video</label>
                      <input type="file" accept={bannerForm.mediaType==="image"?"image/*":"video/*"}
                        onChange={e => setBannerMediaFile(e.target.files[0])} />
                      {bannerForm.mediaUrl && (
                        <div style={{marginTop:8}}>
                          {bannerForm.mediaType==="image" ? (
                            <img src={bannerForm.mediaUrl} alt="banner" style={{width:"100%",maxHeight:120,objectFit:"cover",borderRadius:10}} />
                          ) : (
                            <video src={bannerForm.mediaUrl} style={{width:"100%",maxHeight:120,borderRadius:10}} controls />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Events */}
                  <div>
                    <label style={{fontSize:"0.82rem",fontWeight:700,color:"var(--gray)",display:"block",marginBottom:8}}>🎪 Chip/Event labellar</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
                      {bannerForm.events.map(ev => (
                        <span key={ev.id} style={{display:"flex",alignItems:"center",gap:6,background:"var(--g3)",padding:"5px 12px",borderRadius:20,fontSize:"0.85rem"}}>
                          {ev.emoji} {ev.label}
                          <button onClick={() => setBannerForm(f=>({...f,events:f.events.filter(e=>e.id!==ev.id)}))}
                            style={{background:"none",border:"none",cursor:"pointer",color:"#e53e3e",fontSize:14}}>✕</button>
                        </span>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <input type="text" placeholder="🔥" value={newBannerEvent.emoji}
                        onChange={e => setNewBannerEvent(n=>({...n,emoji:e.target.value}))} style={{width:70}} />
                      <input type="text" placeholder="Chegirma 30%..." value={newBannerEvent.label}
                        onChange={e => setNewBannerEvent(n=>({...n,label:e.target.value}))}
                        onKeyDown={e => e.key==="Enter" && (e.preventDefault(), addBannerEvent())} style={{flex:1}} />
                      <button type="button" className="btn-primary" onClick={addBannerEvent}>+ Qo'shish</button>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button type="button" className="btn-primary" onClick={saveBanner} disabled={bannerLoading}>
                      {bannerLoading ? "Saqlanmoqda..." : editBanner ? "💾 Saqlash" : "➕ Qo'shish"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => { setShowBannerForm(false); setEditBanner(null); }}>
                      Bekor qilish
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ADMINS ══ */}
        {tab === "admins" && savedUser.role === "superadmin" && (
          <div className="admin-section">
            <h2 className="section-title">👤 Admin yaratish</h2>
            <form onSubmit={handleCreateAdmin} className="food-form" style={{ maxWidth: 420 }}>
              <div className="input-group"><label>Username *</label><input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required /></div>
              <div className="input-group"><label>Parol *</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></div>
              <div className="input-group"><label>Rol</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
              <button type="submit" className="btn-primary">➕ Admin yaratish</button>
            </form>
            <h2 className="section-title" style={{ marginTop: 32 }}>Adminlar ro'yxati</h2>
            <div className="admins-list">
              {admins.map(adm => (
                <div key={adm._id} className="admin-row">
                  <div className="admin-avatar">{adm.username[0].toUpperCase()}</div>
                  <div><p className="admin-row-name">{adm.username}</p><p className="admin-row-role">{adm.role}</p></div>
                  {adm.username !== savedUser.username && (
                    <button className="btn-delete" style={{ marginLeft: "auto", flex: "none" }}
                      onClick={() => handleDeleteAdmin(adm._id)}>🗑</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FOOD MODAL */}
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
                  {selectedFood.isAvailable === false ? "✅ Yoqish" : "⛔ O‘chirish"}
                </button>
                <button className="btn-delete" onClick={() => handleDelete(selectedFood._id)}>🗑 O'chirish</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}