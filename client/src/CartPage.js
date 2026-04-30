import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (cart) => {
  localStorage.setItem("cart", JSON.stringify(cart));
  window.dispatchEvent(new Event("cartUpdated"));
};
const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "{}"); } catch { return {}; } };
const getSavedAddresses = () => { try { return JSON.parse(localStorage.getItem("savedAddresses") || "[]"); } catch { return []; } };

// Telefon formatlash — faqat 9 ta raqam, +998 prefix
const formatPhone = (val) => {
  const digits = val.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
  let r = "";
  if (digits.length > 0) r += digits.slice(0, 2);
  if (digits.length > 2) r += " " + digits.slice(2, 5);
  if (digits.length > 5) r += " " + digits.slice(5, 7);
  if (digits.length > 7) r += " " + digits.slice(7, 9);
  return r;
};
const rawPhone = (f) => "+998" + f.replace(/\s/g, "");
const isPhoneValid = (f) => f.replace(/\s/g, "").length === 9;

export default function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(getCart);
  const [step, setStep] = useState("cart");
  const [form, setForm] = useState(() => {
    const p = getProfile();
    const ph = p.phone ? p.phone.replace("+998", "").replace(/\D/g, "") : "";
    return { name: p.name || "", phoneFormatted: formatPhone(ph), address: "" };
  });
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState(getSavedAddresses);
  const [showAddrPicker, setShowAddrPicker] = useState(false);

  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  useEffect(() => { saveCart(cart); }, [cart]);
  useEffect(() => { setSavedAddresses(getSavedAddresses()); }, [step]);

  const changeQty = (id, delta) =>
    setCart(prev => prev.map(i => i._id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  const removeItem = (id) => setCart(prev => prev.filter(i => i._id !== id));

  const getLocation = () => {
    setLocationError("");
    setLocationLoading(true);
    if (!navigator.geolocation) { setLocationError("GPS qo'llab-quvvatlanmaydi"); setLocationLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setLocation({ lat, lng });
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=uz,ru`);
          const data = await res.json();
          if (data.display_name) setForm(f => ({ ...f, address: data.display_name }));
        } catch {}
        setLocationLoading(false);
      },
      () => { setLocationError("GPS ruxsat berilmadi."); setLocationLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    if (!isPhoneValid(form.phoneFormatted)) {
      alert("Telefon raqam to'liq emas! +998 dan keyin 9 ta raqam kiriting.");
      return;
    }
    setOrderLoading(true);
    try {
      const fullPhone = rawPhone(form.phoneFormatted);
      const res = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name,
          customerPhone: fullPhone,
          address: form.address,
          location,
          items: cart.map(i => ({ foodId: i._id, title: i.title, price: i.price, quantity: i.qty })),
          totalPrice,
        }),
      });
      if (res.ok) {
        const p = getProfile();
        if (!p.name) {
          localStorage.setItem("profile", JSON.stringify({ ...p, name: form.name, phone: fullPhone }));
        }
        localStorage.removeItem("cart");
        window.dispatchEvent(new Event("cartUpdated"));
        setCart([]);
        setStep("success");
      } else { alert("Xatolik yuz berdi."); }
    } catch { alert("Server bilan bog'lanishda xatolik."); }
    finally { setOrderLoading(false); }
  };

  if (step === "success") return (
    <div className="cp-success">
      <div className="cp-success-icon">🎉</div>
      <h2 className="cp-success-title">Buyurtma qabul qilindi!</h2>
      <p className="cp-success-sub">Tez orada siz bilan bog'lanamiz.</p>
      <button className="cp-success-btn" onClick={() => navigate("/")}>Menyuga qaytish</button>
      <button className="cp-continue-btn" style={{ marginTop: 8, borderRadius: 14, padding: "12px 24px" }}
        onClick={() => navigate("/orders")}>📋 Buyurtmamni kuzatish</button>
    </div>
  );

  return (
    <div className="cp-root">
      <div className="cp-header">
        <button className="cp-back-btn"
          onClick={() => step === "form" ? setStep("cart") : navigate(-1)}>← Orqaga</button>
        <span className="cp-header-title">
          {step === "cart" ? `Savat (${totalItems} ta)` : "Buyurtma ma'lumotlari"}
        </span>
        <button className="cp-back-btn" onClick={() => navigate("/profile")}>👤</button>
      </div>

      {step === "cart" && (
        <div className="cp-body">
          {cart.length === 0 ? (
            <div className="cp-empty">
              <div className="cp-empty-icon">🛒</div>
              <p className="cp-empty-title">Savat bo'sh</p>
              <button className="cp-empty-btn" onClick={() => navigate("/")}>Menyuga o'tish</button>
            </div>
          ) : (
            <>
              <div className="cp-items">
                {cart.map(item => (
                  <div key={item._id} className="cp-item">
                    <img src={item.image?.startsWith("http") ? item.image : `${API}${item.image}`}
                      alt={item.title} className="cp-item-img"
                      onError={e => e.target.src = "https://placehold.co/80/e8f5ee/1d6b3e?text=+"}
                    />
                    <div className="cp-item-info">
                      <p className="cp-item-title">{item.title}</p>
                      <p className="cp-item-price">{item.price.toLocaleString()} so'm</p>
                    </div>
                    <div className="cp-item-right">
                      <div className="cp-item-qty">
                        <button onClick={() => changeQty(item._id, -1)}>−</button>
                        <span>{item.qty}</span>
                        <button onClick={() => changeQty(item._id, 1)}>+</button>
                      </div>
                      <p className="cp-item-total">{(item.price * item.qty).toLocaleString()} so'm</p>
                      <button className="cp-item-remove" onClick={() => removeItem(item._id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cp-total-block">
                <div className="cp-total-row">
                  <span>Mahsulotlar ({totalItems} ta)</span>
                  <span>{totalPrice.toLocaleString()} so'm</span>
                </div>
                <div className="cp-total-row big">
                  <span>Jami:</span>
                  <strong>{totalPrice.toLocaleString()} so'm</strong>
                </div>
              </div>
              <div className="cp-footer">
                <button className="cp-next-btn" onClick={() => setStep("form")}>Buyurtma berish →</button>
                <button className="cp-continue-btn" onClick={() => navigate("/")}>← Menyuni davom ettirish</button>
              </div>
            </>
          )}
        </div>
      )}

      {step === "form" && (
        <div className="cp-body">
          <form className="cp-form" onSubmit={handleOrder}>
            <div className="cp-order-summary">
              <p className="cp-summary-label">📋 Buyurtma</p>
              <div className="cp-summary-items">
                {cart.map(i => <span key={i._id} className="cp-summary-chip">{i.title} × {i.qty}</span>)}
              </div>
              <p className="cp-summary-total">Jami: <strong>{totalPrice.toLocaleString()} so'm</strong></p>
            </div>

            <div className="cp-form-section-title">👤 Shaxsiy ma'lumotlar</div>

            <div className="cp-form-field">
              <label>Ismingiz *</label>
              <input type="text" placeholder="Isim Familiya" required
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>

            {/* Telefon — +998 prefix qotib turadi */}
            <div className="cp-form-field">
              <label>Telefon raqam *</label>
              <div className="pf-phone-wrap">
                <span className="pf-phone-prefix">+998</span>
                <input
                  type="tel"
                  className="pf-phone-input"
                  placeholder="90 123 45 67"
                  value={form.phoneFormatted}
                  onChange={e => setForm({ ...form, phoneFormatted: formatPhone(e.target.value) })}
                  maxLength={12}
                  required
                />
              </div>
              <span className="cp-field-hint">
                {form.phoneFormatted.replace(/\s/g, "").length}/9 raqam
                {isPhoneValid(form.phoneFormatted) ? " ✅" : ""}
              </span>
            </div>

            <div className="cp-form-section-title">📍 Yetkazib berish manzili</div>

            {savedAddresses.length > 0 && (
              <div>
                <button type="button"
                  className={`cp-gps-btn ${showAddrPicker ? "active" : ""}`}
                  onClick={() => setShowAddrPicker(!showAddrPicker)}>
                  📋 Saqlangan manzillar ({savedAddresses.length} ta)
                </button>
                {showAddrPicker && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {savedAddresses.map(addr => (
                      <button key={addr.id} type="button"
                        onClick={() => { setForm(f => ({ ...f, address: addr.address })); setShowAddrPicker(false); }}
                        style={{
                          textAlign: "left", padding: "10px 14px",
                          background: form.address === addr.address ? "#d1fae5" : "white",
                          border: `2px solid ${form.address === addr.address ? "var(--g)" : "#d4e8da"}`,
                          borderRadius: 12, cursor: "pointer",
                        }}>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>📍 {addr.label}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--gray)" }}>{addr.address}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button type="button" className={`cp-gps-btn ${location ? "active" : ""}`}
              onClick={getLocation} disabled={locationLoading}>
              {locationLoading ? <><span className="cp-gps-spin">⏳</span> GPS aniqlanmoqda...</>
                : location ? <><span>✅</span> GPS ulandi</>
                : <><span>📍</span> GPS orqali manzilni aniqlash</>}
            </button>

            {location && (
              <a href={`https://yandex.com/maps/?pt=${location.lng},${location.lat}&z=16&l=map`}
                target="_blank" rel="noreferrer" className="cp-map-link">
                🗺 Yandex xaritada ko'rish →
              </a>
            )}

            {locationError && <p className="cp-location-error">⚠️ {locationError}</p>}

            <div className="cp-form-field">
              <label>To'liq manzil *</label>
              <input type="text" required placeholder="Ko'cha, uy raqami..."
                value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>

            <button type="submit" className="cp-submit-btn" disabled={orderLoading}>
              {orderLoading ? <><span className="cp-gps-spin">⏳</span> Yuborilmoqda...</>
                : "✅ Buyurtmani tasdiqlash"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}