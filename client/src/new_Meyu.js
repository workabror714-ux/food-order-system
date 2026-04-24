import { useState, useEffect, useRef } from "react";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function Menu() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Barchasi");
  const [orderForm, setOrderForm] = useState({ name: "", phone: "", address: "" });
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [detailFood, setDetailFood] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API}/api/foods`)
      .then(r => r.json())
      .then(data => { setFoods(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError("Server bilan ulanishda xatolik!"); setLoading(false); });
  }, []);

  const categories = ["Barchasi", ...new Set(foods.map(f => f.category))];
  const filtered = foods.filter(f => {
    const catMatch = activeCategory === "Barchasi" || f.category === activeCategory;
    const searchMatch = !search || f.title.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

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

  // Location
  const getLocation = () => {
    setLocationLoading(true);
    if (!navigator.geolocation) { setLocationLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLoading(false);
      },
      () => setLocationLoading(false)
    );
  };

  // Detail modal
  const openDetail = food => {
    setDetailFood(food);
    setTimeout(() => setDetailVisible(true), 10);
    document.body.style.overflow = "hidden";
  };
  const closeDetail = () => {
    setDetailVisible(false);
    setTimeout(() => { setDetailFood(null); document.body.style.overflow = ""; }, 300);
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
          address: orderForm.address,
          location,
          items: cart.map(i => ({ foodId: i._id, title: i.title, price: i.price, quantity: i.qty })),
          totalPrice,
        }),
      });
      if (res.ok) {
        setOrderSuccess(true);
        setCart([]);
        setCartOpen(false);
        setOrderForm({ name: "", phone: "", address: "" });
        setLocation(null);
        setTimeout(() => setOrderSuccess(false), 5000);
      }
    } catch {}
    finally { setOrderLoading(false); }
  };

  if (loading) return (
    <div className="g-loading">
      <div className="g-spinner" />
      <p>Menyu yuklanmoqda...</p>
    </div>
  );

  return (
    <div className="g-root">
      {/* HEADER */}
      <header className="g-header">
        <div className="g-header-inner">
          <div className="g-logo">
            <span className="g-logo-icon">🍃</span>
            <span className="g-logo-text">FreshBite</span>
          </div>
          <div className="g-header-right">
            <button className="g-cart-btn" onClick={() => setCartOpen(true)}>
              <span>🛒</span>
              <span className="g-cart-label">Savat</span>
              {totalItems > 0 && <span className="g-cart-badge">{totalItems}</span>}
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="g-search-wrap">
          <span className="g-search-icon">🔍</span>
          <input
            className="g-search-input"
            placeholder="Taom qidiring..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </header>

      {/* HERO BANNER */}
      <div className="g-hero">
        <div className="g-hero-content">
          <h1 className="g-hero-title">Mazali taomlar<br /><span>eshigingizgacha</span></h1>
          <p className="g-hero-sub">Tez, yangi va arzon yetkazib berish</p>
        </div>
        <div className="g-hero-img">🥗</div>
      </div>

      {/* CATEGORIES */}
      <div className="g-cats-wrap">
        <div className="g-cats">
          {categories.map(cat => (
            <button key={cat}
              className={`g-cat-btn ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >{cat}</button>
          ))}
        </div>
      </div>

      {/* SUCCESS TOAST */}
      {orderSuccess && (
        <div className="g-toast">✅ Buyurtmangiz qabul qilindi! Tez orada bog'lanamiz.</div>
      )}

      {/* FOOD GRID */}
      <main className="g-grid">
        {filtered.length === 0 ? (
          <div className="g-empty">Taomlar topilmadi</div>
        ) : filtered.map(food => {
          const inCart = cart.find(i => i._id === food._id);
          return (
            <div key={food._id} className="g-card" onClick={() => openDetail(food)}>
              <div className="g-card-img-wrap">
                <img src={food.image} alt={food.title} className="g-card-img"
                  onError={e => e.target.src = "https://via.placeholder.com/300x200?text=Rasm"} />
                <span className="g-card-cat">{food.category}</span>
              </div>
              <div className="g-card-body">
                <h3 className="g-card-title">{food.title}</h3>
                <p className="g-card-desc">{food.description}</p>
                <div className="g-card-footer">
                  <span className="g-card-price">{food.price.toLocaleString()} so'm</span>
                  {inCart ? (
                    <div className="g-qty" onClick={e => e.stopPropagation()}>
                      <button className="g-qty-btn" onClick={() => changeQty(food._id, -1)}>−</button>
                      <span className="g-qty-num">{inCart.qty}</span>
                      <button className="g-qty-btn" onClick={() => changeQty(food._id, 1)}>+</button>
                    </div>
                  ) : (
                    <button className="g-add-btn" onClick={e => addToCart(food, e)}>+</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </main>

      {/* FOOD DETAIL MODAL */}
      {detailFood && (
        <div className={`g-overlay ${detailVisible ? "visible" : ""}`} onClick={closeDetail}>
          <div className={`g-detail ${detailVisible ? "visible" : ""}`} onClick={e => e.stopPropagation()}>
            <button className="g-detail-close" onClick={closeDetail}>✕</button>
            <div className="g-detail-img-wrap">
              <img src={detailFood.image} alt={detailFood.title} className="g-detail-img"
                onError={e => e.target.src = "https://via.placeholder.com/500x300?text=Rasm"} />
              <div className="g-detail-gradient" />
              <span className="g-detail-cat">{detailFood.category}</span>
            </div>
            <div className="g-detail-body">
              <h2 className="g-detail-title">{detailFood.title}</h2>
              <div className="g-detail-meta">
                <div className="g-detail-meta-item">
                  <span className="g-detail-meta-label">Narxi</span>
                  <span className="g-detail-price">{detailFood.price.toLocaleString()} so'm</span>
                </div>
                <div className="g-detail-meta-item">
                  <span className="g-detail-meta-label">Kategoriya</span>
                  <span className="g-detail-meta-val">{detailFood.category}</span>
                </div>
              </div>
              <p className="g-detail-desc">{detailFood.description}</p>
              {(() => {
                const inCart = cart.find(i => i._id === detailFood._id);
                return inCart ? (
                  <div className="g-detail-cart-row">
                    <div className="g-qty-lg">
                      <button className="g-qty-btn-lg" onClick={() => changeQty(detailFood._id, -1)}>−</button>
                      <span className="g-qty-num-lg">{inCart.qty}</span>
                      <button className="g-qty-btn-lg" onClick={() => changeQty(detailFood._id, 1)}>+</button>
                    </div>
                    <span className="g-detail-total">{(detailFood.price * inCart.qty).toLocaleString()} so'm</span>
                  </div>
                ) : (
                  <button className="g-detail-add-btn" onClick={() => { addToCart(detailFood); closeDetail(); }}>
                    🛒 Savatga qo'shish — {detailFood.price.toLocaleString()} so'm
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
              <h2>🛒 Savat</h2>
              <button className="g-drawer-close" onClick={() => setCartOpen(false)}>✕</button>
            </div>
            {cart.length === 0 ? (
              <div className="g-cart-empty">
                <span>🛒</span>
                <p>Savat bo'sh</p>
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
                        <p className="g-cart-item-price">{(item.price * item.qty).toLocaleString()} so'm</p>
                      </div>
                      <div className="g-qty">
                        <button className="g-qty-btn" onClick={() => changeQty(item._id, -1)}>−</button>
                        <span className="g-qty-num">{item.qty}</span>
                        <button className="g-qty-btn" onClick={() => changeQty(item._id, 1)}>+</button>
                        <button className="g-remove-btn" onClick={() => removeFromCart(item._id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="g-cart-total">
                  <span>Jami:</span>
                  <span className="g-cart-total-sum">{totalPrice.toLocaleString()} so'm</span>
                </div>
                <form className="g-order-form" onSubmit={handleOrder}>
                  <h3>📝 Buyurtma ma'lumotlari</h3>
                  <input type="text" placeholder="Ismingiz *" required
                    value={orderForm.name} onChange={e => setOrderForm({ ...orderForm, name: e.target.value })} />
                  <input type="tel" placeholder="Telefon raqamingiz *" required
                    value={orderForm.phone} onChange={e => setOrderForm({ ...orderForm, phone: e.target.value })} />
                  <input type="text" placeholder="Manzil (ko'cha, uy)"
                    value={orderForm.address} onChange={e => setOrderForm({ ...orderForm, address: e.target.value })} />

                  {/* GEO LOCATION */}
                  <button type="button" className="g-location-btn" onClick={getLocation} disabled={locationLoading}>
                    {locationLoading ? "📍 Aniqlanmoqda..." :
                     location ? `✅ Lokatsiya aniqlandi (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})` :
                     "📍 Lokatsiyamni ulash (ixtiyoriy)"}
                  </button>

                  <button type="submit" className="g-order-btn" disabled={orderLoading}>
                    {orderLoading ? "Yuborilmoqda..." : `✅ Buyurtma berish — ${totalPrice.toLocaleString()} so'm`}
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