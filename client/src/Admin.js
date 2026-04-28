import { useEffect, useState, useRef } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function Admin() {
  const token = localStorage.getItem("token");
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => { if (!token) window.location.href = "/login"; }, [token]);

  const [tab, setTab] = useState("foods");

  // ── Foods state ──────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState(null);
  const [foods, setFoods] = useState([]);
  const [editId, setEditId] = useState(null);
  const [foodLoading, setFoodLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCatInput, setShowCatInput] = useState(false);
  const [deleteCatModal, setDeleteCatModal] = useState(null);
  const [deleteCatAction, setDeleteCatAction] = useState("delete");
  const [moveToCat, setMoveToCat] = useState("");
  const [selectedFood, setSelectedFood] = useState(null);

  // ── Orders state ─────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [ordersLoading, setOrdersLoading] = useState(false);

  // ── Admins state ─────────────────────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [admins, setAdmins] = useState([]);

  // ── Banner state ─────────────────────────────────────────────────────────────
  const [banner, setBanner] = useState({
    title: "Mazali taomlar", subtitle: "eshigingizgacha 🚀",
    description: "Yangi, tez va arzon yetkazib berish",
    mediaUrl: "", mediaType: "none", bgColor: "#0d4a28", events: []
  });
  const [bannerMedia, setBannerMedia] = useState(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [newEvent, setNewEvent] = useState({ label: "", emoji: "🔥" });
  const bannerFileRef = useRef();

  const authHeaders = { Authorization: `Bearer ${token}` };

  // ── Fetch functions ───────────────────────────────────────────────────────────
  const fetchFoods = async () => {
    try {
      const res = await fetch(`${API}/api/foods`);
      if (res.ok) {
        const data = await res.json();
        setFoods(data);
        const cats = [...new Set(data.map(f => f.category))].filter(Boolean);
        setCategories(prev => [...new Set([...prev, ...cats])]);
      }
    } catch (e) { console.error(e); }
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const url = orderFilter === "all" ? `${API}/api/orders` : `${API}/api/orders?status=${orderFilter}`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.status === 401) { localStorage.clear(); window.location.href = "/login"; return; }
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
    finally { setOrdersLoading(false); }
  };

  const fetchAdmins = async () => {
    if (savedUser.role !== "superadmin") return;
    try {
      const res = await fetch(`${API}/auth/admins`, { headers: authHeaders });
      if (res.ok) setAdmins(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchBanner = async () => {
    try {
      const res = await fetch(`${API}/api/banner`);
      if (res.ok) setBanner(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchFoods(); fetchAdmins(); fetchBanner(); }, []);
  useEffect(() => { if (tab === "orders") fetchOrders(); }, [tab, orderFilter]);

  const resetForm = () => {
    setTitle(""); setPrice(""); setCategory(""); setDescription(""); setImage(null); setEditId(null);
  };

  // ── Category ──────────────────────────────────────────────────────────────────
  const addCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (!categories.includes(trimmed)) setCategories(prev => [...prev, trimmed]);
    setCategory(trimmed);
    setNewCategoryName("");
    setShowCatInput(false);
  };

  const openDeleteCatModal = (catName) => {
    const catFoods = foods.filter(f => f.category === catName);
    setDeleteCatModal({ name: catName, foods: catFoods });
    setDeleteCatAction("delete");
    setMoveToCat(categories.find(c => c !== catName) || "");
  };

  const confirmDeleteCategory = async () => {
    const { name, foods: catFoods } = deleteCatModal;
    if (catFoods.length > 0) {
      if (deleteCatAction === "delete") {
        if (!window.confirm(`"${name}" kategoriyasidagi ${catFoods.length} ta taom ham o'chiriladi. Davom etasizmi?`)) return;
        for (const food of catFoods) {
          await fetch(`${API}/api/foods/${food._id}`, { method: "DELETE", headers: authHeaders });
        }
      } else if (deleteCatAction === "move" && moveToCat) {
        for (const food of catFoods) {
          const formData = new FormData();
          formData.append("title", food.title);
          formData.append("price", food.price);
          formData.append("category", moveToCat);
          formData.append("description", food.description);
          await fetch(`${API}/api/foods/${food._id}`, { method: "PUT", headers: authHeaders, body: formData });
        }
      }
    }
    setCategories(prev => prev.filter(c => c !== name));
    if (category === name) setCategory("");
    setDeleteCatModal(null);
    fetchFoods();
  };

  // ── Food CRUD ──────────────────────────────────────────────────────────────────
  const handleFoodSubmit = async (e) => {
    e.preventDefault();
    if (!category) { alert("Kategoriya tanlang!"); return; }
    setFoodLoading(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("price", price);
      formData.append("category", category);
      formData.append("description", description);
      if (image) formData.append("image", image);
      const url = editId ? `${API}/api/foods/${editId}` : `${API}/api/foods`;
      const res = await fetch(url, { method: editId ? "PUT" : "POST", headers: authHeaders, body: formData });
      if (res.status === 401) { localStorage.clear(); window.location.href = "/login"; return; }
      const data = await res.json();
      if (res.ok) { alert(editId ? "✅ Yangilandi!" : "✅ Qo'shildi!"); resetForm(); fetchFoods(); }
      else alert(data.message || "Xatolik!");
    } catch { alert("Server bilan ulanishda xatolik!"); }
    finally { setFoodLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/api/foods/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) { setSelectedFood(null); fetchFoods(); }
  };

  const handleEdit = (food) => {
    setTitle(food.title); setPrice(food.price); setCategory(food.category);
    setDescription(food.description); setEditId(food._id); setImage(null);
    setSelectedFood(null); setTab("foods");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Orders ──────────────────────────────────────────────────────────────────────
  const updateOrderStatus = async (id, status) => {
    const res = await fetch(`${API}/api/orders/${id}/status`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchOrders();
  };

  const deleteOrder = async (id) => {
    if (!window.confirm("Buyurtmani o'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/api/orders/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) fetchOrders();
  };

  // ── Admins ──────────────────────────────────────────────────────────────────────
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/auth/create-admin`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    });
    const data = await res.json();
    if (res.ok) { alert("✅ Admin yaratildi!"); setNewUsername(""); setNewPassword(""); fetchAdmins(); }
    else alert(data.message);
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm("Adminni o'chirishni tasdiqlaysizmi?")) return;
    const res = await fetch(`${API}/auth/admins/${id}`, { method: "DELETE", headers: authHeaders });
    if (res.ok) fetchAdmins();
  };

  // ── Banner ──────────────────────────────────────────────────────────────────────
  const handleBannerSave = async () => {
    setBannerLoading(true);
    try {
      const formData = new FormData();
      formData.append("title", banner.title);
      formData.append("subtitle", banner.subtitle);
      formData.append("description", banner.description);
      formData.append("bgColor", banner.bgColor);
      formData.append("mediaType", banner.mediaType);
      formData.append("events", JSON.stringify(banner.events));
      if (bannerMedia) formData.append("media", bannerMedia);
      const res = await fetch(`${API}/api/banner`, { method: "PUT", headers: authHeaders, body: formData });
      if (res.ok) { setBanner(await res.json()); setBannerMedia(null); alert("✅ Banner saqlandi!"); }
      else alert("Xatolik!");
    } catch { alert("Server xatosi!"); }
    finally { setBannerLoading(false); }
  };

  const addEvent = () => {
    if (!newEvent.label.trim()) return;
    setBanner(b => ({ ...b, events: [...b.events, { id: Date.now(), ...newEvent }] }));
    setNewEvent({ label: "", emoji: "🔥" });
  };

  const removeEvent = (id) => setBanner(b => ({ ...b, events: b.events.filter(e => e.id !== id) }));

  const handleLogout = () => { localStorage.clear(); window.location.href = "/login"; };

  const newOrderCount = orders.filter(o => o.status === "new").length;
  const statusLabel = { new: "Yangi", preparing: "Tayyorlanmoqda", delivered: "Yetkazildi", cancelled: "Bekor" };
  const statusColor = { new: "#3b82f6", preparing: "#f59e0b", delivered: "#10b981", cancelled: "#ef4444" };
  const foodImg = (food) => food.image?.startsWith("http") ? food.image : `${API}${food.image}`;

  return (
    <div className="admin-root">
      {/* TOP BAR */}
      <div className="admin-topbar">
        <div className="admin-logo">🍃 Admin Panel</div>
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
                <div className="form-grid">
                  <div className="input-group">
                    <label>Taom nomi *</label>
                    <input type="text" placeholder="Masalan: Shashlik" value={title} onChange={e => setTitle(e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <label>Narxi (so'm) *</label>
                    <input type="number" placeholder="35000" value={price} onChange={e => setPrice(e.target.value)} required />
                  </div>
                  <div className="input-group" style={{ gridColumn: "1 / -1" }}>
                    <label>Kategoriya *</label>
                    <div className="cat-select-wrap">
                      <div className="cat-chips">
                        {categories.map(cat => (
                          <div key={cat} className="cat-chip-wrap">
                            <button type="button" className={`cat-chip ${category === cat ? "selected" : ""}`}
                              onClick={() => setCategory(cat)}>{cat}</button>
                            <button type="button" className="cat-delete-btn"
                              onClick={e => { e.stopPropagation(); openDeleteCatModal(cat); }} title="O'chirish">✕</button>
                          </div>
                        ))}
                        <button type="button" className="cat-chip add-cat-btn"
                          onClick={() => setShowCatInput(!showCatInput)}>+ Yangi kategoriya</button>
                      </div>
                      {showCatInput && (
                        <div className="cat-new-input">
                          <input type="text" placeholder="Kategoriya nomi..." value={newCategoryName}
                            onChange={e => setNewCategoryName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCategory())} autoFocus />
                          <button type="button" onClick={addCategory}>Qo'shish</button>
                        </div>
                      )}
                      {category && <p className="selected-cat-label">✅ Tanlandi: <strong>{category}</strong></p>}
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Rasm {!editId && "*"}</label>
                    <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} required={!editId} />
                  </div>
                </div>
                <div className="input-group">
                  <label>Tavsif *</label>
                  <textarea placeholder="Taom haqida qisqacha..." value={description}
                    onChange={e => setDescription(e.target.value)} required rows={3} />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={foodLoading}>
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
                  <div key={food._id} className="food-admin-card" onClick={() => setSelectedFood(food)}>
                    <img src={foodImg(food)} alt={food.title} className="food-admin-img"
                      onError={e => e.target.src = "https://placehold.co/200x120/e8f5ee/1d6b3e?text=Rasm"} />
                    <div className="food-admin-info">
                      <span className="food-admin-cat">{food.category}</span>
                      <h4>{food.title}</h4>
                      <p className="food-admin-price">{food.price?.toLocaleString()} so'm</p>
                      <p className="food-admin-desc">{food.description}</p>
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
                  {s === "new" && newOrderCount > 0 && (
                    <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", padding: "1px 6px", fontSize: 11, marginLeft: 6 }}>{newOrderCount}</span>
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
                      </div>
                      <div className="order-right">
                        <span className="order-status-badge"
                          style={{ backgroundColor: statusColor[order.status] + "22", color: statusColor[order.status] }}>
                          {statusLabel[order.status]}
                        </span>
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
                        {order.status === "new" && <button className="status-btn preparing" onClick={() => updateOrderStatus(order._id, "preparing")}>🍳 Tayyorlash</button>}
                        {order.status === "preparing" && <button className="status-btn delivered" onClick={() => updateOrderStatus(order._id, "delivered")}>✅ Yetkazildi</button>}
                        {(order.status === "new" || order.status === "preparing") && <button className="status-btn cancelled" onClick={() => updateOrderStatus(order._id, "cancelled")}>✕ Bekor</button>}
                        <button className="status-btn delete-order" onClick={() => deleteOrder(order._id)}>🗑 O'chirish</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ BANNER TAB ══ */}
        {tab === "banner" && (
          <div className="admin-section">
            <h2 className="section-title">🎨 Bosh sahifa banneri</h2>

            {/* Live preview */}
            <div className="banner-preview" style={{ background: banner.bgColor }}>
              {banner.mediaType === "image" && banner.mediaUrl && (
                <img src={banner.mediaUrl} alt="banner" className="banner-preview-media" />
              )}
              {banner.mediaType === "video" && banner.mediaUrl && (
                <video src={banner.mediaUrl} autoPlay muted loop playsInline className="banner-preview-media" />
              )}
              <div className="banner-preview-overlay" />
              <div className="banner-preview-content">
                <div>
                  <div className="banner-preview-title">{banner.title || "Sarlavha"}</div>
                  <div className="banner-preview-subtitle">{banner.subtitle || "Pastki sarlavha"}</div>
                  <div className="banner-preview-desc">{banner.description || "Tavsif"}</div>
                  {banner.events?.length > 0 && (
                    <div className="banner-preview-events">
                      {banner.events.map(ev => (
                        <span key={ev.id} className="banner-preview-event">{ev.emoji} {ev.label}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="food-form" style={{ marginTop: 20 }}>
              <div className="form-grid">
                <div className="input-group">
                  <label>Katta sarlavha *</label>
                  <input type="text" value={banner.title}
                    onChange={e => setBanner(b => ({ ...b, title: e.target.value }))}
                    placeholder="Mazali taomlar" />
                </div>
                <div className="input-group">
                  <label>Kichik sarlavha</label>
                  <input type="text" value={banner.subtitle}
                    onChange={e => setBanner(b => ({ ...b, subtitle: e.target.value }))}
                    placeholder="eshigingizgacha 🚀" />
                </div>
                <div className="input-group">
                  <label>Tavsif matni</label>
                  <input type="text" value={banner.description}
                    onChange={e => setBanner(b => ({ ...b, description: e.target.value }))}
                    placeholder="Yangi, tez va arzon..." />
                </div>
                <div className="input-group">
                  <label>Fon rangi</label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input type="color" value={banner.bgColor}
                      onChange={e => setBanner(b => ({ ...b, bgColor: e.target.value }))}
                      style={{ width: 50, height: 38, border: "none", cursor: "pointer", borderRadius: 8 }} />
                    <input type="text" value={banner.bgColor}
                      onChange={e => setBanner(b => ({ ...b, bgColor: e.target.value }))}
                      style={{ flex: 1 }} placeholder="#0d4a28" />
                  </div>
                </div>
              </div>

              {/* Media */}
              <div className="input-group" style={{ marginTop: 16 }}>
                <label>Media turi</label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {["none", "image", "video"].map(type => (
                    <button key={type} type="button"
                      className={`cat-chip ${banner.mediaType === type ? "selected" : ""}`}
                      onClick={() => setBanner(b => ({ ...b, mediaType: type }))}>
                      {type === "none" ? "🚫 Yo'q" : type === "image" ? "🖼 Rasm" : "🎬 Video"}
                    </button>
                  ))}
                </div>
              </div>

              {banner.mediaType !== "none" && (
                <div className="input-group" style={{ marginTop: 12 }}>
                  <label>{banner.mediaType === "image" ? "Rasm yuklash" : "Video yuklash"} (yoki URL)</label>
                  <input type="file"
                    ref={bannerFileRef}
                    accept={banner.mediaType === "image" ? "image/*" : "video/*"}
                    onChange={e => setBannerMedia(e.target.files[0])} />
                  <input type="text" placeholder="Yoki to'g'ridan-to'g'ri URL kiriting..."
                    value={banner.mediaUrl}
                    onChange={e => setBanner(b => ({ ...b, mediaUrl: e.target.value }))}
                    style={{ marginTop: 8 }} />
                </div>
              )}

              {/* Events */}
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "#6b7c6b", display: "block", marginBottom: 10 }}>
                  🎪 Eventlar / Aksiyalar (bannerlarda chiqadi)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {banner.events?.map(ev => (
                    <span key={ev.id} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: 20, padding: "5px 12px", fontSize: "0.85rem",
                      color: "#0d4a28", background: "#e8f5ee"
                    }}>
                      {ev.emoji} {ev.label}
                      <button onClick={() => removeEvent(ev.id)} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#e53e3e", fontSize: 14, lineHeight: 1, padding: 0
                      }}>✕</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input type="text" placeholder="Emoji" value={newEvent.emoji}
                    onChange={e => setNewEvent(n => ({ ...n, emoji: e.target.value }))}
                    style={{ width: 70 }} />
                  <input type="text" placeholder="Matn: Chegirma 20%, Trendda..."
                    value={newEvent.label}
                    onChange={e => setNewEvent(n => ({ ...n, label: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addEvent())}
                    style={{ flex: 1, minWidth: 180 }} />
                  <button type="button" className="btn-primary" onClick={addEvent}>+ Qo'shish</button>
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: 20 }}>
                <button type="button" className="btn-primary" onClick={handleBannerSave} disabled={bannerLoading}>
                  {bannerLoading ? "Saqlanmoqda..." : "💾 Bannerni saqlash"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ ADMINS ══ */}
        {tab === "admins" && savedUser.role === "superadmin" && (
          <div className="admin-section">
            <h2 className="section-title">👤 Admin yaratish</h2>
            <form onSubmit={handleCreateAdmin} className="food-form" style={{ maxWidth: 420 }}>
              <div className="input-group">
                <label>Username *</label>
                <input type="text" placeholder="admin2" value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Parol *</label>
                <input type="password" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Rol</label>
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
                  <div>
                    <p className="admin-row-name">{adm.username}</p>
                    <p className="admin-row-role">{adm.role}</p>
                  </div>
                  {adm.username !== savedUser.username && (
                    <button className="btn-delete" style={{ marginLeft: "auto", flex: "none" }}
                      onClick={() => handleDeleteAdmin(adm._id)}>🗑 O'chirish</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══ FOOD DETAIL MODAL ══ */}
      {selectedFood && (
        <div className="modal-overlay" onClick={() => setSelectedFood(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedFood(null)}>✕</button>
            <img src={foodImg(selectedFood)} alt={selectedFood.title} className="modal-img"
              onError={e => e.target.src = "https://placehold.co/400x200/e8f5ee/1d6b3e?text=Rasm"} />
            <div className="modal-body">
              <span className="food-admin-cat">{selectedFood.category}</span>
              <h2 className="modal-title">{selectedFood.title}</h2>
              <p className="modal-price">{selectedFood.price?.toLocaleString()} so'm</p>
              <p className="modal-desc">{selectedFood.description}</p>
              <p className="modal-meta">🗓 Qo'shilgan: {new Date(selectedFood.createdAt).toLocaleDateString("uz-UZ")}</p>
              <div className="modal-actions">
                <button className="btn-edit" onClick={() => handleEdit(selectedFood)}>✏️ Tahrirlash</button>
                <button className="btn-delete" onClick={() => handleDelete(selectedFood._id)}>🗑 O'chirish</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CATEGORY DELETE MODAL ══ */}
      {deleteCatModal && (
        <div className="modal-overlay" onClick={() => setDeleteCatModal(null)}>
          <div className="modal-card cat-delete-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDeleteCatModal(null)}>✕</button>
            <div className="modal-body">
              <div className="cat-del-icon">🗂</div>
              <h2 className="modal-title" style={{ fontSize: "1.2rem" }}>
                "<span style={{ color: "var(--g)" }}>{deleteCatModal.name}</span>" kategoriyasini o'chirish
              </h2>
              {deleteCatModal.foods.length === 0 ? (
                <p className="modal-desc">Bu kategoriyada taomlar yo'q. Xavfsiz o'chiriladi.</p>
              ) : (
                <>
                  <p className="modal-desc" style={{ marginBottom: 16 }}>
                    Bu kategoriyada <strong>{deleteCatModal.foods.length} ta taom</strong> bor:
                  </p>
                  <div className="cat-del-food-list">
                    {deleteCatModal.foods.map(f => <span key={f._id} className="order-item-chip">{f.title}</span>)}
                  </div>
                  <p style={{ fontWeight: 700, marginBottom: 12, marginTop: 16 }}>Bu taomlar bilan nima qilish kerak?</p>
                  <div className="cat-del-options">
                    <label className={`cat-del-option ${deleteCatAction === "delete" ? "selected" : ""}`}>
                      <input type="radio" name="catAction" value="delete"
                        checked={deleteCatAction === "delete"} onChange={() => setDeleteCatAction("delete")} />
                      <div><strong>🗑 O'chirish</strong><p>Barcha {deleteCatModal.foods.length} ta taom o'chiriladi</p></div>
                    </label>
                    <label className={`cat-del-option ${deleteCatAction === "move" ? "selected" : ""}`}>
                      <input type="radio" name="catAction" value="move"
                        checked={deleteCatAction === "move"} onChange={() => setDeleteCatAction("move")} />
                      <div><strong>📦 Ko'chirish</strong><p>Boshqa kategoriyaga o'tkazish</p></div>
                    </label>
                  </div>
                  {deleteCatAction === "move" && (
                    <div className="input-group" style={{ marginTop: 12 }}>
                      <label>Qaysi kategoriyaga ko'chirish?</label>
                      <select value={moveToCat} onChange={e => setMoveToCat(e.target.value)}>
                        {categories.filter(c => c !== deleteCatModal.name).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="modal-actions" style={{ marginTop: 20 }}>
                <button className="btn-delete" onClick={confirmDeleteCategory}>
                  {deleteCatModal.foods.length === 0 ? "✕ O'chirish"
                    : deleteCatAction === "delete" ? `🗑 ${deleteCatModal.foods.length} ta taom bilan o'chirish`
                    : "📦 Ko'chirib o'chirish"}
                </button>
                <button className="btn-secondary" onClick={() => setDeleteCatModal(null)}>Bekor qilish</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}