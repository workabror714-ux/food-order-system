import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, TRANSLATIONS } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (c) => { localStorage.setItem("cart", JSON.stringify(c)); window.dispatchEvent(new Event("cartUpdated")); };
const getField = (f, lang) => { if (!f) return ""; if (typeof f === "string") return f; return f[lang] || f.uz || f.ru || f.en || ""; };

export default function FoodDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [food, setFood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(getCart);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [lang, setLang] = useState(getLang);
  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;

  useEffect(() => {
    fetch(`${API}/api/foods/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setFood(d); setLoading(false); })
      .catch(() => setLoading(false));

    const onCart = () => setCart(getCart());
    const onLang = () => setLang(getLang());
    window.addEventListener("cartUpdated", onCart);
    window.addEventListener("langChanged", onLang);
    return () => {
      window.removeEventListener("cartUpdated", onCart);
      window.removeEventListener("langChanged", onLang);
    };
  }, [id]);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const inCart = cart.find(i => i._id === id);

  const addToCart = () => {
    if (food?.isAvailable === false) { alert("Bu taom hozircha mavjud emas"); return; }
    const existing = cart.find(i => i._id === id);
    let nc;
    if (existing) {
      nc = cart.map(i => i._id === id ? { ...i, qty: i.qty + qty } : i);
    } else {
      nc = [...cart, { ...food, qty }];
    }
    saveCart(nc);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  if (loading) return (
    <div className="g-loading">
      <div className="g-spinner-wrap"><div className="g-spinner-ring" /></div>
      <p className="g-loading-text">{t.loading}</p>
    </div>
  );

  if (!food) return (
    <div className="fd-not-found">
      <div style={{fontSize:"4rem"}}>😕</div>
      <h2 style={{fontWeight:800}}>{t.notFound}</h2>
      <button className="fd-back-btn" onClick={() => navigate("/")}>{t.backToMenu}</button>
    </div>
  );

  const title = getField(food.title, lang);
  const desc = getField(food.description, lang);
  const cat = getField(food.category, lang);
  const subtotal = food.price * qty;
  const available = food.isAvailable !== false;

  return (
    <div className="fd-root">
      <div className="fd-header">
        <button className="fd-back-btn-header" onClick={() => navigate(-1)}>{t.back}</button>
        <span className="fd-header-title">{title}</span>
        <button className="fd-cart-btn" onClick={() => navigate("/cart")}>
          🛒 {cartCount > 0 && <span className="fd-cart-btn-count">{cartCount}</span>}
        </button>
      </div>

      <div className="fd-img-wrap">
        {!imgErr && food.image ? (
          <img src={food.image} alt={title} className="fd-img" onError={() => setImgErr(true)} />
        ) : (
          <div className="fd-img-placeholder">
            <span>🍽</span>
            <p>Yalpiz Restaurant</p>
          </div>
        )}
        <div className="fd-img-overlay" />
        {cat && <span className="fd-cat-badge">{cat}</span>}
        {!available && <span className="fd-unavailable-badge">Hozircha mavjud emas</span>}
      </div>

      <div className="fd-content">
        <div className="fd-card">
          <h1 className="fd-title">{title}</h1>
          <p className="fd-price">{food.price?.toLocaleString()} so'm</p>
          {!available && <p className="fd-unavailable-note">Bu taom hozircha restoranda mavjud emas.</p>}
          {desc && (
            <>
              <div className="fd-divider" />
              <p className="fd-section-label">{t.description}</p>
              <p className="fd-desc">{desc}</p>
            </>
          )}
          <div className="fd-divider" />
          <p className="fd-section-label">{t.quantity}</p>
          <div className="fd-qty-row">
            <div className="fd-qty">
              <button className="fd-qty-btn" disabled={!available} onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <span className="fd-qty-num">{qty}</span>
              <button className="fd-qty-btn plus" disabled={!available} onClick={() => setQty(q => q + 1)}>+</button>
            </div>
            <div className="fd-subtotal">
              <span className="fd-subtotal-label">{t.total}</span>
              <span className="fd-subtotal-price">{subtotal.toLocaleString()} so'm</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fd-bottom">
        <button className={`fd-add-btn ${added ? "added" : ""}`} onClick={addToCart} disabled={!available}>
          {!available ? "Hozircha mavjud emas" : added ? t.addedToCart : t.addToCart}
        </button>
        <button className="fd-menu-btn" onClick={() => navigate("/")}>{t.backToMenu}</button>
      </div>
    </div>
  );
}