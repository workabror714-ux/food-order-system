import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const STATUS_LABEL = { new: "Yangi", preparing: "Tayyorlanmoqda", delivered: "Yetkazildi", cancelled: "Bekor qilindi" };
const STATUS_COLOR = { new: "#3b82f6", preparing: "#f59e0b", delivered: "#10b981", cancelled: "#ef4444" };

const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "{}"); } catch { return {}; } };
const saveProfile = (p) => localStorage.setItem("profile", JSON.stringify(p));
const getAddresses = () => { try { return JSON.parse(localStorage.getItem("savedAddresses") || "[]"); } catch { return []; } };
const saveAddresses = (a) => localStorage.setItem("savedAddresses", JSON.stringify(a));

export default function ProfilePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile"); // "profile" | "orders" | "addresses"
  const [profile, setProfile] = useState(getProfile);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(getProfile);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [addresses, setAddresses] = useState(getAddresses);
  const [newAddr, setNewAddr] = useState({ label: "", address: "" });
  const [addingAddr, setAddingAddr] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const isNew = !profile.name && !profile.phone;

  useEffect(() => {
    if (tab === "orders" && profile.phone) fetchOrders();
  }, [tab]);

  const fetchOrders = async () => {
    if (!profile.phone) return;
    setOrdersLoading(true);
    try {
      const res = await fetch(`${API}/api/orders/my/${encodeURIComponent(profile.phone)}`);
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
    finally { setOrdersLoading(false); }
  };

  const saveProfileData = () => {
    if (!form.name?.trim()) { alert("Ismingizni kiriting!"); return; }
    if (!form.phone?.trim()) { alert("Telefon raqamingizni kiriting!"); return; }
    saveProfile(form);
    setProfile(form);
    setEditing(false);
  };

  // GPS manzil olish
  const getGPS = () => {
    setGpsLoading(true);
    if (!navigator.geolocation) { setGpsLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=uz,ru`
          );
          const data = await res.json();
          if (data.display_name) setNewAddr(a => ({ ...a, address: data.display_name }));
        } catch {}
        setGpsLoading(false);
      },
      () => { setGpsLoading(false); alert("GPS ruxsat berilmadi."); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const addAddress = () => {
    if (!newAddr.label.trim() || !newAddr.address.trim()) { alert("Nom va manzilni kiriting!"); return; }
    const updated = [...addresses, { id: Date.now(), ...newAddr }];
    setAddresses(updated);
    saveAddresses(updated);
    setNewAddr({ label: "", address: "" });
    setAddingAddr(false);
  };

  const removeAddress = (id) => {
    const updated = addresses.filter(a => a.id !== id);
    setAddresses(updated);
    saveAddresses(updated);
  };

  const initials = profile.name
    ? profile.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="cp-root">
      {/* HEADER */}
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => navigate("/")}>← Menyuga qaytish</button>
        <span className="cp-header-title">Profil</span>
        <div style={{ width: 80 }} />
      </div>

      <div className="cp-body" style={{ maxWidth: 640 }}>

        {/* AVATAR + TABS */}
        <div className="pf-hero">
          <div className="pf-avatar">{initials}</div>
          <div className="pf-hero-info">
            <div className="pf-hero-name">{profile.name || "Mehmon"}</div>
            <div className="pf-hero-phone">{profile.phone || "Telefon raqam kiritilmagan"}</div>
          </div>
        </div>

        {/* TABS */}
        <div className="pf-tabs">
          {[
            { key: "profile", label: "👤 Profil" },
            { key: "orders", label: "📋 Buyurtmalar" },
            { key: "addresses", label: "📍 Manzillar" },
          ].map(t => (
            <button key={t.key}
              className={`pf-tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ──────────────────────────────────────────── */}
        {tab === "profile" && (
          <div className="pf-card">
            {!editing ? (
              <>
                <div className="pf-info-row">
                  <span className="pf-info-label">👤 Ism</span>
                  <span className="pf-info-val">{profile.name || "—"}</span>
                </div>
                <div className="pf-info-row">
                  <span className="pf-info-label">📞 Telefon</span>
                  <span className="pf-info-val">{profile.phone || "—"}</span>
                </div>
                {profile.email && (
                  <div className="pf-info-row">
                    <span className="pf-info-label">📧 Email</span>
                    <span className="pf-info-val">{profile.email}</span>
                  </div>
                )}
                {profile.note && (
                  <div className="pf-info-row">
                    <span className="pf-info-label">📝 Izoh</span>
                    <span className="pf-info-val">{profile.note}</span>
                  </div>
                )}
                <button className="cp-next-btn" style={{ marginTop: 16 }}
                  onClick={() => { setForm(profile); setEditing(true); }}>
                  ✏️ {isNew ? "Profilni to'ldirish" : "Tahrirlash"}
                </button>
                {!isNew && (
                  <button className="cp-continue-btn" style={{ marginTop: 8 }}
                    onClick={() => { if (window.confirm("Profilni tozalashni tasdiqlaysizmi?")) { localStorage.removeItem("profile"); setProfile({}); setForm({}); } }}>
                    🗑 Profilni tozalash
                  </button>
                )}
              </>
            ) : (
              <div className="cp-form">
                <div className="cp-form-section-title">👤 Shaxsiy ma'lumotlar</div>
                <div className="cp-form-field">
                  <label>Ism Familiya *</label>
                  <input type="text" placeholder="Sardor Karimov" value={form.name || ""}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="cp-form-field">
                  <label>Telefon raqam *</label>
                  <input type="tel" placeholder="+998 90 000 00 00" value={form.phone || ""}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="cp-form-field">
                  <label>Email (ixtiyoriy)</label>
                  <input type="email" placeholder="email@gmail.com" value={form.email || ""}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="cp-form-field">
                  <label>Izoh (ixtiyoriy)</label>
                  <input type="text" placeholder="Qo'shimcha ma'lumot..." value={form.note || ""}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                <button className="cp-next-btn" onClick={saveProfileData}>✅ Saqlash</button>
                <button className="cp-continue-btn" onClick={() => setEditing(false)}>Bekor qilish</button>
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS TAB ───────────────────────────────────────────── */}
        {tab === "orders" && (
          <>
            {!profile.phone ? (
              <div className="pf-card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12 }}>📋</div>
                <p style={{ fontWeight: 700, marginBottom: 8 }}>Buyurtmalarni ko'rish uchun</p>
                <p style={{ color: "var(--gray)", marginBottom: 16, fontSize: "0.9rem" }}>
                  Avval profilingizni to'ldiring
                </p>
                <button className="cp-next-btn" onClick={() => { setTab("profile"); setEditing(true); }}>
                  👤 Profilni to'ldirish
                </button>
              </div>
            ) : ordersLoading ? (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="spinner" style={{ margin: "0 auto" }} />
              </div>
            ) : orders.length === 0 ? (
              <div className="pf-card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12, opacity: 0.3 }}>🛒</div>
                <p style={{ fontWeight: 700, color: "var(--g4)" }}>Hali buyurtma yo'q</p>
                <button className="cp-next-btn" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
                  Menyuga o'tish
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {orders.map(order => (
                  <div key={order._id} className="pf-order-card">
                    <div className="pf-order-header">
                      <span className="pf-order-date">
                        🗓 {new Date(order.createdAt).toLocaleString("uz-UZ")}
                      </span>
                      <span className="pf-order-status"
                        style={{ color: STATUS_COLOR[order.status] || "#888",
                          background: (STATUS_COLOR[order.status] || "#888") + "18",
                          padding: "3px 12px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 700 }}>
                        {STATUS_LABEL[order.status] || order.status}
                      </span>
                    </div>
                    <div className="pf-order-items">
                      {order.items.map((item, i) => (
                        <span key={i} className="cp-summary-chip">{item.title} × {item.quantity}</span>
                      ))}
                    </div>
                    {order.address && (
                      <div style={{ fontSize: "0.82rem", color: "var(--gray)", marginTop: 8 }}>
                        📍 {order.address}
                      </div>
                    )}
                    <div className="pf-order-total">
                      Jami: <strong>{order.totalPrice?.toLocaleString()} so'm</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ADDRESSES TAB ────────────────────────────────────────── */}
        {tab === "addresses" && (
          <>
            {addresses.length === 0 && !addingAddr ? (
              <div className="pf-card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12, opacity: 0.3 }}>📍</div>
                <p style={{ fontWeight: 700, color: "var(--g4)", marginBottom: 8 }}>Saqlangan manzil yo'q</p>
                <p style={{ color: "var(--gray)", fontSize: "0.9rem", marginBottom: 16 }}>
                  Uy, ofis yoki boshqa manzillarni saqlang
                </p>
                <button className="cp-next-btn" onClick={() => setAddingAddr(true)}>
                  + Manzil qo'shish
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {addresses.map(addr => (
                    <div key={addr.id} className="pf-addr-card">
                      <div>
                        <div className="pf-addr-label">{addr.label}</div>
                        <div className="pf-addr-text">{addr.address}</div>
                      </div>
                      <button onClick={() => removeAddress(addr.id)} className="cp-item-remove"
                        style={{ fontSize: "1.1rem", opacity: 0.6 }} title="O'chirish">🗑</button>
                    </div>
                  ))}
                </div>
                {!addingAddr && (
                  <button className="cp-continue-btn" style={{ marginTop: 12 }}
                    onClick={() => setAddingAddr(true)}>
                    + Yangi manzil qo'shish
                  </button>
                )}
              </>
            )}

            {/* Yangi manzil qo'shish formasi */}
            {addingAddr && (
              <div className="pf-card" style={{ marginTop: 12 }}>
                <div className="cp-form-section-title" style={{ marginBottom: 14 }}>📍 Yangi manzil</div>
                <div className="cp-form-field">
                  <label>Nom *</label>
                  <input type="text" placeholder="Uy, Ofis, Do'kon..." value={newAddr.label}
                    onChange={e => setNewAddr(a => ({ ...a, label: e.target.value }))} />
                </div>
                <button type="button" className={`cp-gps-btn ${gpsLoading ? "" : ""}`}
                  onClick={getGPS} disabled={gpsLoading} style={{ marginBottom: 8 }}>
                  {gpsLoading ? "⏳ GPS aniqlanmoqda..." : "📍 GPS orqali aniqlash"}
                </button>
                <div className="cp-form-field">
                  <label>To'liq manzil *</label>
                  <input type="text" placeholder="Ko'cha, uy raqami..." value={newAddr.address}
                    onChange={e => setNewAddr(a => ({ ...a, address: e.target.value }))} />
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button className="cp-next-btn" style={{ flex: 1 }} onClick={addAddress}>✅ Saqlash</button>
                  <button className="cp-continue-btn" style={{ flex: 1 }} onClick={() => { setAddingAddr(false); setNewAddr({ label: "", address: "" }); }}>
                    Bekor qilish
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}