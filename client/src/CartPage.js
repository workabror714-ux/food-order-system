import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, TRANSLATIONS } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (cart) => { localStorage.setItem("cart", JSON.stringify(cart)); window.dispatchEvent(new Event("cartUpdated")); };
const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "{}"); } catch { return {}; } };
const getSaved = () => { try { return JSON.parse(localStorage.getItem("savedAddresses") || "[]"); } catch { return []; } };

const fmtPhone = (v) => { const d = v.replace(/\D/g,"").replace(/^998/,"").slice(0,9); let r=""; if(d.length>0)r+=d.slice(0,2); if(d.length>2)r+=" "+d.slice(2,5); if(d.length>5)r+=" "+d.slice(5,7); if(d.length>7)r+=" "+d.slice(7,9); return r; };
const rawPhone = (f) => "+998"+f.replace(/\s/g,"");
const isValid = (f) => f.replace(/\s/g,"").length===9;

export default function CartPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(getLang);
  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;
  const [cart, setCart] = useState(getCart);
  const [step, setStep] = useState("cart");
  const [form, setForm] = useState(() => {
    const p = getProfile();
    const ph = p.phone ? p.phone.replace("+998","").replace(/\D/g,"") : "";
    return { name: p.name||"", phoneFormatted: fmtPhone(ph), address: "" };
  });
  const [location, setLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [savedAddr, setSavedAddr] = useState(getSaved);
  const [showPicker, setShowPicker] = useState(false);

  const total = cart.reduce((s,i) => s+i.price*i.qty, 0);
  const count = cart.reduce((s,i) => s+i.qty, 0);

  useEffect(() => { saveCart(cart); }, [cart]);
  useEffect(() => { setSavedAddr(getSaved()); }, [step]);
  useEffect(() => {
    const onLang = () => setLang(getLang());
    window.addEventListener("langChanged", onLang);
    return () => window.removeEventListener("langChanged", onLang);
  }, []);

  const changeQty = (id,d) => setCart(p => p.map(i => i._id===id ? {...i,qty:Math.max(1,i.qty+d)} : i));
  const removeItem = (id) => setCart(p => p.filter(i => i._id!==id));

  const getLocation = () => {
    setLocError(""); setLocLoading(true);
    if (!navigator.geolocation) { setLocError(t.gpsError); setLocLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat=pos.coords.latitude, lng=pos.coords.longitude;
        setLocation({lat,lng});
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=uz,ru`);
          const data = await res.json();
          if (data.display_name) setForm(f => ({...f, address: data.display_name}));
        } catch {}
        setLocLoading(false);
      },
      () => { setLocError(t.gpsError); setLocLoading(false); },
      { enableHighAccuracy:true, timeout:10000 }
    );
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    if (!isValid(form.phoneFormatted)) { alert(t.phoneNumber + " — 9 ta raqam!"); return; }
    setOrderLoading(true);
    try {
      const fullPhone = rawPhone(form.phoneFormatted);
      const res = await fetch(`${API}/api/orders`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ customerName:form.name, customerPhone:fullPhone, address:form.address, location,
          items:cart.map(i => ({foodId:i._id,title:i.title,price:i.price,quantity:i.qty})), totalPrice:total }),
      });
      if (res.ok) {
        const p = getProfile();
        if (!p.name) localStorage.setItem("profile", JSON.stringify({...p,name:form.name,phone:fullPhone}));
        localStorage.removeItem("cart");
        window.dispatchEvent(new Event("cartUpdated"));
        setCart([]); setStep("success");
      } else alert("Xatolik!");
    } catch { alert("Server xatosi!"); }
    finally { setOrderLoading(false); }
  };

  if (step === "success") return (
    <div className="cp-success">
      <div className="cp-success-icon">🎉</div>
      <h2 className="cp-success-title">{t.orderAccepted}</h2>
      <p className="cp-success-sub">{t.orderAcceptedSub}</p>
      <button className="cp-success-btn" onClick={() => navigate("/")}>{t.backToMenu}</button>
      <button className="cp-continue-btn" style={{marginTop:8,borderRadius:14,padding:"12px 24px"}} onClick={() => navigate("/orders")}>{t.trackOrder}</button>
    </div>
  );

  return (
    <div className="cp-root">
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => step==="form" ? setStep("cart") : navigate(-1)}>{t.back}</button>
        <span className="cp-header-title">{step==="cart" ? `${t.cartTitle} (${count})` : t.orderInfo}</span>
        <button className="cp-back-btn" onClick={() => navigate("/profile")}>👤</button>
      </div>

      {step==="cart" && (
        <div className="cp-body">
          {cart.length===0 ? (
            <div className="cp-empty">
              <div className="cp-empty-icon">🛒</div>
              <p className="cp-empty-title">{t.emptyCart}</p>
              <p className="cp-empty-sub">{t.emptyCartSub}</p>
              <button className="cp-empty-btn" onClick={() => navigate("/")}>{t.goToMenu}</button>
            </div>
          ) : (
            <>
              <div className="cp-items">
                {cart.map(item => (
                  <div key={item._id} className="cp-item">
                    <img src={item.image?.startsWith("http") ? item.image : `${API}${item.image}`}
                      alt={item.title} className="cp-item-img"
                      onError={e => e.target.src="https://placehold.co/80/e8f5ee/1d6b3e?text=+"} />
                    <div className="cp-item-info">
                      <p className="cp-item-title">{item.title}</p>
                      <p className="cp-item-price">{item.price.toLocaleString()} so'm</p>
                    </div>
                    <div className="cp-item-right">
                      <div className="cp-item-qty">
                        <button onClick={() => changeQty(item._id,-1)}>−</button>
                        <span>{item.qty}</span>
                        <button onClick={() => changeQty(item._id,+1)}>+</button>
                      </div>
                      <p className="cp-item-total">{(item.price*item.qty).toLocaleString()} so'm</p>
                      <button className="cp-item-remove" onClick={() => removeItem(item._id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cp-total-block">
                <div className="cp-total-row"><span>{t.products} ({count})</span><span>{total.toLocaleString()} so'm</span></div>
                <div className="cp-total-row big"><span>{t.totalPayment}:</span><strong>{total.toLocaleString()} so'm</strong></div>
              </div>
              <div className="cp-footer">
                <button className="cp-next-btn" onClick={() => setStep("form")}>{t.orderNow}</button>
                <button className="cp-continue-btn" onClick={() => navigate("/")}>{t.continueMenu}</button>
              </div>
            </>
          )}
        </div>
      )}

      {step==="form" && (
        <div className="cp-body">
          <form className="cp-form" onSubmit={handleOrder}>
            <div className="cp-order-summary">
              <p className="cp-summary-label">{t.orderSummary}</p>
              <div className="cp-summary-items">{cart.map(i => <span key={i._id} className="cp-summary-chip">{i.title} × {i.qty}</span>)}</div>
              <p className="cp-summary-total">{t.total}: <strong>{total.toLocaleString()} so'm</strong></p>
            </div>

            <div className="cp-form-section-title">{t.personalInfo}</div>
            <div className="cp-form-field">
              <label>{t.fullName}</label>
              <input type="text" placeholder={t.namePlaceholder} required value={form.name} onChange={e => setForm({...form,name:e.target.value})} />
            </div>
            <div className="cp-form-field">
              <label>{t.phoneNumber}</label>
              <div className="pf-phone-wrap">
                <span className="pf-phone-prefix">+998</span>
                <input type="tel" className="pf-phone-input" placeholder={t.phonePlaceholder}
                  value={form.phoneFormatted} onChange={e => setForm({...form,phoneFormatted:fmtPhone(e.target.value)})} maxLength={12} required />
              </div>
              <span className="cp-field-hint">{form.phoneFormatted.replace(/\s/g,"").length}/9 {t.phoneHint}{isValid(form.phoneFormatted)?" ✅":""}</span>
            </div>

            <div className="cp-form-section-title">{t.deliveryAddress}</div>

            {savedAddr.length>0 && (
              <div>
                <button type="button" className={`cp-gps-btn ${showPicker?"active":""}`} onClick={() => setShowPicker(!showPicker)}>
                  {t.savedAddresses} ({savedAddr.length})
                </button>
                {showPicker && (
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
                    {savedAddr.map(a => (
                      <button key={a.id} type="button" onClick={() => {setForm(f=>({...f,address:a.address}));setShowPicker(false);}}
                        style={{textAlign:"left",padding:"10px 14px",background:form.address===a.address?"#d1fae5":"white",
                          border:`2px solid ${form.address===a.address?"var(--g)":"#d4e8da"}`,borderRadius:12,cursor:"pointer"}}>
                        <div style={{fontWeight:700,fontSize:"0.88rem"}}>📍 {a.label}</div>
                        <div style={{fontSize:"0.8rem",color:"var(--gray)"}}>{a.address}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button type="button" className={`cp-gps-btn ${location?"active":""}`} onClick={getLocation} disabled={locLoading}>
              {locLoading ? t.gpsLoading : location ? t.gpsConnected : t.gpsDetect}
            </button>
            {location && <a href={`https://yandex.com/maps/?pt=${location.lng},${location.lat}&z=16&l=map`} target="_blank" rel="noreferrer" className="cp-map-link">{t.viewOnMap}</a>}
            {locError && <p className="cp-location-error">⚠️ {locError}</p>}

            <div className="cp-form-field">
              <label>{t.fullAddress}</label>
              <input type="text" required placeholder={t.addressPlaceholder} value={form.address} onChange={e => setForm({...form,address:e.target.value})} />
              <span className="cp-field-hint">{t.addressHint}</span>
            </div>

            <button type="submit" className="cp-submit-btn" disabled={orderLoading}>
              {orderLoading ? t.sending : t.confirmOrder}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}