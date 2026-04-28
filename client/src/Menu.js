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

const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (cart) => {
  localStorage.setItem("cart", JSON.stringify(cart));
  window.dispatchEvent(new Event("cartUpdated"));
};

export default function Menu() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(false);
  const [cart, setCart] = useState(getCart);
  const [banner, setBanner] = useState(null);
  const catRefs = useRef({});
  const navigate = useNavigate();

  const cartCount = cart.reduce((t, i) => t + i.qty, 0);
  const cartTotal = cart.reduce((t, i) => t + i.price * i.qty, 0);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/foods`).then(r => r.json()),
      fetch(`${API}/api/banner`).then(r => r.json()).catch(() => null),
    ]).then(([foodData, bannerData]) => {
      const arr = Array.isArray(foodData) ? foodData : [];
      setFoods(arr);
      if (arr.length > 0) {
        const cats = [...new Set(arr.map(f => f.category))];
        setActiveCategory(cats[0]);
      }
      if (bannerData) setBanner(bannerData);
      setLoading(false);
      setTimeout(() => setVisible(true), 50);
    }).catch(() => setLoading(false));

    const onCartUpdate = () => setCart(getCart());
    window.addEventListener("cartUpdated", onCartUpdate);
    window.addEventListener("storage", onCartUpdate);
    return () => {
      window.removeEventListener("cartUpdated", onCartUpdate);
      window.removeEventListener("storage", onCartUpdate);
    };
  }, []);

  const categories = [...new Set(foods.map(f => f.category))];
  const foodsByCategory = categories.reduce((acc, cat) => {
    acc[cat] = foods.filter(f => f.category === cat);
    return acc;
  }, {});
  const filteredFoods = search
    ? foods.filter(f => f.title.toLowerCase().includes(search.toLowerCase()))
    : null;

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    catRefs.current[cat]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const addToCart = (food, e) => {
    e.stopPropagation();
    const newCart = [...cart, { ...food, qty: 1 }];
    setCart(newCart);
    saveCart(newCart);
  };

  const changeQty = (foodId, delta, e) => {
    e.stopPropagation();
    const newCart = cart
      .map(i => i._id === foodId ? { ...i, qty: i.qty + delta } : i)
      .filter(i => i.qty > 0);
    setCart(newCart);
    saveCart(newCart);
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
      <header className="g-header">
        <div className="g-header-inner">
          <div className="g-logo">
            <span className="g-logo-leaf">🍃</span>
            <div>
              <div className="g-logo-name">FreshBite</div>
              <div className="g-logo-sub">Tez yetkazib berish</div>
            </div>
          </div>
          <button className="g-orders-btn" onClick={() => navigate("/orders")} aria-label="Buyurtmam">
            <span>📦</span>
          </button>
          <button className="g-cart-nav" onClick={() => navigate("/cart")} aria-label="Savat">
            <span className="g-cart-icon">🛒</span>
            {cartCount > 0 && <span className="g-cart-badge">{cartCount}</span>}
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

      {cartCount > 0 && (
        <div className="g-float-cart" onClick={() => navigate("/cart")}>
          <span className="g-float-cart-text">🛒 {cartCount} ta mahsulot</span>
          <span className="g-float-cart-price">{cartTotal.toLocaleString()} so'm</span>
          <span className="g-float-cart-btn">Savatga o'tish →</span>
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
                <FoodCard key={food._id} food={food} index={i} cart={cart}
                  onOpen={() => navigate(`/food/${food._id}`)}
                  onAdd={addToCart} onChangeQty={changeQty} />
              ))}
          </div>
        </main>
      ) : (
        <main className="g-main">
          {/* DYNAMIC HERO BANNER */}
          <HeroBanner banner={banner} />

          {categories.map(cat => (
            <div key={cat} className="g-cat-section" ref={el => catRefs.current[cat] = el}>
              <div className="g-section-header">
                <span className="g-section-emoji">{getEmoji(cat)}</span>
                <h2 className="g-section-title-text">{cat}</h2>
                <span className="g-section-count">{foodsByCategory[cat].length} ta</span>
              </div>
              <div className="g-grid">
                {foodsByCategory[cat].map((food, i) => (
                  <FoodCard key={food._id} food={food} index={i} cart={cart}
                    onOpen={() => navigate(`/food/${food._id}`)}
                    onAdd={addToCart} onChangeQty={changeQty} />
                ))}
              </div>
            </div>
          ))}
        </main>
      )}
    </div>
  );
}

// ── DYNAMIC HERO BANNER ─────────────────────────────────────────────────────
function HeroBanner({ banner }) {
  const defaultBanner = {
    title: "Mazali taomlar",
    subtitle: "eshigingizgacha 🚀",
    description: "Yangi, tez va arzon yetkazib berish",
    bgColor: "#0d4a28",
    mediaType: "none",
    mediaUrl: "",
    events: []
  };
  const b = banner || defaultBanner;

  return (
    <div className="g-hero" style={{ background: b.bgColor, position: "relative", overflow: "hidden" }}>
      {/* Background media */}
      {b.mediaType === "image" && b.mediaUrl && (
        <img src={b.mediaUrl} alt="banner" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", opacity: 0.35, zIndex: 0
        }} />
      )}
      {b.mediaType === "video" && b.mediaUrl && (
        <video autoPlay muted loop playsInline style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", opacity: 0.35, zIndex: 0
        }}>
          <source src={b.mediaUrl} />
        </video>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <h1 className="g-hero-title">
          {b.title}<br />
          <span className="g-hero-accent">{b.subtitle}</span>
        </h1>
        <p className="g-hero-desc">{b.description}</p>
        {b.events?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {b.events.map(ev => (
              <span key={ev.id} style={{
                background: "rgba(255,255,255,0.18)", color: "white",
                padding: "4px 12px", borderRadius: 20, fontSize: "0.82rem",
                fontWeight: 700, backdropFilter: "blur(4px)"
              }}>{ev.emoji} {ev.label}</span>
            ))}
          </div>
        )}
      </div>

      <div className="g-hero-stats" style={{ position: "relative", zIndex: 1 }}>
        <div className="g-stat">
          <span className="g-stat-num">30'</span>
          <span className="g-stat-label">Yetkazish</span>
        </div>
      </div>
    </div>
  );
}

// ── FOOD CARD ────────────────────────────────────────────────────────────────
function FoodCard({ food, index, cart, onOpen, onAdd, onChangeQty }) {
  const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
  const inCart = cart.find(i => i._id === food._id);

  return (
    <div className="g-card" style={{ animationDelay: `${index * 0.06}s` }} onClick={onOpen}>
      <div className="g-card-img-wrap">
        <img
          src={food.image?.startsWith("http") ? food.image : `${API}${food.image}`}
          alt={food.title} className="g-card-img"
          onError={e => e.target.src = "https://placehold.co/300x200/e8f5ee/1d6b3e?text=Rasm"}
        />
        {inCart && <span className="g-card-in-cart">✓ {inCart.qty} ta</span>}
      </div>
      <div className="g-card-body">
        <h3 className="g-card-title">{food.title}</h3>
        <p className="g-card-desc">{food.description}</p>
        <div className="g-card-footer">
          <span className="g-card-price">{food.price.toLocaleString()} so'm</span>
          {inCart ? (
            <div className="g-card-qty" onClick={e => e.stopPropagation()}>
              <button className="g-card-qty-btn minus" onClick={e => onChangeQty(food._id, -1, e)}>−</button>
              <span className="g-card-qty-num">{inCart.qty}</span>
              <button className="g-card-qty-btn plus" onClick={e => onChangeQty(food._id, +1, e)}>+</button>
            </div>
          ) : (
            <button className="g-card-add-btn" onClick={e => onAdd(food, e)} title="Savatga qo'shish">+</button>
          )}
        </div>
      </div>
    </div>
  );
}