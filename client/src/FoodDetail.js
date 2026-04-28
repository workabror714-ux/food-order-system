import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const getCart = () => {
  try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
};

const saveCart = (cart) => {
  localStorage.setItem("cart", JSON.stringify(cart));
  // Menu.js ga xabar berish — cartCount yangilanadi
  window.dispatchEvent(new Event("cartUpdated"));
};

export default function FoodDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [food, setFood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetch(`${API}/api/foods/${id}`)
      .then(r => r.json())
      .then(data => {
        setFood(data);
        setLoading(false);
        // Agar allaqachon savatda bo'lsa, qty ni unga tenglashtir
        const cart = getCart();
        const existing = cart.find(i => i._id === data._id);
        if (existing) setQty(existing.qty);
      })
      .catch(() => setLoading(false));

    const updateCount = () => {
      const cart = getCart();
      setCartCount(cart.reduce((t, i) => t + i.qty, 0));
    };
    updateCount();
    window.addEventListener("cartUpdated", updateCount);
    return () => window.removeEventListener("cartUpdated", updateCount);
  }, [id]);

  const addToCart = () => {
    const cart = getCart();
    const idx = cart.findIndex(i => i._id === food._id);
    if (idx >= 0) {
      cart[idx].qty = qty;
    } else {
      cart.push({
        _id: food._id,
        title: food.title,
        price: food.price,
        image: food.image,
        qty,
      });
    }
    saveCart(cart);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  if (loading) return (
    <div className="g-loading">
      <div className="g-spinner-wrap">
        <div className="g-spinner-ring" />
        <span className="g-spinner-emoji">🍃</span>
      </div>
      <p className="g-loading-text">Yuklanmoqda...</p>
    </div>
  );

  if (!food) return (
    <div className="fd-not-found">
      <span className="fd-not-found-emoji">🍽</span>
      <h2>Taom topilmadi</h2>
      <button className="fd-back-btn" onClick={() => navigate("/")}>
        Menyuga qaytish
      </button>
    </div>
  );

  const subtotal = food.price * qty;

  return (
    <div className="fd-root">
      {/* HEADER */}
      <div className="fd-header">
        <button className="fd-back-btn-header" onClick={() => navigate(-1)}>
          ← Orqaga
        </button>
        <span className="fd-header-title">Taom haqida</span>
        {/* Savat tugmasi */}
        <button className="fd-cart-btn" onClick={() => navigate("/cart")}>
          🛒
          {cartCount > 0 && (
            <span className="fd-cart-btn-count">{cartCount}</span>
          )}
        </button>
      </div>

      {/* RASM */}
      <div className="fd-img-wrap">
        <img
          src={food.image?.startsWith("http") ? food.image : `${API}${food.image}`}
          alt={food.title}
          className="fd-img"
          onError={e => e.target.src = "https://placehold.co/700x400/e8f5ee/1d6b3e?text=Rasm"}
        />
        <div className="fd-img-overlay" />
        <div className="fd-img-bottom">
          <span className="fd-cat-badge">{food.category}</span>
        </div>
      </div>

      {/* CONTENT */}
      <div className="fd-content">
        <h1 className="fd-title">{food.title}</h1>
        <p className="fd-price">{food.price.toLocaleString()} so'm</p>

        {food.description && (
          <>
            <div className="fd-divider" />
            <p className="fd-section-label">Tavsif</p>
            <p className="fd-desc">{food.description}</p>
          </>
        )}

        <div className="fd-divider" />

        {/* MIQDOR TANLASH */}
        <div className="fd-qty-row">
          <div className="fd-qty">
            <button
              className="fd-qty-btn minus"
              onClick={() => setQty(q => Math.max(1, q - 1))}
            >−</button>
            <span className="fd-qty-num">{qty}</span>
            <button
              className="fd-qty-btn plus"
              onClick={() => setQty(q => q + 1)}
            >+</button>
          </div>
          <div className="fd-subtotal">
            <span className="fd-subtotal-label">Jami:</span>
            <span className="fd-subtotal-price">{subtotal.toLocaleString()} so'm</span>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="fd-bottom">
        <button
          className={`fd-add-btn ${added ? "added" : ""}`}
          onClick={addToCart}
        >
          {added ? "✅ Savatga qo'shildi!" : `🛒 Savatga qo'shish — ${subtotal.toLocaleString()} so'm`}
        </button>
        <button className="fd-menu-btn" onClick={() => navigate("/")}>
          ← Menyuga qaytish
        </button>
      </div>
    </div>
  );
}