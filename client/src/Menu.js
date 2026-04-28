import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const CAT_EMOJI = {
  "fast food": "🍔", "burger": "🍔", "pizza": "🍕",
  "salat": "🥗", "salatlar": "🥗", "desert": "🍦", "desertlar": "🍦",
  "ichimliklar": "🥤", "napitkala": "🥤", "sho'rvalar": "🍲",
  "hamir ovqat": "🥟", "grill": "🔥", "quyuq ovqat": "🍛",
  "default": "🍽"
};
const getEmoji = (cat) => CAT_EMOJI[cat?.toLowerCase()] || CAT_EMOJI.default;

export default function Menu() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
  });
  const [activeCategory, setActiveCategory] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(false);
  const catRefs = useRef({});
  const navigate = useNavigate();

  // Cart ni localStorage ga saqlab turish
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    fetch(`${API}/api/foods`)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setFoods(arr);
        if (arr.length > 0) {
          const cats = [...new Set(arr.map(f => f.category))];
          setActiveCategory(cats[0]);
        }
        setLoading(false);
        setTimeout(() => setVisible(true), 50);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = [...new Set(foods.map(f => f.category))];
  const foodsByCategory = categories.reduce((acc, cat) => {
    acc[cat] = foods.filter(f => f.category === cat);
    return acc;
  }, {});
  const filteredFoods = search
    ? foods.filter(f => f.title.toLowerCase().includes(search.toLowerCase()))
    : null;

  const addToCart = (food, e) => {
    e?.stopPropagation();
    setCart(prev => {
      const exists = prev.find(i => i._id === food._id);
      if (exists) return prev.map(i => i._id === food._id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...food, qty: 1 }];
    });
  };
  const removeFromCart = id => setCart(prev => prev.filter(i => i._id !== id));
  const changeQty = (id, delta) => setCart(prev =>
    prev.map(i => i._id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0)
  );
  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    catRefs.current[cat]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) return (
    <div className="g-loading">
      <div className="g-spinner-wrap">
        <div className="g-spinner-ring" />
        <span className="g-spinner-emoji">🍃</span>
      </div>
      <p className="g-loading-text">Menyu yuklanmoqda...</p>
    </div>
  );

  return (
    <div className={`g-root ${visible ? "visible" : ""}`}>
      {/* HEADER */}
      <header className="g-header">
        <div className="g-header-inner">
          <div className="g-logo">
            <span className="g-logo-leaf">🍃</span>
            <div>
              <div className="g-logo-name">FreshBite</div>
              <div className="g-logo-sub">Tez yetkazib berish</div>
            </div>
          </div>
          <button className="g-cart-btn" onClick={() => setCartOpen(true)}>
            <span className="g-cart-icon-wrap">
              🛒
              {totalItems > 0 && <span className="g-cart-badge">{totalItems}</span>}
            </span>
            <div className="g-cart-info">
              <span className="g-cart-label">Savat</span>
              {totalPrice > 0 && <span className="g-cart-sum">{totalPrice.toLocaleString()} so'm</span>}
            </div>
          </button>
        </div>

        <div className="g-search-bar">
          <span>🔍</span>
          <input className="g-search-input" placeholder="Taom qidiring..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="g-search-clear" onClick={() => setSearch("")}>✕</button>}
        </div>

        {!search && (
          <div className="g-cat-tabs-wrap">
            <div className="g-cat-tabs">
              {categories.map(cat => (
                <button key={cat}
                  className={`g-cat-tab ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => scrollToCategory(cat)}>
                  <span className="g-cat-tab-emoji">{getEmoji(cat)}</span>
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {orderSuccess && (
        <div className="g-toast">
          <span>🎉</span>
          <span>Buyurtmangiz qabul qilindi! Tez orada bog'lanamiz.</span>
        </div>
      )}

      {search ? (
        <main className="g-main">
          <div className="g-section-title">
            <span>🔍 "{search}" bo'yicha natijalar ({filteredFoods.length})</span>
          </div>
          <div className="g-grid">
            {filteredFoods.length === 0
              ? <div className="g-empty">Taom topilmadi</div>
              : filteredFoods.map((food, i) => (
                  <FoodCard key={food._id} food={food} cart={cart} index={i}
                    onAdd={addToCart} onQty={changeQty} onOpen={() => navigate(`/food/${food._id}`)} />
                ))}
          </div>
        </main>
      ) : (
        <main className="g-main">
          <div className="g-hero">
            <div className="g-hero-text">
              <h1 className="g-hero-title">
                Mazali taomlar<br />
                <span className="g-hero-accent">eshigingizgacha</span> 🚀
              </h1>
              <p className="g-hero-desc">Yangi, tez va arzon yetkazib berish</p>
            </div>
            <div className="g-hero-stats">
              <div className="g-stat">
                <span className="g-stat-num">{foods.length}+</span>
                <span className="g-stat-label">Taom</span>
              </div>
              <div className="g-stat-divider" />
              <div className="g-stat">
                <span className="g-stat-num">30'</span>
                <span className="g-stat-label">Yetkazish</span>
              </div>
            </div>
          </div>

          {categories.map(cat => (
            <div key={cat} className="g-cat-section" ref={el => catRefs.current[cat] = el}>
              <div className="g-section-header">
                <span className="g-section-emoji">{getEmoji(cat)}</span>
                <h2 className="g-section-title-text">{cat}</h2>
                <span className="g-section-count">{foodsByCategory[cat].length} ta</span>
              </div>
              <div className="g-grid">
                {foodsByCategory[cat].map((food, i) => (
                  <FoodCard key={food._id} food={food} cart={cart} index={i}
                    onAdd={addToCart} onQty={changeQty} onOpen={() => navigate(`/food/${food._id}`)} />
                ))}
              </div>
            </div>
          ))}
        </main>
      )}

      {/* ══ FIXED BOTTOM CART BAR ══ */}
      {totalItems > 0 && (
        <div className="fixed-cart-bar" onClick={() => setCartOpen(true)}>
          <div className="fixed-cart-left">
            <span className="fixed-cart-count">{totalItems} ta</span>
            <span className="fixed-cart-label">Savatni ko'rish</span>
          </div>
          <span className="fixed-cart-price">{totalPrice.toLocaleString()} so'm</span>
        </div>
      )}

      {/* ══ SAVAT ══ */}
      <Cart
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        totalPrice={totalPrice}
        totalItems={totalItems}
        onQty={changeQty}
        onRemove={removeFromCart}
        onClear={() => setCart([])}
        onSuccess={() => {
          setOrderSuccess(true);
          setTimeout(() => setOrderSuccess(false), 5000);
        }}
      />
    </div>
  );
}

// ─── FOOD CARD ────────────────────────────────────────────────────────────────
function FoodCard({ food, cart, index, onAdd, onQty, onOpen }) {
  const inCart = cart.find(i => i._id === food._id);
  return (
    <div className="g-card" style={{ animationDelay: `${index * 0.06}s` }}>
      <div className="g-card-img-wrap" onClick={onOpen} style={{ cursor: "pointer" }}>
        <img src={food.image} alt={food.title} className="g-card-img"
          onError={e => e.target.src = "https://placehold.co/300x200/e8f5ee/1d6b3e?text=Rasm"} />
        {inCart && <div className="g-card-in-cart">✓ Savatda</div>}
      </div>
      <div className="g-card-body">
        <h3 className="g-card-title" onClick={onOpen} style={{ cursor: "pointer" }}>{food.title}</h3>
        <p className="g-card-desc">{food.description}</p>
        <div className="g-card-footer">
          <span className="g-card-price">{food.price.toLocaleString()} so'm</span>
          {inCart ? (
            <div className="g-qty">
              <button className="g-qty-btn minus" onClick={() => onQty(food._id, -1)}>−</button>
              <span className="g-qty-num">{inCart.qty}</span>
              <button className="g-qty-btn plus" onClick={() => onQty(food._id, 1)}>+</button>
            </div>
          ) : (
            <button className="g-add-btn" onClick={e => onAdd(food, e)}>+</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CART ─────────────────────────────────────────────────────────────────────
function Cart({ open, onClose, cart, totalPrice, totalItems, onQty, onRemove, onClear, onSuccess }) {
  const [step, setStep] = useState("items"); // "items" | "form"
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [location, setLocation] = useState(null);

  // Modal ochilganda body scroll o'chirish
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else { document.body.style.overflow = ""; setStep("items"); }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const getLocation = () => {
    setLocationLoading(true);
    navigator.geolocation?.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationLoading(false); },
      () => setLocationLoading(false)
    );
  };

  const handleOrder = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name,
          customerPhone: form.phone,
          address: form.address,
          location,
          items: cart.map(i => ({ foodId: i._id, title: i.title, price: i.price, quantity: i.qty })),
          totalPrice,
        }),
      });
      if (res.ok) {
        onClear();
        onClose();
        onSuccess();
        setForm({ name: "", phone: "", address: "" });
        setLocation(null);
      }
    } catch {}
    finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="cart-overlay" onClick={onClose}>
      <div className="cart-modal" onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div className="cart-header">
          <div>
            <h2 className="cart-title">
              {step === "items" ? "🛒 Savat" : "📝 Buyurtma"}
            </h2>
            {totalItems > 0 && step === "items" && (
              <p className="cart-subtitle">{totalItems} ta mahsulot</p>
            )}
          </div>
          <button className="cart-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* BO'SH SAVAT */}
        {cart.length === 0 ? (
          <div className="cart-empty">
            <div className="cart-empty-icon">🛒</div>
            <p className="cart-empty-title">Savat bo'sh</p>
            <p className="cart-empty-sub">Taomlardan birini tanlang</p>
            <button className="cart-empty-btn" onClick={onClose}>Menyuga qaytish</button>
          </div>
        ) : step === "items" ? (
          /* ── ITEMS ── */
          <div className="cart-body">
            <div className="cart-items">
              {cart.map(item => (
                <div key={item._id} className="cart-item">
                  <img src={item.image} alt={item.title} className="cart-item-img"
                    onError={e => e.target.src = "https://placehold.co/60/e8f5ee/1d6b3e?text=+"} />
                  <div className="cart-item-info">
                    <p className="cart-item-title">{item.title}</p>
                    <p className="cart-item-price">{item.price.toLocaleString()} so'm</p>
                  </div>
                  <div className="cart-item-right">
                    <div className="cart-item-qty">
                      <button onClick={() => onQty(item._id, -1)}>−</button>
                      <span>{item.qty}</span>
                      <button onClick={() => onQty(item._id, 1)}>+</button>
                    </div>
                    <p className="cart-item-total">{(item.price * item.qty).toLocaleString()} so'm</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-footer">
              <div className="cart-total-row">
                <span>Jami:</span>
                <span className="cart-total-sum">{totalPrice.toLocaleString()} so'm</span>
              </div>
              <button className="cart-next-btn" onClick={() => setStep("form")}>
                Buyurtma berish →
              </button>
            </div>
          </div>
        ) : (
          /* ── FORM ── */
          <div className="cart-body">
            <form className="cart-form" onSubmit={handleOrder}>
              <div className="cart-form-field">
                <label>Ismingiz *</label>
                <input type="text" placeholder="Isim Familiya" required
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="cart-form-field">
                <label>Telefon *</label>
                <input type="tel" placeholder="+998 90 000 00 00" required
                  value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="cart-form-field">
                <label>Manzil *</label>
                <input type="text" placeholder="Ko'cha, uy raqami..." required
                  value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>

              <button type="button" className={`cart-gps-btn ${location ? "active" : ""}`}
                onClick={getLocation} disabled={locationLoading}>
                {locationLoading ? "📍 Aniqlanmoqda..." :
                 location ? `✅ GPS ulandi` : "📍 GPS lokatsiya ulash"}
              </button>

              <div className="cart-form-total">
                <span>Jami to'lov:</span>
                <strong>{totalPrice.toLocaleString()} so'm</strong>
              </div>

              <div className="cart-form-actions">
                <button type="button" className="cart-back-btn" onClick={() => setStep("items")}>← Orqaga</button>
                <button type="submit" className="cart-submit-btn" disabled={loading}>
                  {loading ? "Yuborilmoqda..." : "✅ Tasdiqlash"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}