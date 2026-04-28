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

const getCart = () => {
  try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
};

export default function Menu() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const catRefs = useRef({});
  const navigate = useNavigate();

  const updateCartInfo = () => {
    const cart = getCart();
    const count = cart.reduce((t, i) => t + i.qty, 0);
    const total = cart.reduce((t, i) => t + i.price * i.qty, 0);
    setCartCount(count);
    setCartTotal(total);
  };

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

    updateCartInfo();

    // Boshqa tabdan va same tabdan o'zgarishlarni tinglash
    window.addEventListener("storage", updateCartInfo);
    window.addEventListener("cartUpdated", updateCartInfo);
    return () => {
      window.removeEventListener("storage", updateCartInfo);
      window.removeEventListener("cartUpdated", updateCartInfo);
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

          {/* Savat tugmasi — header o'ng tomoni */}
          <button className="g-cart-nav" onClick={() => navigate("/cart")} aria-label="Savatga o'tish">
            <span className="g-cart-icon">🛒</span>
            {cartCount > 0 && <span className="g-cart-badge">{cartCount}</span>}
          </button>
        </div>

        <div className="g-search-bar">
          <span>🔍</span>
          <input
            className="g-search-input"
            placeholder="Taom qidiring..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="g-search-clear" onClick={() => setSearch("")}>✕</button>
          )}
        </div>

        {!search && (
          <div className="g-cat-tabs-wrap">
            <div className="g-cat-tabs">
              {categories.map(cat => (
                <button
                  key={cat}
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

      {/* FLOATING CART BAR — savat bo'sh bo'lmasa pastda chiqadi */}
      {cartCount > 0 && (
        <div className="g-float-cart" onClick={() => navigate("/cart")}>
          <span className="g-float-cart-text">
            🛒 {cartCount} ta mahsulot
          </span>
          <span className="g-float-cart-price">
            {cartTotal.toLocaleString()} so'm
          </span>
          <span className="g-float-cart-btn">Savatga o'tish →</span>
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
                <FoodCard
                  key={food._id}
                  food={food}
                  index={i}
                  onOpen={() => navigate(`/food/${food._id}`)}
                />
              ))}
          </div>
        </main>
      ) : (
        <main className="g-main">
          {/* Hero Section */}
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

          {/* Category Sections */}
          {categories.map(cat => (
            <div key={cat} className="g-cat-section" ref={el => catRefs.current[cat] = el}>
              <div className="g-section-header">
                <span className="g-section-emoji">{getEmoji(cat)}</span>
                <h2 className="g-section-title-text">{cat}</h2>
                <span className="g-section-count">{foodsByCategory[cat].length} ta</span>
              </div>
              <div className="g-grid">
                {foodsByCategory[cat].map((food, i) => (
                  <FoodCard
                    key={food._id}
                    food={food}
                    index={i}
                    onOpen={() => navigate(`/food/${food._id}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </main>
      )}
    </div>
  );
}

function FoodCard({ food, index, onOpen }) {
  const inCart = (() => {
    try {
      const cart = JSON.parse(localStorage.getItem("cart") || "[]");
      return cart.find(i => i._id === food._id);
    } catch { return null; }
  })();

  return (
    <div
      className="g-card"
      style={{ animationDelay: `${index * 0.06}s` }}
      onClick={onOpen}
    >
      <div className="g-card-img-wrap">
        <img
          src={food.image?.startsWith("http") ? food.image : `${API}${food.image}`}
          alt={food.title}
          className="g-card-img"
          onError={e => e.target.src = "https://placehold.co/300x200/e8f5ee/1d6b3e?text=Rasm"}
        />
        {inCart && (
          <span className="g-card-in-cart">✓ {inCart.qty} ta</span>
        )}
      </div>
      <div className="g-card-body">
        <h3 className="g-card-title">{food.title}</h3>
        <p className="g-card-desc">{food.description}</p>
        <div className="g-card-footer">
          <span className="g-card-price">{food.price.toLocaleString()} so'm</span>
          <span className="g-card-arrow">→</span>
        </div>
      </div>
    </div>
  );
}