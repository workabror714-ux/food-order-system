import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, setLangStore, TRANSLATIONS, LOGO_GREEN, LOGO_WHITE } from "./i18n";
import { CategoryIcon, AppIcon } from "./icons";
import { cachedGet } from "./api";
import { thumb, imgFallback } from "./img";

const CATEGORY_ORDER = [
  "Birinchi taomlar", "Suyuq taomlar", "Sho'rvalar",
  "Quyuq ovqat", "Ikkinchi taomlar", "Go'shtli asortiment",
  "Grill", "Hamir ovqat", "Pide",
  "Salatlar", "Fast food", "Burger", "Pizza",
  "Ichimliklar", "Bar", "Desertlar", "Desert"
];

const normalizeCat = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[’‘`ʻʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const getField = (field, lang) => {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field[lang] || field.uz || field.ru || field.en || "";
};

const getCatKey = (cat) => typeof cat === "object" ? cat.uz : cat;
const getCategoryRank = (cat) => {
  const key = normalizeCat(getCatKey(cat));

  // "Asosiy menu", "Asosiy menyu", "Asosiy taomlar" kabi nomlar har doim birinchi chiqadi
  if (key.includes("asosiy")) return 0;

  const idx = CATEGORY_ORDER.findIndex(c => normalizeCat(c) === key);
  return idx === -1 ? 999 : idx + 1;
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
      cachedGet("/api/foods"),
      cachedGet("/api/banners").catch(() => []),
    ]).then(([fd, bd]) => {
      const rawFoods = Array.isArray(fd) ? fd : [];

      const deleverFoods = rawFoods.filter(
        (food) =>
          food?.source === "delever" &&
          food?.deleverId
      );

      /*
       * Bir xil deleverCategoryId ichidagi barcha itemlarga
       * bitta canonical kategoriya obyektini beramiz.
       * Bu "Салаты / САЛАТЫ" kabi takrorlarni yo'qotadi.
       */
      const categoryById = new Map();

      deleverFoods.forEach((food) => {
        if (
          food.deleverCategoryId &&
          !categoryById.has(food.deleverCategoryId)
        ) {
          categoryById.set(
            food.deleverCategoryId,
            food.category
          );
        }
      });

      const arr = deleverFoods.map((food) => ({
        ...food,
        category:
          categoryById.get(
            food.deleverCategoryId
          ) || food.category,
      }));

      setFoods(arr);

      if (arr.length > 0) {
        const initialCategories = sortCategories([
          ...new Map(
            arr.map((food) => [
              food.deleverCategoryId ||
                (typeof food.category === "object"
                  ? food.category.uz
                  : food.category),
              food.category,
            ])
          ).values(),
        ]);
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

  const categoriesRaw = sortCategories([
    ...new Map(
      foods.map((food) => [
        food.deleverCategoryId ||
          (typeof food.category === "object"
            ? food.category.uz
            : food.category),
        food.category,
      ])
    ).values(),
  ]);
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
    <div className="g-root visible">
      <div className="sk-top">
        <div className="sk sk-search" />
        <div className="sk-tabs">
          {[...Array(5)].map((_, i) => <div key={i} className="sk sk-tab" />)}
        </div>
      </div>
      <div className="g-main">
        <div className="sk sk-banner" />
        <div className="sk sk-section" />
        <div className="g-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="g-card sk-card">
              <div className="sk sk-img" />
              <div className="sk-card-body">
                <div className="sk sk-line w80" />
                <div className="sk sk-line w55" />
                <div className="sk sk-line w40 mt" />
              </div>
            </div>
          ))}
        </div>
      </div>
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
          </div>
        </div>
        <div className="g-search-bar">
          <span className="g-search-icon"><AppIcon name="search" size={18} /></span>
          <input className="g-search-input" placeholder={t.search} value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="g-search-clear" onClick={() => setSearch("")}><AppIcon name="close" size={16} /></button>}
        </div>
        {!search && (
          <div className="g-cat-tabs-wrap">
            <div className="g-cat-tabs">
              {categoriesRaw.map((cat, i) => {
                const key = getCatKey(cat);
                return (
                  <button key={i} className={`g-cat-tab ${activeCategory === key ? "active" : ""}`} onClick={() => scrollToCategory(key)}>
                    <span className="g-cat-tab-emoji"><CategoryIcon name={getCatDisplay(cat)} size={18} /></span>
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
          <span className="g-float-cart-text"><AppIcon name="cart" size={16} /> {cartCount} {t.pieces}</span>
          <span className="g-float-cart-price">{cartTotal.toLocaleString()} so'm</span>
          <span className="g-float-cart-btn">{t.goCart}</span>
        </div>
      )}

      {search ? (
        <main className="g-main">
          <div className="g-section-title"><span><AppIcon name="search" size={18} /> "{search}" ({filteredFoods.length} {t.pieces})</span></div>
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
          <PopularRow foods={foods} lang={lang} navigate={navigate} t={t} />
          {categoriesRaw.map((cat, idx) => {
            const key = getCatKey(cat);
            return (
              <div key={idx} className="g-cat-section" ref={el => catRefs.current[key] = el} data-cat={key}>
                <div className="g-section-header">
                  <span className="g-section-emoji"><CategoryIcon name={getCatDisplay(cat)} size={20} /></span>
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
        <span className="bottom-nav-icon"><AppIcon name="menu" size={22} /></span>
        <span>Menyu</span>
      </button>
      <button className={`bottom-nav-btn ${active==="cart"?"active":""}`} onClick={() => navigate("/cart")} style={{position:"relative"}}>
        <span className="bottom-nav-icon"><AppIcon name="cart" size={22} /></span>
        <span>Savat</span>
        {cartCount > 0 && <span className="bottom-nav-badge">{cartCount}</span>}
      </button>
      <button className={`bottom-nav-btn ${active==="orders"?"active":""}`} onClick={() => navigate("/orders")}>
        <span className="bottom-nav-icon"><AppIcon name="orders" size={22} /></span>
        <span>Buyurtmalar</span>
      </button>
      <button className={`bottom-nav-btn ${active==="profile"?"active":""}`} onClick={() => navigate("/profile")}>
        <span className="bottom-nav-icon"><AppIcon name="profile" size={22} /></span>
        <span>Profil</span>
      </button>
    </nav>
  );
}

function HeroBanner({ banners, t, foods, navigate }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drag, setDrag] = useState(0);
  const startX = useRef(null);

  // Avtomat almashish — har slaydda qayta o'rnatiladi (progress bilan sinxron),
  // pauza yoki swipe paytida to'xtaydi
  useEffect(() => {
    if (paused || dragging || !banners || banners.length <= 1) return;
    const id = setTimeout(() => setActive(a => (a + 1) % banners.length), 4000);
    return () => clearTimeout(id);
  }, [active, paused, dragging, banners]);

  if (!banners || banners.length === 0) {
    banners = [{ _id:"default", title:t.menuTitle, subtitle:t.menuSubtitle,
      description:t.menuDesc, bgColor:"#1a5c30", mediaType:"none",
      mediaUrl:"", events:[], promoCategory:"", promoLabel:"Aksiya taomlar" }];
  }

  const n = banners.length;
  const idx = n ? ((active % n) + n) % n : 0;
  const b = banners[idx] || banners[0];

  const goTo = (i) => setActive(((i % n) + n) % n);
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; setDragging(true); setPaused(true); };
  const onTouchMove = (e) => { if (startX.current == null) return; setDrag(e.touches[0].clientX - startX.current); };
  const onTouchEnd = () => {
    const dx = drag; startX.current = null; setDragging(false); setDrag(0);
    if (n > 1 && dx > 45) goTo(idx - 1);
    else if (n > 1 && dx < -45) goTo(idx + 1);
    setPaused(false);
  };

  // Aksiya taomlar - promoCategory bo'yicha filter
  const promoFoods = b.promoCategory
    ? foods.filter(f => {
        const cat = typeof f.category === "object" ? f.category.uz : f.category;
        return cat?.toLowerCase() === b.promoCategory?.toLowerCase();
      }).slice(0, 4)
    : [];

  return (
    <div style={{ marginBottom: promoFoods.length > 0 ? 8 : 22 }}>

      {/* ─── BANNER KARUSEL (swipe + silliq o'tish) ───── */}
      <div className="g-hero-viewport"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className={`g-hero-track${dragging ? "" : " animate"}`}
          style={{ transform: `translateX(calc(${-idx * 100}% + ${drag}px))` }}>
          {banners.map((bn, i) => {
            // To'liq-rasmli banner: matn (title) bo'sh va media bor bo'lsa —
            // sayt overlay/logo/matnini ko'rsatmaymiz, faqat toza rasm chiqadi.
            const isFull = !bn.title && bn.mediaType !== "none" && bn.mediaUrl;
            return (
            <div key={bn._id || i} className={`g-hero-slide${isFull ? " g-hero-full" : ""}`} style={{ background: bn.bgColor }}>
              {/* Media — to'liq ko'rinadi, rasmda yengil Ken Burns zoom */}
              {bn.mediaType === "image" && bn.mediaUrl && (
                <img src={thumb(bn.mediaUrl, 900)} alt="" className="g-hero-media is-image" draggable="false"
                  loading={i === 0 ? "eager" : "lazy"} decoding="async"
                  fetchpriority={i === 0 ? "high" : "auto"}
                  onError={(e) => imgFallback(e, bn.mediaUrl)} />
              )}
              {bn.mediaType === "video" && bn.mediaUrl && (
                <video autoPlay muted loop playsInline className="g-hero-media">
                  <source src={bn.mediaUrl} />
                </video>
              )}
              {!isFull && bn.mediaType !== "none" && bn.mediaUrl && <div className="g-hero-overlay" />}
              {!isFull && <div className="g-hero-accent-line" />}

              {!isFull && (
              <div className="g-hero-content">
                <img src={LOGO_WHITE} alt="Yalpiz" className="g-hero-logo" draggable="false" />
                <h1 className="g-hero-title">
                  {bn.title}<br/>
                  <span className="g-hero-accent">{bn.subtitle}</span>
                </h1>
                {bn.description && <p className="g-hero-desc">{bn.description}</p>}
                {bn.events?.length > 0 && (
                  <div className="g-hero-events">
                    {bn.events.map(ev => (
                      <span key={ev.id} className="g-hero-event">{ev.emoji} {ev.label}</span>
                    ))}
                  </div>
                )}
                {bn.buttonText && (
                  <button className="g-hero-btn" style={{ color: bn.bgColor }}
                    onClick={() => bn.buttonLink && window.open(bn.buttonLink, "_blank")}>
                    {bn.buttonText}
                  </button>
                )}
              </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* ─── PROGRESS (2+ banner) ─────────────────────── */}
      {n > 1 && (
        <div className="g-hero-progress">
          {banners.map((_, i) => (
            <button key={i} className="g-hero-prog-seg" onClick={() => goTo(i)} aria-label={`Banner ${i + 1}`}>
              <span className="g-hero-prog-bg" />
              {i < idx && <span className="g-hero-prog-fill done" />}
              {i === idx && (
                <span key={active}
                  className={`g-hero-prog-fill active${paused || dragging ? " paused" : ""}`} />
              )}
            </button>
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
              <span style={{ display:"inline-flex" }}><AppIcon name="tag" size={18} /></span>
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
                      ? <img src={thumb(food.image, 300)} alt={title} loading="lazy" decoding="async" onError={(e) => imgFallback(e, food.image)} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                      : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--g)" }}><AppIcon name="menu" size={26} /></div>
                    }
                    <span style={{
                      position:"absolute",top:5,left:5,
                      background:"#ef4444",color:"white",
                      borderRadius:8,padding:"2px 7px",
                      fontSize:"0.65rem",fontWeight:800
                    }}><AppIcon name="tag" size={11} strokeWidth={2.5} /> Aksiya</span>
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


function PopularRow({ foods, lang, navigate, t }) {
  // Mashhur: mavjud taomlardan eng qimmat 10 tasi (premium/tavsiya)
  const popular = foods
    .filter(foodIsAvailable)
    .slice()
    .sort((a, b) => (b.price || 0) - (a.price || 0))
    .slice(0, 10);
  if (popular.length < 3) return null;
  return (
    <div className="g-pop">
      <div className="g-pop-head">
        <span className="g-pop-title"><AppIcon name="flame" size={18} /> {t.popular || "Mashhur taomlar"}</span>
      </div>
      <div className="g-pop-scroll">
        {popular.map(food => {
          const title = getField(food.title, lang);
          return (
            <div key={food._id} className="g-pop-card" onClick={() => navigate(`/food/${food._id}`)}>
              <div className="g-pop-img">
                {food.image
                  ? <img src={thumb(food.image, 360)} alt={title} loading="lazy" decoding="async" onError={(e) => imgFallback(e, food.image)} />
                  : <div className="g-pop-ph"><AppIcon name="menu" size={28} /></div>}
              </div>
              <div className="g-pop-body">
                <p className="g-pop-name">{title}</p>
                <p className="g-pop-price">{food.price.toLocaleString()}<small> so'm</small></p>
              </div>
            </div>
          );
        })}
      </div>
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
          <img src={thumb(food.image, 480)} alt={title} className="g-card-img" loading="lazy" decoding="async"
            onError={(e) => { if (e.currentTarget.dataset.fb) { setImgErr(true); } else { e.currentTarget.dataset.fb = "1"; e.currentTarget.src = food.image; } }} />
        ) : <div className="g-card-img-placeholder"><AppIcon name="menu" size={32} /></div>}
        {!available && <span className="g-card-unavailable-badge">Hozircha yo‘q</span>}
        {inCart && available && <span className="g-card-in-cart"><AppIcon name="check" size={13} strokeWidth={3} /> {inCart.qty}</span>}
      </div>
      <div className="g-card-body">
        <h3 className="g-card-title">{title}</h3>
        <p className="g-card-desc">{desc}</p>
        <div className="g-card-footer">
          <span className="g-card-price">{food.price.toLocaleString()}<small> so'm</small></span>
          {!available ? (
            <button className="g-card-add-btn disabled" disabled aria-label="Mavjud emas"><AppIcon name="close" size={18} /></button>
          ) : inCart ? (
            <div className="g-card-qty" onClick={e => e.stopPropagation()}>
              <button className="g-card-qty-btn minus" onClick={e => onChangeQty(food._id, -1, e)} aria-label="Kamaytirish"><AppIcon name="minus" size={16} strokeWidth={2.5} /></button>
              <span className="g-card-qty-num">{inCart.qty}</span>
              <button className="g-card-qty-btn plus" onClick={e => onChangeQty(food._id, +1, e)} aria-label="Ko‘paytirish"><AppIcon name="plus" size={16} strokeWidth={2.5} /></button>
            </div>
          ) : <button className="g-card-add-btn" onClick={e => onAdd(food, e)} aria-label="Savatga qo‘shish"><AppIcon name="plus" size={20} strokeWidth={2.5} /></button>}
        </div>
      </div>
    </div>
  );
}