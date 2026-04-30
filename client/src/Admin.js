import { useEffect, useState, useRef } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const compressImage = (file, maxWidth = 1200, quality = 0.82) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })), "image/jpeg", quality);
    };
  };
});

const uploadToServer = async (file, token) => {
  const fd = new FormData(); fd.append("image", file);
  const res = await fetch(`${API}/api/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Yuklash xatosi");
  return data.url;
};

const LANGS = ["uz", "ru", "en"];
const LANG_LABELS = { uz: "🇺🇿 O'zbek", ru: "🇷🇺 Русский", en: "🇬🇧 English" };

export default function Admin() {
  const token = localStorage.getItem("token");
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token) window.location.href = "/login"; }, [token]);

  const [tab, setTab] = useState("foods");
  const [activeLang, setActiveLang] = useState("uz"); // food form active lang tab

  // Food form — 3 tilli
  const [titles, setTitles] = useState({ uz: "", ru: "", en: "" });
  const [descs, setDescs] = useState({ uz: "", ru: "", en: "" });
  const [categories, setCategories] = useState([]);
  const [catNames, setCatNames] = useState({ uz: "", ru: "", en: "" }); // yangi kategoriya
  const [selectedCat, setSelectedCat] = useState({ uz: "", ru: "", en: "" }); // tanlangan kategoriya
  const [price, setPrice] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [foods, setFoods] = useState([]);
  const [editId, setEditId] = useState(null);
  const [foodLoading, setFoodLoading] = useState(false);
  const [showCatInput, setShowCatInput] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [deleteCatModal, setDeleteCatModal] = useState(null);
  const [deleteCatAction, setDeleteCatAction] = useState("delete");
  const [moveToCat, setMoveToCat] = useState("");

  // Orders
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Admins
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [admins, setAdmins] = useState([]);

  // Banner
  const [banner, setBanner] = useState({ title: "Mazali taomlar", subtitle: "eshigingizgacha 🚀", description: "Yangi, tez va arzon yetkazib berish", mediaUrl: "", mediaType: "none", bgColor: "#0d4a28", events: [] });
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [newEvent, setNewEvent] = useState({ label: "", emoji: "🔥" });

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchFoods = async () => {
    try {
      const res = await fetch(`${API}/api/foods`);
      if (res.ok) {
        const data = await res.json();
        setFoods(data);
        // Kategoriyalarni yig'ish
        const cats = [];
        data.forEach(f => {
          if (f.category?.uz) {
            const existing = cats.find(c => c.uz === f.category.uz);
            if (!existing) cats.push({ uz: f.category.uz, ru: f.category.ru || f.category.uz, en: f.category.en || f.category.uz });
          }
        });
        setCategories(cats);
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

  const fetchBanner = async () => {
    try { const res = await fetch(`${API}/api/banner`); if (res.ok) setBanner(await res.json()); } catch {}
  };

  useEffect(() => { fetchFoods(); fetchAdmins(); fetchBanner(); }, []);
  useEffect(() => { if (tab === "orders") fetchOrders(); }, [tab, orderFilter]);

  const resetForm = () => {
    setTitles({ uz: "", ru: "", en: "" });
    setDescs({ uz: "", ru: "", en: "" });
    setSelectedCat({ uz: "", ru: "", en: "" });
    setPrice(""); setImageFile(null); setImagePreview(null); setUploadedUrl(""); setEditId(null);
  };

  // Kategoriya tanlash
  const selectCategory = (cat) => {
    setSelectedCat({ uz: cat.uz, ru: cat.ru, en: cat.en });
  };

  // Yangi kategoriya qo'shish
  const addCategory = () => {
    if (!catNames.uz.trim()) { alert("O'zbek tilidagi nomi shart!"); return; }
    const newCat = {
      uz: catNames.uz.trim(),
      ru: catNames.ru.trim() || catNames.uz.trim(),
      en: catNames.en.trim() || catNames.uz.trim(),
    };
    setCategories(prev => [...prev, newCat]);
    setSelectedCat(newCat);
    setCatNames({ uz: "", ru: "", en: "" });
    setShowCatInput(false);
  };

  // Rasm
  const handleImageChange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setCompressing(true); setUploadedUrl("");
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
    if (!imageFile) return;
    setUploading(true);
    try {
      const url = await uploadToServer(imageFile, token);
      setUploadedUrl(url);
    } catch (e) { alert("Yuklash xatosi: " + e.message); }
    finally { setUploading(false); }
  };

  // Food submit
  const handleFoodSubmit = async (e) => {
    e.preventDefault();
    if (!titles.uz.trim()) { alert("O'zbek tili nomini kiriting!"); return; }
    if (!selectedCat.uz) { alert("Kategoriya tanlang!"); return; }
    if (!uploadedUrl && !editId) { alert("Rasmni yuklang!"); return; }

    setFoodLoading(true);
    try {
      const body = {
        title_uz: titles.uz, title_ru: titles.ru || titles.uz, title_en: titles.en || titles.uz,
        price,
        category_uz: selectedCat.uz, category_ru: selectedCat.ru || selectedCat.uz, category_en: selectedCat.en || selectedCat.uz,
        desc_uz: descs.uz, desc_ru: descs.ru, desc_en: descs.en,
        ...(uploadedUrl && { imageUrl: uploadedUrl }),
      };

      const url = editId ? `${API}/api/foods/${editId}` : `${API}/api/foods`;
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) { alert(editId ? "✅ Yangilandi!" : "✅ Qo'shildi!"); resetForm(); fetchFoods(); }
      else alert(data.message || "Xatolik!");
    } catch { alert("Server xatosi!"); }
    finally { setFoodLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/api/foods/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) { setSelectedFood(null); fetchFoods(); }
  };

  const handleEdit = (food) => {
    // Eski string format yoki yangi object format
    const getVal = (field, lang) => {
      if (!field) return "";
      if (typeof field === "string") return field;
      return field[lang] || field.uz || "";
    };
    setTitles({ uz: getVal(food.title, "uz"), ru: getVal(food.title, "ru"), en: getVal(food.title, "en") });
    setDescs({ uz: getVal(food.description, "uz"), ru: getVal(food.description, "ru"), en: getVal(food.description, "en") });
    const cat = {
      uz: getVal(food.category, "uz"), ru: getVal(food.category, "ru"), en: getVal(food.category, "en")
    };
    setSelectedCat(cat);
    setPrice(food.price);
    setEditId(food._id);
    setUploadedUrl(food.image || "");
    setImagePreview(food.image || "");
    setImageFile(null);
    setSelectedFood(null);
    setTab("foods");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Orders
  const updateOrderStatus = async (id, status) => {
    const res = await fetch(`${API}/api/orders/${id}/status`, { method: "PUT", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) fetchOrders();
  };
  const deleteOrder = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/api/orders/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) fetchOrders();
  };

  // Admins
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/auth/create-admin`, { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }) });
    const data = await res.json();
    if (res.ok) { alert("✅ Admin yaratildi!"); setNewUsername(""); setNewPassword(""); fetchAdmins(); }
    else alert(data.message);
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/auth/admins/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) fetchAdmins();
  };

  // Banner
  const handleBannerSave = async () => {
    setBannerLoading(true);
    try {
      let mediaUrl = banner.mediaUrl;
      if (bannerFile && banner.mediaType !== "none") {
        const compressed = await compressImage(bannerFile, 1600, 0.85);
        mediaUrl = await uploadToServer(compressed, token);
      }
      const fd = new FormData();
      fd.append("title", banner.title); fd.append("subtitle", banner.subtitle);
      fd.append("description", banner.description); fd.append("bgColor", banner.bgColor);
      fd.append("mediaType", banner.mediaType); fd.append("events", JSON.stringify(banner.events));
      if (mediaUrl && banner.mediaType !== "none") fd.append("imageUrl", mediaUrl);
      const res = await fetch(`${API}/api/banner`, { method: "PUT", headers: authHeaders, body: fd });
      if (res.ok) { setBanner(await res.json()); setBannerFile(null); alert("✅ Banner saqlandi!"); }
    } catch (e) { alert("Xato: " + e.message); }
    finally { setBannerLoading(false); }
  };

  const addEvent = () => { if (!newEvent.label.trim()) return; setBanner(b => ({ ...b, events: [...b.events, { id: Date.now(), ...newEvent }] })); setNewEvent({ label: "", emoji: "🔥" }); };
  const removeEvent = (id) => setBanner(b => ({ ...b, events: b.events.filter(e => e.id !== id) }));
  const handleLogout = () => { localStorage.clear(); window.location.href = "/login"; };

  const newOrderCount = orders.filter(o => o.status === "new").length;
  const statusLabel = { new: "Yangi", preparing: "Tayyorlanmoqda", delivered: "Yetkazildi", cancelled: "Bekor" };
  const statusColor = { new: "#3b82f6", preparing: "#f59e0b", delivered: "#10b981", cancelled: "#ef4444" };

  const getFoodTitle = (food) => {
    if (!food.title) return "—";
    if (typeof food.title === "string") return food.title;
    return food.title.uz || food.title.ru || "—";
  };
  const getFoodCat = (food) => {
    if (!food.category) return "—";
    if (typeof food.category === "string") return food.category;
    return food.category.uz || "—";
  };
  const getFoodDesc = (food) => {
    if (!food.description) return "";
    if (typeof food.description === "string") return food.description;
    return food.description.uz || "";
  };

  return (
    <div className="admin-root">
      <div className="admin-topbar">
        <div className="admin-logo">🍃 Admin Panel</div>
        <div className="admin-user-info">
          <span className="admin-username">{savedUser.username}</span>
          <span className="admin-role-badge">{savedUser.role}</span>
          <button className="logout-btn" onClick={handleLogout}>Chiqish</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === "foods" ? "active" : ""}`} onClick={() => setTab("foods")}>🍜 Taomlar</button>
        <button className={`admin-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          📋 Buyurtmalar {newOrderCount > 0 && <span className="tab-badge">{newOrderCount}</span>}
        </button>
        <button className={`admin-tab ${tab === "banner" ? "active" : ""}`} onClick={() => setTab("banner")}>🎨 Banner</button>
        {savedUser.role === "superadmin" && <button className={`admin-tab ${tab === "admins" ? "active" : ""}`} onClick={() => setTab("admins")}>👤 Adminlar</button>}
      </div>

      <div className="admin-content">

        {/* ══ FOODS ══ */}
        {tab === "foods" && (
          <>
            <div className="admin-section">
              <h2 className="section-title">{editId ? "✏️ Taomni tahrirlash" : "➕ Yangi taom qo'shish"}</h2>
              <form onSubmit={handleFoodSubmit} className="food-form">

                {/* Til tablar */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {LANGS.map(l => (
                    <button key={l} type="button"
                      className={`cat-chip ${activeLang === l ? "selected" : ""}`}
                      onClick={() => setActiveLang(l)}>
                      {LANG_LABELS[l]}
                    </button>
                  ))}
                </div>

                {/* Nom va tavsif — tanlangan til uchun */}
                <div className="form-grid">
                  <div className="input-group">
                    <label>Taom nomi ({activeLang.toUpperCase()}) {activeLang === "uz" && "*"}</label>
                    <input type="text"
                      placeholder={activeLang === "uz" ? "Masalan: Osh" : activeLang === "ru" ? "Например: Плов" : "Example: Pilaf"}
                      value={titles[activeLang]}
                      onChange={e => setTitles(t => ({ ...t, [activeLang]: e.target.value }))}
                      required={activeLang === "uz"}
                    />
                    {activeLang !== "uz" && titles.uz && (
                      <span style={{ fontSize: "0.75rem", color: "var(--gray)" }}>UZ: {titles.uz}</span>
                    )}
                  </div>
                  <div className="input-group">
                    <label>Narxi (so'm) *</label>
                    <input type="number" placeholder="35000" value={price} onChange={e => setPrice(e.target.value)} required />
                  </div>
                </div>

                <div className="input-group" style={{ marginBottom: 16 }}>
                  <label>Tavsif ({activeLang.toUpperCase()})</label>
                  <textarea
                    placeholder={activeLang === "uz" ? "Taom haqida..." : activeLang === "ru" ? "Описание блюда..." : "Food description..."}
                    value={descs[activeLang]}
                    onChange={e => setDescs(d => ({ ...d, [activeLang]: e.target.value }))}
                    rows={3}
                  />
                </div>

                {/* Kategoriya */}
                <div className="input-group" style={{ marginBottom: 16 }}>
                  <label>Kategoriya *</label>
                  <div className="cat-select-wrap">
                    <div className="cat-chips">
                      {categories.map((cat, idx) => (
                        <button key={idx} type="button"
                          className={`cat-chip ${selectedCat.uz === cat.uz ? "selected" : ""}`}
                          onClick={() => selectCategory(cat)}>
                          {cat[activeLang] || cat.uz}
                        </button>
                      ))}
                      <button type="button" className="cat-chip add-cat-btn"
                        onClick={() => setShowCatInput(!showCatInput)}>
                        + Yangi kategoriya
                      </button>
                    </div>

                    {/* Yangi kategoriya — 3 tilda */}
                    {showCatInput && (
                      <div style={{ background: "var(--g3)", borderRadius: 14, padding: 16, marginTop: 12 }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 10, color: "var(--g4)" }}>Yangi kategoriya — 3 tilda</p>
                        {LANGS.map(l => (
                          <div key={l} className="input-group" style={{ marginBottom: 8 }}>
                            <label>{LANG_LABELS[l]} {l === "uz" && "*"}</label>
                            <input type="text"
                              placeholder={l === "uz" ? "Masalan: Salatlar" : l === "ru" ? "Например: Салаты" : "Example: Salads"}
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
                      <p className="selected-cat-label">
                        ✅ Tanlandi: <strong>{selectedCat.uz}</strong>
                        {selectedCat.ru && selectedCat.ru !== selectedCat.uz && ` / ${selectedCat.ru}`}
                        {selectedCat.en && selectedCat.en !== selectedCat.uz && ` / ${selectedCat.en}`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Rasm */}
                <div className="input-group" style={{ marginBottom: 16 }}>
                  <label>Rasm {!editId && "*"}</label>
                  <input type="file" accept="image/*" onChange={handleImageChange} />
                  {compressing && <p style={{ color: "var(--g)", fontSize: "0.82rem", marginTop: 4 }}>⏳ Optimallashtirilmoqda...</p>}
                  {imageFile && !uploadedUrl && (
                    <button type="button" className="btn-primary" style={{ marginTop: 10 }} onClick={handleUpload} disabled={uploading}>
                      {uploading ? "⏳ Yuklanmoqda..." : "☁️ Serverga yuklash"}
                    </button>
                  )}
                  {uploadedUrl && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#d1fae5", borderRadius: 10, fontSize: "0.85rem", color: "#065f46", fontWeight: 600 }}>
                      ✅ Rasm yuklandi!
                    </div>
                  )}
                  {imagePreview && (
                    <img src={imagePreview} alt="preview" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, border: "2px solid var(--g3)", marginTop: 10 }} />
                  )}
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={foodLoading || compressing || uploading}>
                    {foodLoading ? "Saqlanmoqda..." : editId ? "💾 Saqlash" : "➕ Qo'shish"}
                  </button>
                  {editId && <button type="button" className="btn-secondary" onClick={resetForm}>Bekor qilish</button>}
                </div>

                {!editId && (
                  <p style={{ fontSize: "0.8rem", color: "var(--gray)", marginTop: 8 }}>
                    💡 Jarayon: Barcha tillarda nom kiriting → Rasm yuklang → Qo'shish
                  </p>
                )}
              </form>
            </div>

            <div className="admin-section">
              <h2 className="section-title">📋 Mavjud taomlar ({foods.length})</h2>
              <div className="food-admin-grid">
                {foods.map(food => (
                  <div key={food._id} className="food-admin-card" onClick={() => setSelectedFood(food)}>
                    <img src={food.image || "https://placehold.co/200x120/e8f5ee/1d6b3e?text=Rasm"} alt={getFoodTitle(food)} className="food-admin-img"
                      onError={e => e.target.src = "https://placehold.co/200x120/e8f5ee/1d6b3e?text=Rasm"} />
                    <div className="food-admin-info">
                      <span className="food-admin-cat">{getFoodCat(food)}</span>
                      <h4>{getFoodTitle(food)}</h4>
                      <p className="food-admin-price">{food.price?.toLocaleString()} so'm</p>
                      <p className="food-admin-desc">{getFoodDesc(food)}</p>
                      <div className="food-admin-btns" onClick={e => e.stopPropagation()}>
                        <button className="btn-edit" onClick={() => handleEdit(food)}>✏️ Tahrirlash</button>
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
                  {s === "new" && newOrderCount > 0 && <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", padding: "1px 6px", fontSize: 11, marginLeft: 6 }}>{newOrderCount}</span>}
                </button>
              ))}
            </div>
            {ordersLoading ? <div style={{ textAlign: "center", padding: 40 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
              : orders.length === 0 ? <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Buyurtmalar yo'q</div>
              : (
                <div className="orders-list">
                  {orders.map(order => (
                    <div key={order._id} className="order-card">
                      <div className="order-card-header">
                        <div>
                          <span className="order-name">{order.customerName}</span>
                          <span className="order-phone">📞 {order.customerPhone}</span>
                          {order.address && <span className="order-address">📍 {order.address}</span>}
                          {order.location && <a className="order-address" href={`https://yandex.com/maps/?pt=${order.location.lng},${order.location.lat}&z=16&l=map`} target="_blank" rel="noreferrer">🗺 Xaritada ko'rish</a>}
                        </div>
                        <div className="order-right">
                          <span className="order-status-badge" style={{ backgroundColor: statusColor[order.status] + "22", color: statusColor[order.status] }}>{statusLabel[order.status]}</span>
                          <span className="order-date">{new Date(order.createdAt).toLocaleString("uz-UZ")}</span>
                        </div>
                      </div>
                      <div className="order-items">{order.items.map((item, i) => <span key={i} className="order-item-chip">{item.title} × {item.quantity}</span>)}</div>
                      <div className="order-card-footer">
                        <span className="order-total">Jami: <strong>{order.totalPrice?.toLocaleString()} so'm</strong></span>
                        <div className="order-actions">
                          {order.status === "new" && <button className="status-btn preparing" onClick={() => updateOrderStatus(order._id, "preparing")}>🍳 Tayyorlash</button>}
                          {order.status === "preparing" && <button className="status-btn delivered" onClick={() => updateOrderStatus(order._id, "delivered")}>✅ Yetkazildi</button>}
                          {(order.status === "new" || order.status === "preparing") && <button className="status-btn cancelled" onClick={() => updateOrderStatus(order._id, "cancelled")}>✕ Bekor</button>}
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
          <div className="admin-section">
            <h2 className="section-title">🎨 Bosh sahifa banneri</h2>
            <div className="banner-preview" style={{ background: banner.bgColor }}>
              {banner.mediaType === "image" && banner.mediaUrl && <img src={banner.mediaUrl} alt="banner" className="banner-preview-media" />}
              {banner.mediaType === "video" && banner.mediaUrl && <video src={banner.mediaUrl} autoPlay muted loop playsInline className="banner-preview-media" />}
              <div className="banner-preview-overlay" />
              <div className="banner-preview-content">
                <div className="banner-preview-title">{banner.title || "Sarlavha"}</div>
                <div className="banner-preview-subtitle">{banner.subtitle}</div>
                <div className="banner-preview-desc">{banner.description}</div>
                {banner.events?.length > 0 && <div className="banner-preview-events">{banner.events.map(ev => <span key={ev.id} className="banner-preview-event">{ev.emoji} {ev.label}</span>)}</div>}
              </div>
            </div>
            <div className="food-form" style={{ marginTop: 20 }}>
              <div className="form-grid">
                <div className="input-group"><label>Katta sarlavha</label><input type="text" value={banner.title} onChange={e => setBanner(b => ({ ...b, title: e.target.value }))} /></div>
                <div className="input-group"><label>Kichik sarlavha</label><input type="text" value={banner.subtitle} onChange={e => setBanner(b => ({ ...b, subtitle: e.target.value }))} /></div>
                <div className="input-group"><label>Tavsif</label><input type="text" value={banner.description} onChange={e => setBanner(b => ({ ...b, description: e.target.value }))} /></div>
                <div className="input-group">
                  <label>Fon rangi</label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input type="color" value={banner.bgColor} onChange={e => setBanner(b => ({ ...b, bgColor: e.target.value }))} style={{ width: 50, height: 38, border: "none", cursor: "pointer", borderRadius: 8 }} />
                    <input type="text" value={banner.bgColor} onChange={e => setBanner(b => ({ ...b, bgColor: e.target.value }))} style={{ flex: 1 }} />
                  </div>
                </div>
              </div>
              <div className="input-group" style={{ marginTop: 16 }}>
                <label>Media turi</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {["none", "image", "video"].map(type => (
                    <button key={type} type="button" className={`cat-chip ${banner.mediaType === type ? "selected" : ""}`} onClick={() => setBanner(b => ({ ...b, mediaType: type }))}>
                      {type === "none" ? "🚫 Yo'q" : type === "image" ? "🖼 Rasm" : "🎬 Video"}
                    </button>
                  ))}
                </div>
              </div>
              {banner.mediaType !== "none" && (
                <div className="input-group" style={{ marginTop: 12 }}>
                  <label>Fayl yuklash yoki URL</label>
                  <input type="file" accept={banner.mediaType === "image" ? "image/*" : "video/*"} onChange={e => setBannerFile(e.target.files[0])} />
                  <input type="text" placeholder="Yoki URL kiriting..." value={banner.mediaUrl} onChange={e => setBanner(b => ({ ...b, mediaUrl: e.target.value }))} style={{ marginTop: 8 }} />
                </div>
              )}
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "#6b7c6b", display: "block", marginBottom: 10 }}>🎪 Eventlar</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {banner.events?.map(ev => (
                    <span key={ev.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#e8f5ee", padding: "5px 12px", borderRadius: 20, fontSize: "0.85rem", color: "#0d4a28" }}>
                      {ev.emoji} {ev.label}
                      <button onClick={() => removeEvent(ev.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e53e3e", fontSize: 14 }}>✕</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder="🔥" value={newEvent.emoji} onChange={e => setNewEvent(n => ({ ...n, emoji: e.target.value }))} style={{ width: 70 }} />
                  <input type="text" placeholder="Chegirma 20%..." value={newEvent.label} onChange={e => setNewEvent(n => ({ ...n, label: e.target.value }))} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addEvent())} style={{ flex: 1 }} />
                  <button type="button" className="btn-primary" onClick={addEvent}>+ Qo'shish</button>
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: 20 }}>
                <button type="button" className="btn-primary" onClick={handleBannerSave} disabled={bannerLoading}>{bannerLoading ? "Saqlanmoqda..." : "💾 Bannerni saqlash"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ ADMINS ══ */}
        {tab === "admins" && savedUser.role === "superadmin" && (
          <div className="admin-section">
            <h2 className="section-title">👤 Admin yaratish</h2>
            <form onSubmit={handleCreateAdmin} className="food-form" style={{ maxWidth: 420 }}>
              <div className="input-group"><label>Username *</label><input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required /></div>
              <div className="input-group"><label>Parol *</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></div>
              <div className="input-group"><label>Rol</label><select value={newRole} onChange={e => setNewRole(e.target.value)}><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select></div>
              <button type="submit" className="btn-primary">➕ Admin yaratish</button>
            </form>
            <h2 className="section-title" style={{ marginTop: 32 }}>Adminlar ro'yxati</h2>
            <div className="admins-list">
              {admins.map(adm => (
                <div key={adm._id} className="admin-row">
                  <div className="admin-avatar">{adm.username[0].toUpperCase()}</div>
                  <div><p className="admin-row-name">{adm.username}</p><p className="admin-row-role">{adm.role}</p></div>
                  {adm.username !== savedUser.username && <button className="btn-delete" style={{ marginLeft: "auto", flex: "none" }} onClick={() => handleDeleteAdmin(adm._id)}>🗑</button>}
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
            <img src={selectedFood.image || "https://placehold.co/400x200/e8f5ee/1d6b3e?text=Rasm"} alt={getFoodTitle(selectedFood)} className="modal-img"
              onError={e => e.target.src = "https://placehold.co/400x200/e8f5ee/1d6b3e?text=Rasm"} />
            <div className="modal-body">
              <span className="food-admin-cat">{getFoodCat(selectedFood)}</span>
              <h2 className="modal-title">{getFoodTitle(selectedFood)}</h2>
              <p className="modal-price">{selectedFood.price?.toLocaleString()} so'm</p>
              <p className="modal-desc">{getFoodDesc(selectedFood)}</p>
              <div className="modal-actions">
                <button className="btn-edit" onClick={() => handleEdit(selectedFood)}>✏️ Tahrirlash</button>
                <button className="btn-delete" onClick={() => handleDelete(selectedFood._id)}>🗑 O'chirish</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}