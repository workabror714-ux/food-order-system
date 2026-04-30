import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const STATUS_LABEL = {
  uz: { new: "Yangi", preparing: "Tayyorlanmoqda", delivered: "Yetkazildi", cancelled: "Bekor qilindi" },
  ru: { new: "Новый", preparing: "Готовится", delivered: "Доставлено", cancelled: "Отменён" },
  en: { new: "New", preparing: "Preparing", delivered: "Delivered", cancelled: "Cancelled" },
};
const STATUS_COLOR = { new: "#3b82f6", preparing: "#f59e0b", delivered: "#10b981", cancelled: "#ef4444" };

// Til matnlari
const T = {
  uz: {
    profile: "Profil", orders: "Buyurtmalar", addresses: "Manzillar",
    name: "Ism Familiya", phone: "Telefon raqam", email: "Email (ixtiyoriy)",
    note: "Izoh (ixtiyoriy)", save: "✅ Saqlash", cancel: "Bekor qilish",
    edit: "✏️ Tahrirlash", fill: "✏️ Profilni to'ldirish", clear: "🗑 Profilni tozalash",
    guest: "Mehmon", noPhone: "Telefon raqam kiritilmagan",
    noOrders: "Hali buyurtma yo'q", goMenu: "Menyuga o'tish",
    noAddresses: "Saqlangan manzil yo'q", addAddr: "+ Manzil qo'shish",
    addrLabel: "Nom", addrFull: "To'liq manzil", gps: "📍 GPS orqali aniqlash",
    gpsLoading: "⏳ GPS aniqlanmoqda...", addrSave: "✅ Saqlash",
    total: "Jami to'lov", backToMenu: "← Menyuga qaytish",
    personalInfo: "👤 Shaxsiy ma'lumotlar", deliveryAddr: "📍 Yetkazib berish manzili",
    namePlaceholder: "Isim Familiya", emailPlaceholder: "email@gmail.com",
    notePlaceholder: "Qo'shimcha ma'lumot...", addrLabelPlaceholder: "Uy, Ofis, Do'kon...",
    addrPlaceholder: "Ko'cha, uy raqami...", clearConfirm: "Profilni tozalashni tasdiqlaysizmi?",
    language: "Til",
  },
  ru: {
    profile: "Профиль", orders: "Заказы", addresses: "Адреса",
    name: "Имя Фамилия", phone: "Номер телефона", email: "Email (необязательно)",
    note: "Заметка (необязательно)", save: "✅ Сохранить", cancel: "Отмена",
    edit: "✏️ Редактировать", fill: "✏️ Заполнить профиль", clear: "🗑 Очистить профиль",
    guest: "Гость", noPhone: "Номер телефона не указан",
    noOrders: "Заказов пока нет", goMenu: "Перейти в меню",
    noAddresses: "Нет сохранённых адресов", addAddr: "+ Добавить адрес",
    addrLabel: "Название", addrFull: "Полный адрес", gps: "📍 Определить через GPS",
    gpsLoading: "⏳ Определение GPS...", addrSave: "✅ Сохранить",
    total: "Итого", backToMenu: "← В меню",
    personalInfo: "👤 Личные данные", deliveryAddr: "📍 Адрес доставки",
    namePlaceholder: "Имя Фамилия", emailPlaceholder: "email@gmail.com",
    notePlaceholder: "Дополнительная информация...", addrLabelPlaceholder: "Дом, Офис, Магазин...",
    addrPlaceholder: "Улица, номер дома...", clearConfirm: "Подтвердите очистку профиля",
    language: "Язык",
  },
  en: {
    profile: "Profile", orders: "Orders", addresses: "Addresses",
    name: "Full Name", phone: "Phone number", email: "Email (optional)",
    note: "Note (optional)", save: "✅ Save", cancel: "Cancel",
    edit: "✏️ Edit", fill: "✏️ Fill Profile", clear: "🗑 Clear Profile",
    guest: "Guest", noPhone: "Phone number not entered",
    noOrders: "No orders yet", goMenu: "Go to Menu",
    noAddresses: "No saved addresses", addAddr: "+ Add Address",
    addrLabel: "Label", addrFull: "Full Address", gps: "📍 Detect via GPS",
    gpsLoading: "⏳ Detecting GPS...", addrSave: "✅ Save",
    total: "Total", backToMenu: "← Back to Menu",
    personalInfo: "👤 Personal Info", deliveryAddr: "📍 Delivery Address",
    namePlaceholder: "First Last Name", emailPlaceholder: "email@gmail.com",
    notePlaceholder: "Additional info...", addrLabelPlaceholder: "Home, Office, Shop...",
    addrPlaceholder: "Street, house number...", clearConfirm: "Confirm clearing profile?",
    language: "Language",
  },
};

const getLang = () => localStorage.getItem("lang") || "uz";
const setLangStore = (l) => { localStorage.setItem("lang", l); window.dispatchEvent(new Event("langChanged")); };
const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "{}"); } catch { return {}; } };
const saveProfile = (p) => { localStorage.setItem("profile", JSON.stringify(p)); window.dispatchEvent(new Event("profileUpdated")); };
const getAddresses = () => { try { return JSON.parse(localStorage.getItem("savedAddresses") || "[]"); } catch { return []; } };
const saveAddresses = (a) => localStorage.setItem("savedAddresses", JSON.stringify(a));

// Telefon formatlash — +998 XX XXX XX XX
const formatPhone = (val) => {
  const digits = val.replace(/\D/g, "").replace(/^998/, "");
  const limited = digits.slice(0, 9);
  let result = "";
  if (limited.length > 0) result += limited.slice(0, 2);
  if (limited.length > 2) result += " " + limited.slice(2, 5);
  if (limited.length > 5) result += " " + limited.slice(5, 7);
  if (limited.length > 7) result += " " + limited.slice(7, 9);
  return result;
};

const rawPhone = (formatted) => "+998" + formatted.replace(/\s/g, "");

export default function ProfilePage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(getLang);
  const [tab, setTab] = useState("profile");
  const [profile, setProfileState] = useState(getProfile);
  const [editing, setEditing] = useState(!getProfile().name);
  const [form, setForm] = useState(() => {
    const p = getProfile();
    const phoneDigits = p.phone ? p.phone.replace("+998", "").replace(/\D/g, "") : "";
    return { ...p, phoneFormatted: formatPhone(phoneDigits) };
  });
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [addresses, setAddresses] = useState(getAddresses);
  const [newAddr, setNewAddr] = useState({ label: "", address: "" });
  const [addingAddr, setAddingAddr] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const t = T[lang];
  const statusLabel = STATUS_LABEL[lang];

  useEffect(() => {
    const onLang = () => setLang(getLang());
    window.addEventListener("langChanged", onLang);
    return () => window.removeEventListener("langChanged", onLang);
  }, []);

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

  const handlePhoneInput = (val) => {
    const formatted = formatPhone(val);
    setForm(f => ({ ...f, phoneFormatted: formatted }));
  };

  const saveProfileData = () => {
    if (!form.name?.trim()) { alert(lang === "uz" ? "Ismingizni kiriting!" : lang === "ru" ? "Введите имя!" : "Enter your name!"); return; }
    const digits = form.phoneFormatted?.replace(/\s/g, "") || "";
    if (digits.length !== 9) {
      alert(lang === "uz" ? "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak!" : lang === "ru" ? "Номер телефона должен содержать 9 цифр!" : "Phone number must be 9 digits!");
      return;
    }
    const fullPhone = rawPhone(form.phoneFormatted);
    const saved = { ...form, phone: fullPhone };
    delete saved.phoneFormatted;
    saveProfile(saved);
    setProfileState(saved);
    setEditing(false);
  };

  const changeLang = (l) => { setLang(l); setLangStore(l); };

  const getGPS = () => {
    setGpsLoading(true);
    if (!navigator.geolocation) { setGpsLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=uz,ru`);
          const data = await res.json();
          if (data.display_name) setNewAddr(a => ({ ...a, address: data.display_name }));
        } catch {}
        setGpsLoading(false);
      },
      () => { setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const addAddress = () => {
    if (!newAddr.label.trim() || !newAddr.address.trim()) return;
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

  const displayPhone = profile.phone
    ? profile.phone.replace("+998", "+998 ").replace(/(\+998 )(\d{2})(\d{3})(\d{2})(\d{2})/, "$1$2 $3 $4 $5")
    : t.noPhone;

  return (
    <div className="cp-root">
      {/* HEADER */}
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => navigate("/")}>← {t.backToMenu}</button>
        <span className="cp-header-title">{t.profile}</span>
        {/* Til tanlash */}
        <div className="pf-lang-switcher">
          {["uz", "ru", "en"].map(l => (
            <button key={l} className={`pf-lang-btn ${lang === l ? "active" : ""}`}
              onClick={() => changeLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="cp-body" style={{ maxWidth: 640 }}>

        {/* AVATAR HERO */}
        <div className="pf-hero">
          <div className="pf-avatar">{initials}</div>
          <div className="pf-hero-info">
            <div className="pf-hero-name">{profile.name || t.guest}</div>
            <div className="pf-hero-phone">{displayPhone}</div>
          </div>
        </div>

        {/* TABS */}
        <div className="pf-tabs">
          {[
            { key: "profile", label: `👤 ${t.profile}` },
            { key: "orders", label: `📋 ${t.orders}` },
            { key: "addresses", label: `📍 ${t.addresses}` },
          ].map(tb => (
            <button key={tb.key}
              className={`pf-tab ${tab === tb.key ? "active" : ""}`}
              onClick={() => setTab(tb.key)}>
              {tb.label}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ── */}
        {tab === "profile" && (
          <div className="pf-card">
            {!editing ? (
              <>
                <div className="pf-info-row">
                  <span className="pf-info-label">👤 {t.name}</span>
                  <span className="pf-info-val">{profile.name || "—"}</span>
                </div>
                <div className="pf-info-row">
                  <span className="pf-info-label">📞 {t.phone}</span>
                  <span className="pf-info-val">{displayPhone}</span>
                </div>
                {profile.email && (
                  <div className="pf-info-row">
                    <span className="pf-info-label">📧 Email</span>
                    <span className="pf-info-val">{profile.email}</span>
                  </div>
                )}
                <button className="cp-next-btn" style={{ marginTop: 16 }}
                  onClick={() => {
                    const phoneDigits = profile.phone ? profile.phone.replace("+998", "").replace(/\D/g, "") : "";
                    setForm({ ...profile, phoneFormatted: formatPhone(phoneDigits) });
                    setEditing(true);
                  }}>
                  {profile.name ? t.edit : t.fill}
                </button>
                {profile.name && (
                  <button className="cp-continue-btn" style={{ marginTop: 8 }}
                    onClick={() => { if (window.confirm(t.clearConfirm)) { localStorage.removeItem("profile"); setProfileState({}); setForm({ phoneFormatted: "" }); setEditing(true); } }}>
                    {t.clear}
                  </button>
                )}
              </>
            ) : (
              <div className="cp-form">
                <div className="cp-form-section-title">{t.personalInfo}</div>

                <div className="cp-form-field">
                  <label>{t.name} *</label>
                  <input type="text" placeholder={t.namePlaceholder}
                    value={form.name || ""}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                {/* Telefon — +998 prefix bilan */}
                <div className="cp-form-field">
                  <label>{t.phone} *</label>
                  <div className="pf-phone-wrap">
                    <span className="pf-phone-prefix">+998</span>
                    <input
                      type="tel"
                      className="pf-phone-input"
                      placeholder="90 123 45 67"
                      value={form.phoneFormatted || ""}
                      onChange={e => handlePhoneInput(e.target.value)}
                      maxLength={12}
                    />
                  </div>
                  <span className="cp-field-hint">
                    {form.phoneFormatted?.replace(/\s/g, "").length || 0}/9 {lang === "uz" ? "raqam" : lang === "ru" ? "цифр" : "digits"}
                  </span>
                </div>

                <div className="cp-form-field">
                  <label>{t.email}</label>
                  <input type="email" placeholder={t.emailPlaceholder}
                    value={form.email || ""}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>

                <div className="cp-form-field">
                  <label>{t.note}</label>
                  <input type="text" placeholder={t.notePlaceholder}
                    value={form.note || ""}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                </div>

                <button className="cp-next-btn" onClick={saveProfileData}>{t.save}</button>
                {profile.name && (
                  <button className="cp-continue-btn" onClick={() => setEditing(false)}>{t.cancel}</button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {tab === "orders" && (
          <>
            {!profile.phone ? (
              <div className="pf-card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12 }}>📋</div>
                <p style={{ fontWeight: 700, marginBottom: 16 }}>{t.noOrders}</p>
                <button className="cp-next-btn" onClick={() => { setTab("profile"); setEditing(true); }}>
                  👤 {t.fill}
                </button>
              </div>
            ) : ordersLoading ? (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="spinner" style={{ margin: "0 auto" }} />
              </div>
            ) : orders.length === 0 ? (
              <div className="pf-card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12, opacity: 0.3 }}>🛒</div>
                <p style={{ fontWeight: 700, color: "var(--g4)", marginBottom: 16 }}>{t.noOrders}</p>
                <button className="cp-next-btn" onClick={() => navigate("/")}>{t.goMenu}</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {orders.map(order => (
                  <div key={order._id} className="pf-order-card">
                    <div className="pf-order-header">
                      <span className="pf-order-date">🗓 {new Date(order.createdAt).toLocaleString(lang === "uz" ? "uz-UZ" : lang === "ru" ? "ru-RU" : "en-US")}</span>
                      <span style={{
                        color: STATUS_COLOR[order.status] || "#888",
                        background: (STATUS_COLOR[order.status] || "#888") + "18",
                        padding: "3px 12px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 700
                      }}>
                        {statusLabel[order.status] || order.status}
                      </span>
                    </div>
                    <div className="pf-order-items">
                      {order.items.map((item, i) => (
                        <span key={i} className="cp-summary-chip">{item.title} × {item.quantity}</span>
                      ))}
                    </div>
                    {order.address && (
                      <div style={{ fontSize: "0.82rem", color: "var(--gray)", marginTop: 6 }}>📍 {order.address}</div>
                    )}
                    <div className="pf-order-total">
                      {t.total}: <strong>{order.totalPrice?.toLocaleString()} so'm</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ADDRESSES TAB ── */}
        {tab === "addresses" && (
          <>
            {addresses.length === 0 && !addingAddr ? (
              <div className="pf-card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12, opacity: 0.3 }}>📍</div>
                <p style={{ fontWeight: 700, color: "var(--g4)", marginBottom: 16 }}>{t.noAddresses}</p>
                <button className="cp-next-btn" onClick={() => setAddingAddr(true)}>{t.addAddr}</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {addresses.map(addr => (
                    <div key={addr.id} className="pf-addr-card">
                      <div>
                        <div className="pf-addr-label">📍 {addr.label}</div>
                        <div className="pf-addr-text">{addr.address}</div>
                      </div>
                      <button onClick={() => removeAddress(addr.id)}
                        className="cp-item-remove" style={{ fontSize: "1.1rem" }}>🗑</button>
                    </div>
                  ))}
                </div>
                {!addingAddr && (
                  <button className="cp-continue-btn" style={{ marginTop: 12 }}
                    onClick={() => setAddingAddr(true)}>{t.addAddr}</button>
                )}
              </>
            )}

            {addingAddr && (
              <div className="pf-card" style={{ marginTop: 12 }}>
                <div className="cp-form-section-title" style={{ marginBottom: 14 }}>📍 {t.deliveryAddr}</div>
                <div className="cp-form-field">
                  <label>{t.addrLabel} *</label>
                  <input type="text" placeholder={t.addrLabelPlaceholder}
                    value={newAddr.label} onChange={e => setNewAddr(a => ({ ...a, label: e.target.value }))} />
                </div>
                <button type="button" className="cp-gps-btn" onClick={getGPS} disabled={gpsLoading}
                  style={{ marginBottom: 8 }}>
                  {gpsLoading ? t.gpsLoading : t.gps}
                </button>
                <div className="cp-form-field">
                  <label>{t.addrFull} *</label>
                  <input type="text" placeholder={t.addrPlaceholder}
                    value={newAddr.address} onChange={e => setNewAddr(a => ({ ...a, address: e.target.value }))} />
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button className="cp-next-btn" style={{ flex: 1 }} onClick={addAddress}>{t.addrSave}</button>
                  <button className="cp-continue-btn" style={{ flex: 1 }}
                    onClick={() => { setAddingAddr(false); setNewAddr({ label: "", address: "" }); }}>
                    {t.cancel}
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