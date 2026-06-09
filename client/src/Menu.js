import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, setLangStore, TRANSLATIONS, LOGO_GREEN, LOGO_WHITE } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const CAT_EMOJI = {
  "fast food":"🍔","burger":"🍔","pizza":"🍕","salat":"🥗","salatlar":"🥗",
  "desert":"🍦","desertlar":"🍦","ichimliklar":"🥤","sho'rvalar":"🍲",
  "hamir ovqat":"🥟","grill":"🔥","quyuq ovqat":"🍛","ikkinchi taomlar":"🍛",
  "birinchi taomlar":"🍲","pide":"🫓","bar":"🥤","go'shtli asortiment":"🥩",
  "suyuq taomlar":"🍲","default":"🍽"
};

const CATEGORY_ORDER = [
  "Birinchi taomlar", "Suyuq taomlar", "Sho'rvalar",
  "Quyuq ovqat", "Ikkinchi taomlar", "Go'shtli asortiment",
  "Grill", "Hamir ovqat", "Pide",
  "Salatlar", "Fast food", "Burger", "Pizza",
  "Ichimliklar", "Bar", "Desertlar", "Desert"
];

const normalizeCat = (v) => String(v || "").toLowerCase().trim();
const getEmoji = (cat) => CAT_EMOJI[cat?.toLowerCase()] || CAT_EMOJI.default;
const getField = (field, lang) => {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field[lang] || field.uz || field.ru || field.en || "";
};

const getCatKey = (cat) => typeof cat === "object" ? cat.uz : cat;
const getCategoryRank = (cat) => {
  const key = normalizeCat(getCatKey(cat));
  const idx = CATEGORY_ORDER.findIndex(c => normalizeCat(c) === key);
  return idx === -1 ? 999 : idx;
};
const sortCategories = (cats) => [...cats].sort((a, b) => {
  const rankA = getCategoryRank(a);
  const rankB = getCategoryRank(b);
  if (rankA !== rankB) return rankA - rankB;
  return normalizeCat(getCatKey(a)).localeCompare(normalizeCat(getCatKey(b)));
});
const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (c) => { localStorage.setItem("cart", JSON.stringify(c)); window.dispatchEvent(new Event("cartUpdated")); };
const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "null"); } catch { return null; } };
const foodIsAvailable = (food) => food?.isAvailable !== false;

export default function Menu() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(false);
  const [cart, setCart] = useState(getCart);
  const [banner, setBanner] = useState([]);
  const [activeBanner, setActiveBanner] = useState(0);
  const [profile, setProfile] = useState(getProfile);
  const [lang, setLang] = useState(getLang);
  const catRefs = useRef({});
  const navigate = useNavigate();
  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  useEffect(() => {
    // URL dan kategoriya parametr
    const urlCat = new URLSearchParams(window.location.search).get("cat");

    Promise.all([
      fetch(`${API}/api/foods`).then(r => r.json()),
      fetch(`${API}/api/banners`).then(r => r.json()).catch(() => []),
    ]).then(([fd, bd]) => {
      const arr = Array.isArray(fd) ? fd : [];
      setFoods(arr);
      if (arr.length > 0) {
        const initialCategories = sortCategories([...new Map(arr.map(f => {
          const key = typeof f.category === "object" ? f.category.uz : f.category;
          return [key, f.category];
        })).values()]);
        const first = urlCat || (initialCategories[0] && getCatKey(initialCategories[0]));
        setActiveCategory(first);
        if (urlCat) setTimeout(() => {
          catRefs.current[urlCat]?.scrollIntoView({ behavior:"smooth", block:"start" });
        }, 400);
      }
      if (bd && bd.length > 0) setBanner(bd);
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

  const categoriesRaw = sortCategories([...new Map(foods.map(f => {
    const key = typeof f.category === "object" ? f.category.uz : f.category;
    return [key, f.category];
  })).values()]);
  const getCatDisplay = (cat) => getField(cat, lang);
  const foodsByCategory = categoriesRaw.reduce((acc, cat) => {
    const key = getCatKey(cat);
    acc[key] = foods.filter(f => (typeof f.category === "object" ? f.category.uz : f.category) === key);
    return acc;
  }, {});
  const filteredFoods = search
    ? foods.filter(f => getField(f.title, lang).toLowerCase().includes(search.toLowerCase()) || getField(f.title, "uz").toLowerCase().includes(search.toLowerCase()))
    : null;
  const scrollToCategory = (key) => { setActiveCategory(key); catRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const addToCart = (food, e) => {
    e.stopPropagation();
    if (!foodIsAvailable(food)) { alert("Bu taom hozircha mavjud emas"); return; }
    const nc = [...cart, { ...food, qty: 1 }];
    setCart(nc);
    saveCart(nc);
  };
  const changeQty = (id, delta, e) => { e.stopPropagation(); const nc = cart.map(i => i._id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0); setCart(nc); saveCart(nc); };
  const changeLang = (l) => { setLang(l); setLangStore(l); };
  const initials = profile?.name ? profile.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : null;

  if (loading) return (
    <div className="g-loading">
      <div className="g-spinner-wrap">
        <div className="g-spinner-ring" />
        <img src={LOGO_GREEN} alt="Yalpiz" style={{ height: 40, width: "auto", objectFit: "contain" }} />
      </div>
      <p className="g-loading-text">{t.loading}</p>
    </div>
  );

  return (
    <div className={`g-root ${visible ? "visible" : ""}`}>
      <header className="g-header">
        <div className="g-header-inner">
          {/* LOGO */}
          <div className="g-logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
            <img src={LOGO_GREEN} alt="Yalpiz Restaurant" className="g-logo-img" />
          </div>
          {/* ACTIONS */}
          <div className="g-header-actions">
            <div className="pf-lang-switcher">
              {["uz", "ru", "en"].map(l => (
                <button key={l} className={`pf-lang-btn ${lang === l ? "active" : ""}`} onClick={() => changeLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            {initials ? (
              <button className="g-profile-btn" onClick={() => navigate("/profile")}>{initials}</button>
            ) : (
              <button className="g-login-btn" onClick={() => navigate("/login-user")}>{t.login}</button>
            )}
            <button className="g-cart-nav" onClick={() => navigate("/cart")}>
              🛒
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
          <div className="g-section-title"><span>🔍 "{search}" ({filteredFoods.length} {t.pieces})</span></div>
          <div className="g-grid">
            {filteredFoods.length === 0 ? <div className="g-empty">{t.noResults}</div>
              : filteredFoods.map((food, i) => (
                <FoodCard key={food._id} food={food} index={i} cart={cart} lang={lang}
                  onOpen={() => navigate(`/food/${food._id}`)} onAdd={addToCart} onChangeQty={changeQty} t={t} />
              ))}
          </div>
        </main>
      ) : (
        <main className="g-main">
          <HeroBanner banners={banner} t={t} foods={foods} navigate={navigate} />
          {categoriesRaw.map((cat, idx) => {
            const key = getCatKey(cat);
            return (
              <div key={idx} className="g-cat-section" ref={el => catRefs.current[key] = el} data-cat={key}>
                <div className="g-section-header">
                  <span className="g-section-emoji">{getEmoji(getCatDisplay(cat))}</span>
                  <h2 className="g-section-title-text">{getCatDisplay(cat)}</h2>
                  <span className="g-section-count">{foodsByCategory[key]?.length} {t.pieces}</span>
                </div>
                <div className="g-grid">
                  {(foodsByCategory[key] || []).map((food, i) => (
                    <FoodCard key={food._id} food={food} index={i} cart={cart} lang={lang}
                      onOpen={() => navigate(`/food/${food._id}`)} onAdd={addToCart} onChangeQty={changeQty} t={t} />
                  ))}
                </div>
              </div>
            );
          })}
        </main>
      )}
      {/* BOTTOM NAV */}
      <BottomNav active="menu" cartCount={cartCount} navigate={navigate} />
    </div>
  );
}

function BottomNav({ active, cartCount, navigate }) {
  return (
    <nav className="bottom-nav">
      <button className={`bottom-nav-btn ${active==="menu"?"active":""}`} onClick={() => navigate("/")}>
        <span className="bottom-nav-icon">🍽</span>
        <span>Menyu</span>
      </button>
      <button className={`bottom-nav-btn ${active==="cart"?"active":""}`} onClick={() => navigate("/cart")} style={{position:"relative"}}>
        <span className="bottom-nav-icon">🛒</span>
        <span>Savat</span>
        {cartCount > 0 && <span className="bottom-nav-badge">{cartCount}</span>}
      </button>
      <button className={`bottom-nav-btn ${active==="orders"?"active":""}`} onClick={() => navigate("/orders")}>
        <span className="bottom-nav-icon">📦</span>
        <span>Buyurtmalar</span>
      </button>
      <button className={`bottom-nav-btn ${active==="profile"?"active":""}`} onClick={() => navigate("/profile")}>
        <span className="bottom-nav-icon">👤</span>
        <span>Profil</span>
      </button>
    </nav>
  );
}

function HeroBanner({ banners, t, foods, navigate }) {
  const [active, setActive] = useState(0);

  // Auto-slide har 4 soniyada
  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const timer = setInterval(() => setActive(a => (a + 1) % banners.length), 4000);
    return () => clearInterval(timer);
  }, [banners]);

  if (!banners || banners.length === 0) {
    banners = [{ _id:"default", title:t.menuTitle, subtitle:t.menuSubtitle,
      description:t.menuDesc, bgColor:"#1a5c30", mediaType:"none",
      mediaUrl:"", events:[], promoCategory:"", promoLabel:"Aksiya taomlar" }];
  }

  const b = banners[active] || banners[0];

  // Aksiya taomlar - promoCategory bo'yicha filter
  const promoFoods = b.promoCategory
    ? foods.filter(f => {
        const cat = typeof f.category === "object" ? f.category.uz : f.category;
        return cat?.toLowerCase() === b.promoCategory?.toLowerCase();
      }).slice(0, 4)
    : [];

  return (
    <div style={{ marginBottom: promoFoods.length > 0 ? 8 : 22 }}>

      {/* ─── BANNER SLIDE ─────────────────────────────── */}
      <div className="g-hero" style={{
        background: b.bgColor, position:"relative",
        overflow:"hidden", transition:"background 0.4s"
      }}>
        {/* Background media */}
        {b.mediaType === "image" && b.mediaUrl && (
          <img src={b.mediaUrl} alt="banner" style={{
            position:"absolute",inset:0,width:"100%",height:"100%",
            objectFit:"cover",opacity:0.35,zIndex:0
          }} />
        )}
        {b.mediaType === "video" && b.mediaUrl && (
          <video autoPlay muted loop playsInline style={{
            position:"absolute",inset:0,width:"100%",height:"100%",
            objectFit:"cover",opacity:0.35,zIndex:0
          }}>
            <source src={b.mediaUrl} />
          </video>
        )}
        <div style={{
          position:"absolute",bottom:0,left:0,right:0,
          height:3,background:"rgba(163,212,91,0.5)",zIndex:1
        }} />

        {/* Banner content */}
        <div style={{ position:"relative",zIndex:2,flex:1 }}>
          <img src={LOGO_WHITE} alt="Yalpiz" style={{
            height:26,width:"auto",maxWidth:110,objectFit:"contain",
            marginBottom:8,opacity:0.9,
            filter:"drop-shadow(0 1px 3px rgba(0,0,0,0.3))"
          }} />
          <h1 className="g-hero-title">
            {b.title}<br/>
            <span className="g-hero-accent">{b.subtitle}</span>
          </h1>
          {b.description && (
            <p className="g-hero-desc">{b.description}</p>
          )}
          {/* Event chiplar */}
          {b.events?.length > 0 && (
            <div style={{ display:"flex",flexWrap:"wrap",gap:8,marginTop:10 }}>
              {b.events.map(ev => (
                <span key={ev.id} style={{
                  background:"rgba(255,255,255,0.18)",color:"white",
                  padding:"4px 12px",borderRadius:20,
                  fontSize:"0.8rem",fontWeight:700
                }}>
                  {ev.emoji} {ev.label}
                </span>
              ))}
            </div>
          )}
          {/* Tugma */}
          {b.buttonText && (
            <button
              onClick={() => b.buttonLink && window.open(b.buttonLink,"_blank")}
              style={{
                marginTop:12,background:"white",color:b.bgColor,
                border:"none",borderRadius:20,padding:"8px 18px",
                fontWeight:800,fontSize:"0.85rem",cursor:"pointer"
              }}>
              {b.buttonText}
            </button>
          )}
        </div>
      </div>

      {/* ─── DOTS (2+ banner) ─────────────────────────── */}
      {banners.length > 1 && (
        <div style={{ display:"flex",justifyContent:"center",gap:6,marginTop:8 }}>
          {banners.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} style={{
              width: i === active ? 22 : 8, height:8,
              borderRadius:20,border:"none",cursor:"pointer",
              background: i === active ? "var(--g)" : "var(--border)",
              transition:"all 0.3s",padding:0
            }} />
          ))}
        </div>
      )}

      {/* ─── AKSIYA TAOMLAR ───────────────────────────── */}
      {promoFoods.length > 0 && (
        <div style={{
          background:"white",borderRadius:"0 0 18px 18px",
          border:"1.5px solid var(--border)",borderTop:"none",
          padding:"14px 16px",marginBottom:8
        }}>
          {/* Sarlavha */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ fontSize:"1.1rem" }}>🔥</span>
              <span style={{ fontWeight:800,fontSize:"0.95rem",color:"var(--g4)" }}>
                {b.promoLabel || "Aksiya taomlar"}
              </span>
            </div>
            <button
              onClick={() => {
                // Kategoriyaga scroll qilish
                const catRef = b.promoCategory;
                const el = document.querySelector(`[data-cat="${catRef}"]`);
                if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
              }}
              style={{
                background:"var(--g3)",border:"none",borderRadius:20,
                padding:"5px 14px",fontSize:"0.78rem",fontWeight:700,
                color:"var(--g)",cursor:"pointer"
              }}>
              Hammasini ko'rish →
            </button>
          </div>

          {/* Taomlar grid */}
          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",
            gap:10
          }}>
            {promoFoods.map((food, i) => {
              const title = typeof food.title==="object" ? food.title.uz : food.title;
              return (
                <div key={food._id} onClick={() => navigate(`/food/${food._id}`)}
                  style={{
                    background:"var(--bg)",borderRadius:12,overflow:"hidden",
                    cursor:"pointer",border:"1.5px solid var(--border)",
                    transition:"transform 0.2s",
                  }}
                  onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
                  onMouseLeave={e=>e.currentTarget.style.transform=""}>
                  {/* Rasm */}
                  <div style={{ height:80,background:"var(--g3)",position:"relative",overflow:"hidden" }}>
                    {food.image
                      ? <img src={food.image} alt={title} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                      : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.6rem" }}>🍽</div>
                    }
                    <span style={{
                      position:"absolute",top:5,left:5,
                      background:"#ef4444",color:"white",
                      borderRadius:8,padding:"2px 7px",
                      fontSize:"0.65rem",fontWeight:800
                    }}>🔥 Aksiya</span>
                  </div>
                  {/* Info */}
                  <div style={{ padding:"7px 9px" }}>
                    <p style={{
                      fontWeight:700,fontSize:"0.78rem",color:"var(--g4)",
                      marginBottom:3,lineHeight:1.3,
                      display:"-webkit-box",WebkitLineClamp:2,
                      WebkitBoxOrient:"vertical",overflow:"hidden"
                    }}>{title}</p>
                    <p style={{ fontWeight:900,fontSize:"0.82rem",color:"var(--g)" }}>
                      {food.price?.toLocaleString()} so'm
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


function FoodCard({ food, index, cart, lang, onOpen, onAdd, onChangeQty, t }) {
  const [imgErr, setImgErr] = useState(false);
  const inCart = cart.find(i => i._id === food._id);
  const title = getField(food.title, lang);
  const desc = getField(food.description, lang);
  const available = foodIsAvailable(food);
  return (
    <div className={`g-card ${!available ? "g-card-unavailable" : ""}`} style={{ animationDelay:`${index * 0.05}s` }} onClick={onOpen}>
      <div className="g-card-img-wrap">
        {!imgErr && food.image ? (
          <img src={food.image} alt={title} className="g-card-img" onError={() => setImgErr(true)} />
        ) : <div className="g-card-img-placeholder">🍽</div>}
        {!available && <span className="g-card-unavailable-badge">Hozircha yo‘q</span>}
        {inCart && available && <span className="g-card-in-cart">✓ {inCart.qty}</span>}
      </div>
      <div className="g-card-body">
        <h3 className="g-card-title">{title}</h3>
        <p className="g-card-desc">{desc}</p>
        <div className="g-card-footer">
          <span className="g-card-price">{food.price.toLocaleString()} so'm</span>
          {!available ? (
            <button className="g-card-add-btn disabled" disabled>×</button>
          ) : inCart ? (
            <div className="g-card-qty" onClick={e => e.stopPropagation()}>
              <button className="g-card-qty-btn minus" onClick={e => onChangeQty(food._id, -1, e)}>−</button>
              <span className="g-card-qty-num">{inCart.qty}</span>
              <button className="g-card-qty-btn plus" onClick={e => onChangeQty(food._id, +1, e)}>+</button>
            </div>
          ) : <button className="g-card-add-btn" onClick={e => onAdd(food, e)}>+</button>}
        </div>
      </div>
    </div>
  );
}