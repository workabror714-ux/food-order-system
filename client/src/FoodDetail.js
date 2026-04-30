import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, TRANSLATIONS } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const CAT_EMOJI = { "fast food":"🍔","burger":"🍔","pizza":"🍕","salat":"🥗","desert":"🍦","ichimliklar":"🥤","sho'rvalar":"🍲","hamir ovqat":"🥟","grill":"🔥","quyuq ovqat":"🍛","default":"🍽" };
const getEmoji = (cat) => CAT_EMOJI[cat?.toLowerCase()] || CAT_EMOJI.default;
const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (cart) => { localStorage.setItem("cart", JSON.stringify(cart)); window.dispatchEvent(new Event("cartUpdated")); };

export default function FoodDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [food, setFood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [cartCount, setCartCount] = useState(() => getCart().reduce((s,i) => s+i.qty, 0));
  const [lang, setLang] = useState(getLang);
  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;

  useEffect(() => {
    fetch(`${API}/api/foods/${id}`).then(r => r.json()).then(data => { setFood(data); setLoading(false); }).catch(() => setLoading(false));
    const onLang = () => setLang(getLang());
    const onCart = () => setCartCount(getCart().reduce((s,i) => s+i.qty, 0));
    window.addEventListener("langChanged", onLang);
    window.addEventListener("cartUpdated", onCart);
    return () => { window.removeEventListener("langChanged", onLang); window.removeEventListener("cartUpdated", onCart); };
  }, [id]);

  useEffect(() => {
    if (!food) return;
    const inCart = getCart().find(i => i._id === food._id);
    if (inCart) setQty(inCart.qty);
  }, [food]);

  const handleAdd = () => {
    const cart = getCart();
    const exists = cart.find(i => i._id === food._id);
    const newCart = exists ? cart.map(i => i._id === food._id ? { ...i, qty } : i) : [...cart, { ...food, qty }];
    saveCart(newCart);
    setCartCount(newCart.reduce((s,i) => s+i.qty, 0));
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  if (loading) return (
    <div className="g-loading">
      <div className="g-spinner-wrap"><div className="g-spinner-ring" /><span className="g-spinner-emoji">🍃</span></div>
      <p className="g-loading-text">{t.loading}</p>
    </div>
  );

  if (!food || food.message) return (
    <div className="fd-not-found">
      <div className="fd-not-found-emoji">🍽</div>
      <h2>{t.notFound}</h2>
      <button className="fd-back-btn" onClick={() => navigate("/")}>{t.backToMenu}</button>
    </div>
  );

  const totalSum = food.price * qty;
  const imgSrc = food.image?.startsWith("http") ? food.image : `${API}${food.image}`;

  return (
    <div className="fd-root">
      <div className="fd-header">
        <button className="fd-back-btn-header" onClick={() => navigate(-1)}>{t.back}</button>
        <span className="fd-header-title" style={{ flex:1,textAlign:"center" }}>{food.title}</span>
        {cartCount > 0 ? (
          <button className="fd-cart-btn" onClick={() => navigate("/cart")}>
            🛒 <span className="fd-cart-btn-count">{cartCount}</span>
          </button>
        ) : <div style={{ width:56 }} />}
      </div>

      <div className="fd-img-wrap">
        {!imgErr ? (
          <img src={imgSrc} alt={food.title} className="fd-img" onError={() => setImgErr(true)} />
        ) : (
          <div className="fd-img-placeholder">
            <span>{getEmoji(food.category)}</span>
            <p>{food.title}</p>
          </div>
        )}
        <div className="fd-img-overlay" />
        <div className="fd-cat-badge">{getEmoji(food.category)} {food.category}</div>
      </div>

      <div className="fd-content">
        <div className="fd-card">
          <h1 className="fd-title">{food.title}</h1>
          <div className="fd-price">{food.price?.toLocaleString()} so'm</div>
          {food.description && (
            <>
              <div className="fd-divider" />
              <div className="fd-section-label">📝 {t.description}</div>
              <p className="fd-desc">{food.description}</p>
            </>
          )}
          <div className="fd-divider" />
          <div className="fd-section-label">🔢 {t.quantity}</div>
          <div className="fd-qty-row">
            <div className="fd-qty">
              <button className="fd-qty-btn minus" onClick={() => setQty(q => Math.max(1,q-1))}>−</button>
              <span className="fd-qty-num">{qty}</span>
              <button className="fd-qty-btn plus" onClick={() => setQty(q => q+1)}>+</button>
            </div>
            <div className="fd-subtotal">
              <span className="fd-subtotal-label">{t.total}</span>
              <span className="fd-subtotal-price">{totalSum.toLocaleString()} so'm</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fd-bottom">
        <button className={`fd-add-btn ${added?"added":""}`} onClick={handleAdd}>
          {added ? t.addedToCart : `${t.addToCart} — ${totalSum.toLocaleString()} so'm`}
        </button>
        <button className="fd-menu-btn" onClick={() => navigate("/")}>{t.backToMenu}</button>
      </div>
    </div>
  );
}