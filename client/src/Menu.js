import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, setLangStore, TRANSLATIONS } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const CAT_EMOJI = { "fast food":"🍔","burger":"🍔","pizza":"🍕","salat":"🥗","salatlar":"🥗","desert":"🍦","desertlar":"🍦","ichimliklar":"🥤","sho'rvalar":"🍲","hamir ovqat":"🥟","grill":"🔥","quyuq ovqat":"🍛","ikkinchi taomlar":"🍛","birinchi taomlar":"🍲","default":"🍽" };
const getEmoji = (cat) => CAT_EMOJI[cat?.toLowerCase()] || CAT_EMOJI.default;

// Tilga qarab nom/tavsif/kategoriya olish
const getField = (field, lang) => {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field[lang] || field.uz || field.ru || field.en || "";
};

const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (cart) => { localStorage.setItem("cart", JSON.stringify(cart)); window.dispatchEvent(new Event("cartUpdated")); };
const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "null"); } catch { return null; } };

export default function Menu() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(false);
  const [cart, setCart] = useState(getCart);
  const [banner, setBanner] = useState(null);
  const [profile, setProfile] = useState(getProfile);
  const [lang, setLang] = useState(getLang);
  const catRefs = useRef({});
  const navigate = useNavigate();

  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/foods`).then(r => r.json()),
      fetch(`${API}/api/banner`).then(r => r.json()).catch(() => null),
    ]).then(([foodData, bannerData]) => {
      const arr = Array.isArray(foodData) ? foodData : [];
      setFoods(arr);
      if (arr.length > 0) setActiveCategory(arr[0].category?.uz || arr[0].category || "");
      if (bannerData) setBanner(bannerData);
      setLoading(false);
      setTimeout(() => setVisible(true), 50);
    }).catch(() => setLoading(false));

    const onCart = () => setCart(getCart());
    const onProfile = () => setProfile(getProfile());
    const onLang = () => setLang(getLang());
    window.addEventListener("cartUpdated", onCart);
    window.addEventListener("storage", onCart);
    window.addEventListener("profileUpdated", onProfile);
    window.addEventListener("langChanged", onLang);
    return () => {
      window.removeEventListener("cartUpdated", onCart);
      window.removeEventListener("storage", onCart);
      window.removeEventListener("profileUpdated", onProfile);
      window.removeEventListener("langChanged", onLang);
    };
  }, []);

  // Kategoriyalarni tilda ko'rsatish
  const categoriesRaw = [...new Map(foods.map(f => {
    const key = typeof f.category === "object" ? f.category.uz : f.category;
    return [key, f.category];
  })).values()];

  const getCatDisplay = (cat) => getField(cat, lang);
  const getCatKey = (cat) => typeof cat === "object" ? cat.uz : cat;

  const foodsByCategory = categoriesRaw.reduce((acc, cat) => {
    const key = getCatKey(cat);
    acc[key] = foods.filter(f => {
      const fk = typeof f.category === "object" ? f.category.uz : f.category;
      return fk === key;
    });
    return acc;
  }, {});

  const filteredFoods = search
    ? foods.filter(f => getField(f.title, lang).toLowerCase().includes(search.toLowerCase()) || getField(f.title, "uz").toLowerCase().includes(search.toLowerCase()))
    : null;

  const scrollToCategory = (key) => {
    setActiveCategory(key);
    catRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const addToCart = (food, e) => {
    e.stopPropagation();
    const nc = [...cart, { ...food, qty: 1, _titleCache: getField(food.title, lang) }];
    setCart(nc); saveCart(nc);
  };
  const changeQty = (id, delta, e) => {
    e.stopPropagation();
    const nc = cart.map(i => i._id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0);
    setCart(nc); saveCart(nc);
  };
  const changeLang = (l) => { setLang(l); setLangStore(l); };

  const initials = profile?.name ? profile.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : null;

  if (loading) return (
    <div className="g-loading">
      <div className="g-spinner-wrap"><div className="g-spinner-ring" /><span className="g-spinner-emoji">🍃</span></div>
      <p className="g-loading-text">{t.loading}</p>
    </div>
  );

  return (
    <div className={`g-root ${visible ? "visible" : ""}`}>
      <header className="g-header">
        <div className="g-header-inner">
          <div className="g-logo">
            <span className="g-logo-leaf">🍃</span>
            <div>
              <div className="g-logo-name">{t.appName}</div>
              <div className="g-logo-sub">{t.delivery}</div>
            </div>
          </div>
          <div className="g-header-actions">
            <div className="pf-lang-switcher">
              {["uz", "ru", "en"].map(l => (
                <button key={l} className={`pf-lang-btn ${lang === l ? "active" : ""}`} onClick={() => changeLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="g-orders-btn" onClick={() => navigate("/orders")} title={t.myOrders}>📦</button>
            {initials ? (
              <button className="g-profile-btn" onClick={() => navigate("/profile")}>{initials}</button>
            ) : (
              <button className="g-login-btn" onClick={() => navigate("/login-user")}>{t.login}</button>
            )}
            <button className="g-cart-nav" onClick={() => navigate("/cart")}>
              <span className="g-cart-icon">🛒</span>
              {cartCount > 0 && <span className="g-cart-badge">{cartCount}</span>}
            </button>
          </div>
        </div>
        <div className="g-search-bar">
          <span>🔍</span>
          <input className="g-search-input" placeholder={t.search} value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="g-search-clear" onClick={() => setSearch("")}>✕</button>}
        </div>
        {!search && (
          <div className="g-cat-tabs-wrap">
            <div className="g-cat-tabs">
              {categoriesRaw.map((cat, i) => {
                const key = getCatKey(cat);
                return (
                  <button key={i} className={`g-cat-tab ${activeCategory === key ? "active" : ""}`} onClick={() => scrollToCategory(key)}>
                    <span className="g-cat-tab-emoji">{getEmoji(getCatDisplay(cat))}</span>
                    <span>{getCatDisplay(cat)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {cartCount > 0 && (
        <div className="g-float-cart" onClick={() => navigate("/cart")}>
          <span className="g-float-cart-text">🛒 {cartCount} {t.pieces}</span>
          <span className="g-float-cart-price">{cartTotal.toLocaleString()} so'm</span>
          <span className="g-float-cart-btn">{t.goCart}</span>
        </div>
      )}

      {search ? (
        <main className="g-main">
          <div className="g-section-title"><span>🔍 "{search}" ({filteredFoods.length})</span></div>
          <div className="g-grid">
            {filteredFoods.length === 0 ? <div className="g-empty">{t.noResults}</div>
              : filteredFoods.map((food, i) => (
                <FoodCard key={food._id} food={food} index={i} cart={cart} lang={lang}
                  onOpen={() => navigate(`/food/${food._id}`)}
                  onAdd={addToCart} onChangeQty={changeQty} t={t} />
              ))}
          </div>
        </main>
      ) : (
        <main className="g-main">
          <HeroBanner banner={banner} t={t} foods={foods} />
          {categoriesRaw.map((cat, idx) => {
            const key = getCatKey(cat);
            return (
              <div key={idx} className="g-cat-section" ref={el => catRefs.current[key] = el}>
                <div className="g-section-header">
                  <span className="g-section-emoji">{getEmoji(getCatDisplay(cat))}</span>
                  <h2 className="g-section-title-text">{getCatDisplay(cat)}</h2>
                  <span className="g-section-count">{foodsByCategory[key]?.length} {t.pieces}</span>
                </div>
                <div className="g-grid">
                  {(foodsByCategory[key] || []).map((food, i) => (
                    <FoodCard key={food._id} food={food} index={i} cart={cart} lang={lang}
                      onOpen={() => navigate(`/food/${food._id}`)}
                      onAdd={addToCart} onChangeQty={changeQty} t={t} />
                  ))}
                </div>
              </div>
            );
          })}
        </main>
      )}
    </div>
  );
}

function HeroBanner({ banner, t, foods }) {
  const b = banner || { title: t.menuTitle, subtitle: t.menuSubtitle, description: t.menuDesc, bgColor: "#0d4a28", mediaType: "none", mediaUrl: "", events: [] };
  return (
    <div className="g-hero" style={{ background: b.bgColor, position: "relative", overflow: "hidden" }}>
      {b.mediaType === "image" && b.mediaUrl && <img src={b.mediaUrl} alt="banner" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35, zIndex: 0 }} />}
      {b.mediaType === "video" && b.mediaUrl && <video autoPlay muted loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35, zIndex: 0 }}><source src={b.mediaUrl} /></video>}
      <div style={{ position: "relative", zIndex: 1 }}>
        <h1 className="g-hero-title">{b.title}<br /><span className="g-hero-accent">{b.subtitle}</span></h1>
        <p className="g-hero-desc">{b.description}</p>
        {b.events?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {b.events.map(ev => <span key={ev.id} style={{ background: "rgba(255,255,255,0.18)", color: "white", padding: "4px 12px", borderRadius: 20, fontSize: "0.82rem", fontWeight: 700 }}>{ev.emoji} {ev.label}</span>)}
          </div>
        )}
      </div>
      <div className="g-hero-stats" style={{ position: "relative", zIndex: 1 }}>
        <div className="g-stat"><span className="g-stat-num">{foods.length}+</span><span className="g-stat-label">{t.pieces}</span></div>
        <div className="g-stat-divider" />
        <div className="g-stat"><span className="g-stat-num">30'</span><span className="g-stat-label">{t.deliveryTime}</span></div>
      </div>
    </div>
  );
}

function FoodCard({ food, index, cart, lang, onOpen, onAdd, onChangeQty, t }) {
  const [imgErr, setImgErr] = useState(false);
  const inCart = cart.find(i => i._id === food._id);
  const title = getField(food.title, lang);
  const desc = getField(food.description, lang);
  return (
    <div className="g-card" style={{ animationDelay: `${index * 0.06}s` }} onClick={onOpen}>
      <div className="g-card-img-wrap">
        {!imgErr && food.image ? (
          <img src={food.image} alt={title} className="g-card-img" onError={() => setImgErr(true)} />
        ) : <div className="g-card-img-placeholder">🍽</div>}
        {inCart && <span className="g-card-in-cart">✓ {inCart.qty}</span>}
      </div>
      <div className="g-card-body">
        <h3 className="g-card-title">{title}</h3>
        <p className="g-card-desc">{desc}</p>
        <div className="g-card-footer">
          <span className="g-card-price">{food.price.toLocaleString()} so'm</span>
          {inCart ? (
            <div className="g-card-qty" onClick={e => e.stopPropagation()}>
              <button className="g-card-qty-btn minus" onClick={e => onChangeQty(food._id, -1, e)}>−</button>
              <span className="g-card-qty-num">{inCart.qty}</span>
              <button className="g-card-qty-btn plus" onClick={e => onChangeQty(food._id, +1, e)}>+</button>
            </div>
          ) : (
            <button className="g-card-add-btn" onClick={e => onAdd(food, e)}>+</button>
          )}
        </div>
      </div>
    </div>
  );
}