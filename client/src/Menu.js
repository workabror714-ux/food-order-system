import { useState, useEffect } from "react";
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

  // Food detail modal
  const [detailFood, setDetailFood] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/foods`)
      .then((r) => r.json())
      .then((data) => { setFoods(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError("Server bilan ulanishda xatolik!"); setLoading(false); });
  }, []);

  const categories = ["Barchasi", ...new Set(foods.map((f) => f.category))];
  const filtered = activeCategory === "Barchasi" ? foods : foods.filter((f) => f.category === activeCategory);

  // ─── CART ─────────────────────────────────────────────────────────────────────
  const addToCart = (food, e) => {
    e?.stopPropagation();
    setCart((prev) => {
      const exists = prev.find((i) => i._id === food._id);
      if (exists) return prev.map((i) => i._id === food._id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...food, qty: 1 }];
    });
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i._id !== id));

  const changeQty = (id, delta) => {
    setCart((prev) => prev.map((i) => i._id === id ? { ...i, qty: i.qty + delta } : i).filter((i) => i.qty > 0));
  };

  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  // ─── OPEN / CLOSE FOOD DETAIL ────────────────────────────────────────────────
  const openDetail = (food) => {
    setDetailFood(food);
    setTimeout(() => setDetailVisible(true), 10); // trigger animation
    document.body.style.overflow = "hidden";
  };

  const closeDetail = () => {
    setDetailVisible(false);
    setTimeout(() => { setDetailFood(null); document.body.style.overflow = ""; }, 300);
  };

  // ─── ORDER ────────────────────────────────────────────────────────────────────
  const handleOrder = async (e) => {
    e.preventDefault();
    if (!cart.length) return alert("Savat bo'sh!");
    setOrderLoading(true);
    try {
      const res = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: orderForm.name,
          customerPhone: orderForm.phone,
          address: orderForm.address,
          items: cart.map((i) => ({ foodId: i._id, title: i.title, price: i.price, quantity: i.qty })),
          totalPrice,
        }),
      });
      if (res.ok) {
        setOrderSuccess(true);
        setCart([]);
        setCartOpen(false);
        setOrderForm({ name: "", phone: "", address: "" });
        setTimeout(() => setOrderSuccess(false), 5000);
      } else alert("Buyurtmada xatolik!");
    } catch { alert("Server bilan ulanishda muammo!"); }
    finally { setOrderLoading(false); }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <p>Menyu yuklanmoqda...</p>
    </div>
  );

  if (error) return (
    <div className="error-screen">
      <span className="error-icon">!</span>
      <p>{error}</p>
    </div>
  );

  return (
    <div className="menu-root">
      {/* HEADER */}
      <header className="menu-header">
        <div className="header-inner">
          <div className="logo-block">
            <span className="logo-icon">🍽</span>
            <span className="logo-text">Restoran</span>
          </div>
          <button className="cart-btn" onClick={() => setCartOpen(true)}>
            <span className="cart-icon">🛒</span>
            <span className="cart-label">Savat</span>
            {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
          </button>
        </div>
      </header>

      {/* CATEGORIES */}
      <div className="categories-bar">
        {categories.map((cat) => (
          <button key={cat} className={`cat-btn ${activeCategory === cat ? "active" : ""}`}
            onClick={() => setActiveCategory(cat)}>{cat}</button>
        ))}
      </div>

      {/* SUCCESS TOAST */}
      {orderSuccess && (
        <div className="toast-success">✅ Buyurtmangiz qabul qilindi! Tez orada bog'lanamiz.</div>
      )}

      {/* FOOD GRID */}
      <main className="food-grid">
        {filtered.length === 0 ? (
          <div className="empty-state">Bu kategoriyada taomlar yo'q</div>
        ) : (
          filtered.map((food) => {
            const inCart = cart.find((i) => i._id === food._id);
            return (
              <div key={food._id} className="food-card" onClick={() => openDetail(food)}>
                <div className="food-img-wrap">
                  <img src={`${API}${food.image}`} alt={food.title} className="food-img"
                    onError={(e) => (e.target.src = "https://via.placeholder.com/300x200?text=Rasm+yo%27q")} />
                  <span className="food-category-tag">{food.category}</span>
                  <div className="food-card-overlay">
                    <span className="view-detail-hint">Ko'proq →</span>
                  </div>
                </div>
                <div className="food-info">
                  <h3 className="food-title">{food.title}</h3>
                  <p className="food-desc">{food.description}</p>
                  <div className="food-footer">
                    <span className="food-price">{food.price.toLocaleString()} so'm</span>
                    {inCart ? (
                      <div className="qty-controls" onClick={(e) => e.stopPropagation()}>
                        <button className="qty-btn" onClick={() => changeQty(food._id, -1)}>−</button>
                        <span className="qty-num">{inCart.qty}</span>
                        <button className="qty-btn" onClick={() => changeQty(food._id, 1)}>+</button>
                      </div>
                    ) : (
                      <button className="add-btn" onClick={(e) => addToCart(food, e)}>+ Qo'shish</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* ══ FOOD DETAIL MODAL ══ */}
      {detailFood && (
        <div className={`detail-overlay ${detailVisible ? "visible" : ""}`} onClick={closeDetail}>
          <div className={`detail-modal ${detailVisible ? "visible" : ""}`} onClick={(e) => e.stopPropagation()}>
            {/* Close */}
            <button className="detail-close" onClick={closeDetail}>✕</button>

            {/* Image */}
            <div className="detail-img-wrap">
              <img src={`${API}${detailFood.image}`} alt={detailFood.title} className="detail-img"
                onError={(e) => (e.target.src = "https://via.placeholder.com/500x300?text=Rasm+yo%27q")} />
              <div className="detail-img-gradient" />
              <span className="detail-cat-badge">{detailFood.category}</span>
            </div>

            {/* Content */}
            <div className="detail-body">
              <h2 className="detail-title">{detailFood.title}</h2>

              <div className="detail-meta-row">
                <div className="detail-price-block">
                  <span className="detail-price-label">Narxi</span>
                  <span className="detail-price">{detailFood.price.toLocaleString()} so'm</span>
                </div>
                <div className="detail-added-block">
                  <span className="detail-price-label">Kategoriya</span>
                  <span className="detail-added-val">{detailFood.category}</span>
                </div>
              </div>

              <div className="detail-divider" />

              <h4 className="detail-desc-label">Tavsif</h4>
              <p className="detail-desc">{detailFood.description}</p>

              <div className="detail-divider" />

              {/* Cart controls */}
              {(() => {
                const inCart = cart.find((i) => i._id === detailFood._id);
                return inCart ? (
                  <div className="detail-cart-row">
                    <div className="qty-controls-large">
                      <button className="qty-btn-lg" onClick={() => changeQty(detailFood._id, -1)}>−</button>
                      <span className="qty-num-lg">{inCart.qty}</span>
                      <button className="qty-btn-lg" onClick={() => changeQty(detailFood._id, 1)}>+</button>
                    </div>
                    <div className="detail-cart-total">
                      <span>Jami:</span>
                      <strong>{(detailFood.price * inCart.qty).toLocaleString()} so'm</strong>
                    </div>
                  </div>
                ) : (
                  <button className="detail-add-btn" onClick={() => { addToCart(detailFood); closeDetail(); }}>
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
        <div className="cart-overlay" onClick={() => setCartOpen(false)}>
          <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cart-header">
              <h2>🛒 Savat</h2>
              <button className="close-btn" onClick={() => setCartOpen(false)}>✕</button>
            </div>
            {cart.length === 0 ? (
              <div className="cart-empty">Savat bo'sh</div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => (
                    <div key={item._id} className="cart-item">
                      <img src={`${API}${item.image}`} alt={item.title} className="cart-item-img" />
                      <div className="cart-item-info">
                        <p className="cart-item-title">{item.title}</p>
                        <p className="cart-item-price">{(item.price * item.qty).toLocaleString()} so'm</p>
                      </div>
                      <div className="cart-item-controls">
                        <button className="qty-btn" onClick={() => changeQty(item._id, -1)}>−</button>
                        <span className="qty-num">{item.qty}</span>
                        <button className="qty-btn" onClick={() => changeQty(item._id, 1)}>+</button>
                        <button className="remove-btn" onClick={() => removeFromCart(item._id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-total">
                  <span>Jami:</span>
                  <span className="total-sum">{totalPrice.toLocaleString()} so'm</span>
                </div>
                <form className="order-form" onSubmit={handleOrder}>
                  <h3>Buyurtma ma'lumotlari</h3>
                  <input type="text" placeholder="Ismingiz *" required
                    value={orderForm.name} onChange={(e) => setOrderForm({ ...orderForm, name: e.target.value })} />
                  <input type="tel" placeholder="Telefon raqamingiz *" required
                    value={orderForm.phone} onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })} />
                  <input type="text" placeholder="Manzil (ixtiyoriy)"
                    value={orderForm.address} onChange={(e) => setOrderForm({ ...orderForm, address: e.target.value })} />
                  <button type="submit" className="order-btn" disabled={orderLoading}>
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