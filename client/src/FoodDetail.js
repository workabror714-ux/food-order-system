import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (cart) => {
  localStorage.setItem("cart", JSON.stringify(cart));
  window.dispatchEvent(new Event("cartUpdated"));
};

export default function FoodDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [food, setFood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [cartCount, setCartCount] = useState(() => getCart().reduce((s, i) => s + i.qty, 0));

  useEffect(() => {
    fetch(`${API}/api/foods/${id}`)
      .then(r => r.json())
      .then(data => { setFood(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!food) return;
    const cart = getCart();
    const inCart = cart.find(i => i._id === food._id);
    if (inCart) setQty(inCart.qty);
  }, [food]);

  useEffect(() => {
    const update = () => {
      setCartCount(getCart().reduce((s, i) => s + i.qty, 0));
    };
    window.addEventListener("cartUpdated", update);
    return () => window.removeEventListener("cartUpdated", update);
  }, []);

  const handleAdd = () => {
    const cart = getCart();
    const exists = cart.find(i => i._id === food._id);
    let newCart;
    if (exists) {
      newCart = cart.map(i => i._id === food._id ? { ...i, qty } : i);
    } else {
      newCart = [...cart, { ...food, qty }];
    }
    saveCart(newCart);
    setCartCount(newCart.reduce((s, i) => s + i.qty, 0));
    navigate("/cart");
  };

  if (loading) return (
    <div className="g-loading">
      <div className="g-spinner-wrap"><div className="g-spinner-ring" /><span className="g-spinner-emoji">🍃</span></div>
      <p className="g-loading-text">Yuklanmoqda...</p>
    </div>
  );

  if (!food || food.message) return (
    <div className="fd-not-found">
      <div className="fd-not-found-emoji">🍽</div>
      <h2>Taom topilmadi</h2>
      <button className="fd-back-btn" onClick={() => navigate("/")}>← Menyuga qaytish</button>
    </div>
  );

  const totalSum = food.price * qty;

  return (
    <div className="fd-root">
      <div className="fd-header">
        <button className="fd-back-btn-header" onClick={() => navigate(-1)}>← Orqaga</button>
        <span className="fd-header-title">Taom haqida</span>
        {cartCount > 0 ? (
          <button className="fd-cart-btn" onClick={() => navigate("/cart")}>
            🛒 <span className="fd-cart-btn-count">{cartCount}</span>
          </button>
        ) : <div style={{ width: 60 }} />}
      </div>

      <div className="fd-img-wrap">
        <img
          src={food.image?.startsWith("http") ? food.image : `${API}${food.image}`}
          alt={food.title} className="fd-img"
          onError={e => { e.target.onerror = null; e.target.src = "https://placehold.co/800x400/e8f5ee/1d6b3e?text=Rasm+yo%27q"; }}
        />
        <div className="fd-img-overlay" />
        <div className="fd-cat-badge">{getEmoji(food.category)} {food.category}</div>
      </div>

      <div className="fd-content">
        <h1 className="fd-title">{food.title}</h1>
        <div className="fd-price">{food.price?.toLocaleString()} so'm</div>
        <div className="fd-divider" />
        <div className="fd-section-label">📝 Tavsif</div>
        <p className="fd-desc">{food.description || "Tavsif kiritilmagan"}</p>
        <div className="fd-divider" />
        <div className="fd-section-label">🔢 Miqdor</div>
        <div className="fd-qty-row">
          <div className="fd-qty">
            <button className="fd-qty-btn minus" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
            <span className="fd-qty-num">{qty}</span>
            <button className="fd-qty-btn plus" onClick={() => setQty(q => q + 1)}>+</button>
          </div>
          <div className="fd-subtotal">
            <span className="fd-subtotal-label">Jami</span>
            <span className="fd-subtotal-price">{totalSum.toLocaleString()} so'm</span>
          </div>
        </div>
      </div>

      <div className="fd-bottom">
        <button className="fd-add-btn" onClick={handleAdd}>
          🛒 Savatga qo'shish — {totalSum.toLocaleString()} so'm
        </button>
        <button className="fd-menu-btn" onClick={() => navigate("/")}>← Menyuga qaytish</button>
      </div>
    </div>
  );
} 