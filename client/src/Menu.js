import { useState, useEffect, useRef } from "react";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Category emoji map
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
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [orderForm, setOrderForm] = useState({ name: "", phone: "" });
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [detailFood, setDetailFood] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(false);
  const catRefs = useRef({});

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

  // Address suggestions via Nominatim (OpenStreetMap)
  useEffect(() => {
    if (!addressQuery || addressQuery.length < 3) { setAddressSuggestions([]); return; }
    const t = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressQuery)}&format=json&limit=4&accept-language=uz,ru`
        );
        const data = await res.json();
        setAddressSuggestions(data.map(d => d.display_name));
      } catch {}
      setAddressLoading(false);
    }, 500);
    return () => clearTimeout(t);
  }, [addressQuery]);

  const categories = [...new Set(foods.map(f => f.category))];

  // Group foods by category
  const foodsByCategory = categories.reduce((acc, cat) => {
    acc[cat] = foods.filter(f => f.category === cat);
    return acc;
  }, {});

  // Filtered by search
  const filteredFoods = search
    ? foods.filter(f => f.title.toLowerCase().includes(search.toLowerCase()))
    : null;

  // Cart
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

  // Scroll to category
  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    catRefs.current[cat]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Location
  const getLocation = () => {
    setLocationLoading(true);
    if (!navigator.geolocation) { setLocationLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationLoading(false); },
      () => setLocationLoading(false)
    );
  };

  // ── DETAIL MODAL — TO'G'RILANGAN ─────────────────────────────
  // BUG: avval detailFood set bo'lib keyin visible=true bo'lardi,
  // lekin React bir render ichida ikkalasini qilmasdi → chiziq ko'rinar edi
  // FIX: avval food set qilamiz, keyin keyingi frame da visible=true
  const openDetail = (food) => {
    // 1) Avval body scroll o'chirish
    document.body.style.overflow = "hidden";
    // 2) Food ni set qilamiz (modal DOM ga qo'shiladi, lekin hali visible=false → yashirin)
    setDetailFood(food);
    setDetailVisible(false);
    // 3) Ikki frame kutib visible=true — animatsiya ishlaydi
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDetailVisible(true);
      });
    });
  };

  const closeDetail = () => {
    setDetailVisible(false);
    // Animatsiya tugashini kutamiz (300ms), keyin unmount qilamiz
    setTimeout(() => {
      setDetailFood(null);
      document.body.style.overflow = "";
    }, 380);
  };

  // Order
  const handleOrder = async e => {
    e.preventDefault();
    if (!cart.length) return;
    setOrderLoading(true);
    try {
      const res = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: orderForm.name,
          customerPhone: orderForm.phone,
          address: addressQuery,
          location,
          items: cart.map(i => ({ foodId: i._id, title: i.title, price: i.price, quantity: i.qty })),
          totalPrice,
        }),
      });
      if (res.ok) {
        setOrderSuccess(true);
        setCart([]);
        setCartOpen(false);
        setOrderForm({ name: "", phone: "" });
        setAddressQuery("");
        setLocation(null);
        setTimeout(() => setOrderSuccess(false), 5000);
      }
    } catch {}
    finally { setOrderLoading(false); }
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

        {/* Search */}
        <div className="g-search-bar">
          <span>🔍</span>
          <input
            className="g-search-input"
            placeholder="Taom qidiring..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="g-search-clear" onClick={() => setSearch("")}>✕</button>}
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="g-cat-tabs-wrap">
            <div className="g-cat-tabs">
              {categories.map(cat => (
                <button key={cat}
                  className={`g-cat-tab ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => scrollToCategory(cat)}
                >
                  <span className="g-cat-tab-emoji">{getEmoji(cat)}</span>
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* SUCCESS TOAST */}
      {orderSuccess && (
        <div className="g-toast">
          <span>🎉</span>
          <span>Buyurtmangiz qabul qilindi! Tez orada bog'lanamiz.</span>
        </div>
      )}

      {/* SEARCH RESULTS */}
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
                    onAdd={addToCart} onQty={changeQty} onOpen={openDetail} />
                ))
            }
          </div>
        </main>
      ) : (
        /* CATEGORY SECTIONS */
        <main className="g-main">
          {/* HERO */}
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
                    onAdd={addToCart} onQty={changeQty} onOpen={openDetail} />
                ))}
              </div>
            </div>
          ))}
        </main>
      )}

      {/* ══ FOOD DETAIL MODAL — TO'G'RILANGAN ══ */}
      {detailFood && (
        <div
          className={`g-overlay ${detailVisible ? "visible" : ""}`}
          onClick={closeDetail}
        >
          <div
            className={`g-detail ${detailVisible ? "visible" : ""}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle — faqat mobilda */}
            <div className="g-detail-handle" />
            <button className="g-detail-close" onClick={closeDetail}>✕</button>

            <div className="g-detail-img-wrap">
              <img
                src={detailFood.image}
                alt={detailFood.title}
                className="g-detail-img"
                onError={e => e.target.src = "https://via.placeholder.com/500x300?text=Rasm"}
              />
              <div className="g-detail-img-overlay" />
              <div className="g-detail-img-bottom">
                <span className="g-detail-cat-badge">
                  {getEmoji(detailFood.category)} {detailFood.category}
                </span>
              </div>
            </div>

            <div className="g-detail-body">
              <h2 className="g-detail-title">{detailFood.title}</h2>

              <div className="g-detail-price-row">
                <div className="g-detail-price">{detailFood.price.toLocaleString()} so'm</div>
              </div>

              <div className="g-detail-divider" />

              <p className="g-detail-desc">{detailFood.description}</p>

              <div className="g-detail-divider" />

              {(() => {
                const inCart = cart.find(i => i._id === detailFood._id);
                return inCart ? (
                  <div className="g-detail-controls">
                    <div className="g-detail-qty">
                      <button className="g-qty-btn-lg minus" onClick={() => changeQty(detailFood._id, -1)}>−</button>
                      <span className="g-qty-num-lg">{inCart.qty}</span>
                      <button className="g-qty-btn-lg plus" onClick={() => changeQty(detailFood._id, 1)}>+</button>
                    </div>
                    <div className="g-detail-subtotal">
                      <span className="g-subtotal-label">Jami</span>
                      <span className="g-subtotal-price">
                        {(detailFood.price * inCart.qty).toLocaleString()} so'm
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    className="g-detail-add-btn"
                    onClick={() => { addToCart(detailFood); closeDetail(); }}
                  >
                    <span>🛒</span>
                    <span>Savatga qo'shish — {detailFood.price.toLocaleString()} so'm</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {cartOpen && (
        <div className="g-overlay visible" onClick={() => setCartOpen(false)}>
          <div className="g-drawer" onClick={e => e.stopPropagation()}>
            <div className="g-drawer-header">
              <div>
                <h2 className="g-drawer-title">Savat 🛒</h2>
                {totalItems > 0 && <p className="g-drawer-sub">{totalItems} ta mahsulot</p>}
              </div>
              <button className="g-drawer-close" onClick={() => setCartOpen(false)}>✕</button>
            </div>

            {cart.length === 0 ? (
              <div className="g-cart-empty">
                <div className="g-cart-empty-icon">🛒</div>
                <p className="g-cart-empty-title">Savat bo'sh</p>
                <p className="g-cart-empty-sub">Taomlardan tanlang</p>
                <button className="g-cart-empty-btn" onClick={() => setCartOpen(false)}>Menyuga qaytish</button>
              </div>
            ) : (
              <>
                <div className="g-cart-items">
                  {cart.map(item => (
                    <div key={item._id} className="g-cart-item">
                      <img src={item.image} alt={item.title} className="g-cart-item-img"
                        onError={e => e.target.src = "https://via.placeholder.com/60"} />
                      <div className="g-cart-item-info">
                        <p className="g-cart-item-title">{item.title}</p>
                        <p className="g-cart-item-price">{item.price.toLocaleString()} so'm × {item.qty}</p>
                        <p className="g-cart-item-total">{(item.price * item.qty).toLocaleString()} so'm</p>
                      </div>
                      <div className="g-cart-item-right">
                        <div className="g-qty-mini">
                          <button className="g-qty-mini-btn" onClick={() => changeQty(item._id, -1)}>−</button>
                          <span>{item.qty}</span>
                          <button className="g-qty-mini-btn" onClick={() => changeQty(item._id, 1)}>+</button>
                        </div>
                        <button className="g-remove-btn" onClick={() => removeFromCart(item._id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="g-cart-total-block">
                  <div className="g-cart-total-row">
                    <span>Jami:</span>
                    <span className="g-cart-total-sum">{totalPrice.toLocaleString()} so'm</span>
                  </div>
                </div>

                <form className="g-order-form" onSubmit={handleOrder}>
                  <div className="g-order-form-title">📝 Buyurtma ma'lumotlari</div>

                  <div className="g-form-field">
                    <label>Ismingiz *</label>
                    <input type="text" placeholder="Isim Familiya" required
                      value={orderForm.name}
                      onChange={e => setOrderForm({ ...orderForm, name: e.target.value })} />
                  </div>

                  <div className="g-form-field">
                    <label>Telefon *</label>
                    <input type="tel" placeholder="+998 90 000 00 00" required
                      value={orderForm.phone}
                      onChange={e => setOrderForm({ ...orderForm, phone: e.target.value })} />
                  </div>

                  {/* Address with autocomplete */}
                  <div className="g-form-field g-address-field">
                    <label>Manzil *</label>
                    <div className="g-address-wrap">
                      <input
                        type="text"
                        placeholder="Ko'cha, uy raqamini kiriting..."
                        value={addressQuery}
                        onChange={e => setAddressQuery(e.target.value)}
                        required
                      />
                      {addressLoading && <span className="g-addr-loading">⏳</span>}
                    </div>
                    {addressSuggestions.length > 0 && (
                      <div className="g-addr-suggestions">
                        {addressSuggestions.map((s, i) => (
                          <button key={i} type="button" className="g-addr-suggestion"
                            onClick={() => { setAddressQuery(s); setAddressSuggestions([]); }}>
                            📍 {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Geo location */}
                  <button
                    type="button"
                    className={`g-location-btn ${location ? "active" : ""}`}
                    onClick={getLocation}
                    disabled={locationLoading}
                  >
                    {locationLoading ? "📍 Aniqlanmoqda..." :
                     location ? `✅ GPS: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` :
                     "📍 GPS lokatsiyamni ulash"}
                  </button>

                  <button type="submit" className="g-order-btn" disabled={orderLoading}>
                    {orderLoading ? (
                      <span>Yuborilmoqda...</span>
                    ) : (
                      <>
                        <span>✅ Buyurtma berish</span>
                        <span className="g-order-btn-price">{totalPrice.toLocaleString()} so'm</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FOOD CARD COMPONENT ──────────────────────────────────────────────────────
function FoodCard({ food, cart, index, onAdd, onQty, onOpen }) {
  const inCart = cart.find(i => i._id === food._id);
  return (
    <div className="g-card" style={{ animationDelay: `${index * 0.06}s` }} onClick={() => onOpen(food)}>
      <div className="g-card-img-wrap">
        <img src={food.image} alt={food.title} className="g-card-img"
          onError={e => e.target.src = "https://via.placeholder.com/300x200?text=Rasm"} />
        {inCart && <div className="g-card-in-cart">✓ Savatda</div>}
      </div>
      <div className="g-card-body">
        <h3 className="g-card-title">{food.title}</h3>
        <p className="g-card-desc">{food.description}</p>
        <div className="g-card-footer">
          <span className="g-card-price">{food.price.toLocaleString()} so'm</span>
          {inCart ? (
            <div className="g-qty" onClick={e => e.stopPropagation()}>
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