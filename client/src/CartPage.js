import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (cart) => {
  localStorage.setItem("cart", JSON.stringify(cart));
  // Same tab da Menu.js ga xabar berish
  window.dispatchEvent(new Event("cartUpdated"));
};

export default function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(getCart);
  const [step, setStep] = useState("cart"); // "cart" | "form" | "success"
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);

  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  useEffect(() => { saveCart(cart); }, [cart]);

  const changeQty = (id, delta) => {
    setCart(prev =>
      prev.map(i => i._id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
  };

  const removeItem = (id) => setCart(prev => prev.filter(i => i._id !== id));

  // GPS lokatsiya olish
  const getLocation = () => {
    setLocationError("");
    setLocationLoading(true);
    if (!navigator.geolocation) {
      setLocationError("GPS qo'llab-quvvatlanmaydi");
      setLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocation({ lat, lng });
        // Reverse geocoding — manzilni avtomatik to'ldirish
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=uz,ru`
          );
          const data = await res.json();
          if (data.display_name) {
            setForm(f => ({ ...f, address: data.display_name }));
          }
        } catch {}
        setLocationLoading(false);
      },
      () => {
        setLocationError("GPS ruxsat berilmadi. Manzilni qo'lda kiriting.");
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    setOrderLoading(true);
    try {
      const res = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name,
          customerPhone: form.phone,
          address: form.address,
          location,
          items: cart.map(i => ({
            foodId: i._id,
            title: i.title,
            price: i.price,
            quantity: i.qty,
          })),
          totalPrice,
        }),
      });
      if (res.ok) {
        localStorage.removeItem("cart");
        window.dispatchEvent(new Event("cartUpdated"));
        setCart([]);
        setStep("success");
      } else {
        alert("Xatolik yuz berdi. Qayta urinib ko'ring.");
      }
    } catch {
      alert("Server bilan bog'lanishda xatolik.");
    } finally {
      setOrderLoading(false);
    }
  };

  // ── SUCCESS ──────────────────────────────────────────────────
  if (step === "success") return (
    <div className="cp-success">
      <div className="cp-success-icon">🎉</div>
      <h2 className="cp-success-title">Buyurtma qabul qilindi!</h2>
      <p className="cp-success-sub">Tez orada siz bilan bog'lanamiz.</p>
      <button className="cp-success-btn" onClick={() => navigate("/")}>
        Menyuga qaytish
      </button>
    </div>
  );

  return (
    <div className="cp-root">

      {/* HEADER */}
      <div className="cp-header">
        <button
          className="cp-back-btn"
          onClick={() => step === "form" ? setStep("cart") : navigate(-1)}
        >
          ← Orqaga
        </button>
        <span className="cp-header-title">
          {step === "cart" ? `Savat (${totalItems} ta)` : "Buyurtma ma'lumotlari"}
        </span>
        <div style={{ width: 80 }} />
      </div>

      {/* ── CART STEP ─────────────────────────────────────────── */}
      {step === "cart" && (
        <div className="cp-body">
          {cart.length === 0 ? (
            <div className="cp-empty">
              <div className="cp-empty-icon">🛒</div>
              <p className="cp-empty-title">Savat bo'sh</p>
              <p className="cp-empty-sub">Taomlardan birini tanlang</p>
              <button className="cp-empty-btn" onClick={() => navigate("/")}>
                Menyuga o'tish
              </button>
            </div>
          ) : (
            <>
              <div className="cp-items">
                {cart.map(item => (
                  <div key={item._id} className="cp-item">
                    <img
                      src={item.image?.startsWith("http") ? item.image : `${API}${item.image}`}
                      alt={item.title}
                      className="cp-item-img"
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
                      <p className="cp-item-total">
                        {(item.price * item.qty).toLocaleString()} so'm
                      </p>
                      <button
                        className="cp-item-remove"
                        onClick={() => removeItem(item._id)}
                        title="O'chirish"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* TOTAL */}
              <div className="cp-total-block">
                <div className="cp-total-row">
                  <span>Mahsulotlar ({totalItems} ta)</span>
                  <span>{totalPrice.toLocaleString()} so'm</span>
                </div>
                <div className="cp-total-row big">
                  <span>Jami to'lov:</span>
                  <strong>{totalPrice.toLocaleString()} so'm</strong>
                </div>
              </div>

              <div className="cp-footer">
                <button className="cp-next-btn" onClick={() => setStep("form")}>
                  Buyurtma berish →
                </button>
                <button className="cp-continue-btn" onClick={() => navigate("/")}>
                  ← Menyuni davom ettirish
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FORM STEP ─────────────────────────────────────────── */}
      {step === "form" && (
        <div className="cp-body">
          <form className="cp-form" onSubmit={handleOrder}>

            {/* Buyurtma xulosa */}
            <div className="cp-order-summary">
              <p className="cp-summary-label">📋 Buyurtma</p>
              <div className="cp-summary-items">
                {cart.map(i => (
                  <span key={i._id} className="cp-summary-chip">
                    {i.title} × {i.qty}
                  </span>
                ))}
              </div>
              <p className="cp-summary-total">
                Jami: <strong>{totalPrice.toLocaleString()} so'm</strong>
              </p>
            </div>

            <div className="cp-form-section-title">👤 Shaxsiy ma'lumotlar</div>

            <div className="cp-form-field">
              <label>Ismingiz *</label>
              <input
                type="text"
                placeholder="Isim Familiya"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="cp-form-field">
              <label>Telefon raqam *</label>
              <input
                type="tel"
                placeholder="+998 90 000 00 00"
                required
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div className="cp-form-section-title">📍 Yetkazib berish manzili</div>

            {/* GPS tugmasi */}
            <button
              type="button"
              className={`cp-gps-btn ${location ? "active" : ""}`}
              onClick={getLocation}
              disabled={locationLoading}
            >
              {locationLoading
                ? <><span className="cp-gps-spin">⏳</span> GPS aniqlanmoqda...</>
                : location
                ? <><span>✅</span> GPS ulandi — manzil aniqlandi</>
                : <><span>📍</span> GPS orqali manzilni aniqlash</>
              }
            </button>

            {/* Yandex xarita havolasi */}
            {location && (
              <a
                href={`https://yandex.com/maps/?pt=${location.lng},${location.lat}&z=16&l=map`}
                target="_blank"
                rel="noreferrer"
                className="cp-map-link"
              >
                🗺 Yandex xaritada ko'rish →
              </a>
            )}

            {locationError && (
              <p className="cp-location-error">⚠️ {locationError}</p>
            )}

            <div className="cp-form-field">
              <label>To'liq manzil *</label>
              <input
                type="text"
                required
                placeholder="Ko'cha, uy raqami, kvartira..."
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
              />
              <span className="cp-field-hint">
                GPS bosganingizda avtomatik to'ldiriladi
              </span>
            </div>

            <button
              type="submit"
              className="cp-submit-btn"
              disabled={orderLoading}
            >
              {orderLoading
                ? <><span className="cp-gps-spin">⏳</span> Yuborilmoqda...</>
                : "✅ Buyurtmani tasdiqlash"
              }
            </button>
          </form>
        </div>
      )}
    </div>
  );
}