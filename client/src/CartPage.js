import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, TRANSLATIONS } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (c) => { localStorage.setItem("cart", JSON.stringify(c)); window.dispatchEvent(new Event("cartUpdated")); };
const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "{}"); } catch { return {}; } };
const getSaved = () => { try { return JSON.parse(localStorage.getItem("savedAddresses") || "[]"); } catch { return []; } };
const getField = (f, l) => { if (!f) return ""; if (typeof f === "string") return f; return f[l || getLang()] || f.uz || ""; };
const fmtPhone = (v) => { const d=v.replace(/\D/g,"").replace(/^998/,"").slice(0,9); let r=""; if(d.length>0)r+=d.slice(0,2); if(d.length>2)r+=" "+d.slice(2,5); if(d.length>5)r+=" "+d.slice(5,7); if(d.length>7)r+=" "+d.slice(7,9); return r; };
const rawPhone = (f) => "+998"+f.replace(/\s/g,"");
const isValid = (f) => f.replace(/\s/g,"").length===9;


const FILIALS = [
  { id: "rustaveli", name: "Yalpiz — Shota Rustaveli, 115", address: "Shota Rustaveli ko'chasi, 115, Toshkent", lat: 41.261532, lng: 69.228442 },
  { id: "mvd",       name: "Yalpiz MVD — Mirobod, 1/1",    address: "Mirobod ko'chasi, 1/1, Toshkent",    lat: 41.3015, lng: 69.2850 },
];

const DELIVERY_BASE_PRICE = 10000;
const DELIVERY_PRICE_PER_KM = 3000;
const DELIVERY_MIN_PRICE = 12000;

const calcDistanceKm = (a, b) => {
  if (!a || !b) return 0;
  const toRad = (v) => (Number(v) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const calcDeliveryPrice = (km) => {
  if (!km) return 0;
  return Math.max(DELIVERY_MIN_PRICE, Math.round((DELIVERY_BASE_PRICE + km * DELIVERY_PRICE_PER_KM) / 1000) * 1000);
};

const paymentLabel = (type) => {
  if (type === "click") return "Click";
  if (type === "payme") return "Payme";
  return "Online";
};

export default function CartPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(getLang);
  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;
  const [cart, setCart] = useState(getCart);
  const [step, setStep] = useState("cart"); // cart → type → form → success
  const [orderType, setOrderType] = useState(null); // "dine_in" | "delivery"
  const [tableNumber, setTableNumber] = useState("");
  const [paymentType, setPaymentType] = useState("click"); // "click" | "payme"
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
  const [selectedFilial, setSelectedFilial] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const total = cart.reduce((s,i) => s+i.price*i.qty, 0);
  const count = cart.reduce((s,i) => s+i.qty, 0);
  const distanceKm = orderType === "delivery" && selectedFilial && location
    ? calcDistanceKm({ lat: selectedFilial.lat, lng: selectedFilial.lng }, location)
    : 0;
  const deliveryPrice = calcDeliveryPrice(distanceKm);

  useEffect(() => { saveCart(cart); }, [cart]);
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
    if (!isValid(form.phoneFormatted)) { alert("Telefon raqam to'liq emas! 9 ta raqam kiriting."); return; }
    if (!orderType) { alert("Buyurtma turini tanlang!"); return; }
    if (!selectedFilial) { alert("Filialni tanlang!"); return; }
    if (orderType==="dine_in" && !tableNumber.trim()) { alert("Stol raqamini kiriting!"); return; }
    if (orderType==="delivery" && !form.address.trim()) { alert("Manzilni kiriting!"); return; }
    const unavailableItem = cart.find(i => i.isAvailable === false);
    if (unavailableItem) { alert(`${getField(unavailableItem.title, lang)} hozircha mavjud emas. Iltimos, savatdan olib tashlang.`); return; }
    setOrderLoading(true);
    try {
      const fullPhone = rawPhone(form.phoneFormatted);
      const res = await fetch(`${API}/api/orders`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          customerName: form.name, customerPhone: fullPhone,
          address: orderType==="dine_in"
            ? `${selectedFilial ? selectedFilial.name+", " : ""}Stol №${tableNumber}`
            : form.address,
          location: orderType==="delivery" ? location : null,
          orderType, tableNumber: orderType==="dine_in" ? tableNumber : null,
          paymentType,
          filialId: selectedFilial?.id || null,
          filialName: selectedFilial?.name || null,
          items: cart.map(i => ({ foodId:i._id, title:getField(i.title, lang), price:i.price, quantity:i.qty })),
          totalPrice: total,
        }),
      });
      if (res.ok) {
        const data = await res.json();

        const p = getProfile();
        if (!p.name) {
          localStorage.setItem("profile", JSON.stringify({...p, name:form.name, phone:fullPhone}));
        }

        localStorage.removeItem("cart");
        window.dispatchEvent(new Event("cartUpdated"));
        setCart([]);

        if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
          return;
        }

        setStep("success");
      } else {
        const d = await res.json();
        alert(d.message || "Xatolik!");
      }
    } catch { alert("Server xatosi!"); }
    finally { setOrderLoading(false); }
  };

  // ── SUCCESS
  if (step==="success") return (
    <div className="cp-success">
      <div style={{fontSize:"4rem"}}>🎉</div>
      <h2 className="cp-success-title">{t.orderAccepted}</h2>
      <p className="cp-success-sub">
        {orderType==="dine_in" ? t.restaurantOrder?.replace("{n}", tableNumber) : t.deliveryOrderSuccess}
      </p>
      <div style={{background:"#f0fdf4",borderRadius:14,padding:"12px 24px",fontSize:"0.9rem",fontWeight:700,color:"#065f46",display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
        <span>{orderType==="dine_in" ? "🍽 Restoran" : "🛵 Yetkazish"}</span>
        <span>•</span>
        <span>💳 {paymentLabel(paymentType)}</span>
      </div>
      <button className="cp-success-btn" onClick={() => navigate("/")}>{t.backToMenu}</button>
      <button className="cp-continue-btn" style={{borderRadius:14,padding:"12px 24px"}} onClick={() => navigate("/orders")}>{t.trackOrder}</button>
    </div>
  );

  return (
    <div className="cp-root">
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => {
          if (step==="type") setStep("cart");
          else if (step==="form") setStep("type");
          else navigate(-1);
        }}>{t.back}</button>
        <span className="cp-header-title">
          {step==="cart" ? `${t.cartTitle} (${count} ${t.pieces})` : step==="type" ? t.orderTypeTitle : t.orderInfo}
        </span>
        <div style={{width:80}} />
      </div>

      {/* ── SAVAT */}
      {step==="cart" && (
        <div className="cp-body">
          {cart.length===0 ? (
            <div className="cp-empty">
              <div style={{fontSize:"4rem",opacity:0.3}}>🛒</div>
              <p className="cp-empty-title">{t.emptyCart}</p>
              <p className="cp-empty-sub">{t.emptyCartSub}</p>
              <button className="cp-empty-btn" onClick={() => navigate("/")}>{t.goToMenu}</button>
            </div>
          ) : (
            <>
              <div className="cp-items">
                {cart.map(item => (
                  <div key={item._id} className="cp-item">
                    <img src={item.image || "https://placehold.co/80/e8f5ee/1d6b3e?text=+"} alt={getField(item.title, lang)} className="cp-item-img"
                      onError={e => e.target.src="https://placehold.co/80/e8f5ee/1d6b3e?text=+"} />
                    <div className="cp-item-info">
                      <p className="cp-item-title">{getField(item.title, lang)}</p>
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
                <div className="cp-total-row"><span>{t.products} ({count} {t.pieces})</span><span>{total.toLocaleString()} so'm</span></div>
                <div className="cp-total-row big"><span>{t.totalPayment}:</span><strong>{total.toLocaleString()} so'm</strong></div>
              </div>
              <div className="cp-footer">
                <button className="cp-next-btn" onClick={() => setStep("type")}>{t.orderNow}</button>
                <button className="cp-continue-btn" onClick={() => navigate("/")}>{t.continueMenu}</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── BUYURTMA TURI */}
      {step==="type" && (
        <div className="cp-body">
          <div className="cp-order-summary">
            <p className="cp-summary-label">{t.orderSummary}</p>
            <div className="cp-summary-items">{cart.map(i => <span key={i._id} className="cp-summary-chip">{getField(i.title, lang)} × {i.qty}</span>)}</div>
            <p className="cp-summary-total">{t.total}: <strong>{total.toLocaleString()} so'm</strong></p>
          </div>

          <p className="cp-section-q">{t.orderTypeTitle}</p>

          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Restoran */}
            <div className={`order-type-card ${orderType==="dine_in"?"selected":""}`} onClick={() => setOrderType("dine_in")}>
              <div className="order-type-icon">🍽</div>
              <div className="order-type-info">
                <div className="order-type-title">{t.dineIn}</div>
                <div className="order-type-desc">{t.dineInDesc}</div>
              </div>
              <div className={`order-type-check ${orderType==="dine_in"?"active":""}`}>✓</div>
            </div>
            {orderType==="dine_in" && (
              <div style={{display:"flex",flexDirection:"column",gap:10,padding:"14px 16px",background:"#f0fdf4",borderRadius:14,border:"2px solid var(--g3)"}}>
                <label style={{fontSize:"0.82rem",fontWeight:700,color:"var(--g4)"}}>🏠 Filial tanlang</label>
                {FILIALS.map(f => (
                  <div key={f.id} className={`order-type-card ${selectedFilial?.id===f.id?"selected":""}`}
                    style={{padding:"10px 14px"}} onClick={() => setSelectedFilial(f)}>
                    <span style={{fontSize:"1.2rem"}}>📍</span>
                    <div style={{flex:1,fontSize:"0.85rem",fontWeight:700,color:"var(--g4)"}}>{f.name}</div>
                    <div className={`order-type-check ${selectedFilial?.id===f.id?"active":""}`}>✓</div>
                  </div>
                ))}
                <div className="cp-form-field" style={{marginTop:4}}>
                  <label>{t.tableNumber}</label>
                  <input type="number" placeholder={t.tableNumberPlaceholder} min="1"
                    value={tableNumber} onChange={e => setTableNumber(e.target.value)} style={{marginTop:6}} />
                </div>
              </div>
            )}

            {/* Yetkazib berish */}
            <div className={`order-type-card ${orderType==="delivery"?"selected":""}`} onClick={() => setOrderType("delivery")}>
              <div className="order-type-icon">🛵</div>
              <div className="order-type-info">
                <div className="order-type-title">{t.deliveryOrder}</div>
                <div className="order-type-desc">{t.deliveryDesc}</div>
              </div>
              <div className={`order-type-check ${orderType==="delivery"?"active":""}`}>✓</div>
            </div>
            {orderType==="delivery" && (
              <div style={{display:"flex",flexDirection:"column",gap:8,padding:"14px 16px",background:"#fff9e6",borderRadius:14,border:"2px solid #fde68a"}}>
                <label style={{fontSize:"0.82rem",fontWeight:700,color:"#92400e"}}>🏠 Qaysi filialdan yetkazish kerak?</label>
                {FILIALS.map(f => (
                  <div key={f.id} className={`order-type-card ${selectedFilial?.id===f.id?"selected":""}`}
                    style={{padding:"10px 14px",background:"white"}} onClick={() => setSelectedFilial(f)}>
                    <span style={{fontSize:"1.2rem"}}>📍</span>
                    <div style={{flex:1,fontSize:"0.85rem",fontWeight:700,color:"var(--g4)"}}>{f.name}</div>
                    <div className={`order-type-check ${selectedFilial?.id===f.id?"active":""}`}>✓</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* To'lov */}
          {orderType && (
            <>
              <p className="cp-section-q" style={{marginTop:20}}>{t.paymentTitle}</p>
              <div className="payment-options">
                <div className={`payment-card payment-card-click ${paymentType==="click"?"selected":""}`} onClick={() => setPaymentType("click")}>
                  <span className="payment-logo click-logo">CLICK</span>
                  <span className="payment-label">Click</span>
                  <span className="payment-desc">Online to‘lov</span>
                </div>

                <div className={`payment-card payment-card-payme ${paymentType==="payme"?"selected":""}`} onClick={() => setPaymentType("payme")}>
                  <span className="payment-logo payme-logo">payme</span>
                  <span className="payment-label">Payme</span>
                  <span className="payment-desc">Online to‘lov</span>
                </div>
              </div>
              <div className="cp-footer" style={{marginTop:16}}>
                <button className="cp-next-btn" onClick={() => setStep("form")}>{t.continueBtn}</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FORMA */}
      {step==="form" && (
        <div className="cp-body">
          <form className="cp-form" onSubmit={handleOrder}>
            <div className="cp-order-summary">
              <p className="cp-summary-label">{t.orderSummary}</p>
              <div className="cp-summary-items">{cart.map(i => <span key={i._id} className="cp-summary-chip">{getField(i.title, lang)} × {i.qty}</span>)}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,flexWrap:"wrap",gap:8}}>
                <p className="cp-summary-total">{t.total}: <strong>{total.toLocaleString()} so'm</strong></p>
                <div style={{display:"flex",gap:6}}>
                  <span className="order-badge blue">{orderType==="dine_in" ? `🍽 ${t.dineIn}` : `🛵 ${t.deliveryOrder}`}</span>
                  <span className="order-badge green">💳 {paymentLabel(paymentType)}</span>
                </div>
              </div>
            </div>

            {orderType === "delivery" && (
              <div className="delivery-price-box compact">
                <div className="delivery-price-row"><span>Taomlar narxi:</span><strong>{total.toLocaleString()} so'm</strong></div>
                <div className="delivery-price-row"><span>Taxi narxi:</span><strong>{deliveryPrice ? `${deliveryPrice.toLocaleString()} so'm` : "Lokatsiya tanlang"}</strong></div>
                <div className="delivery-price-note">Taxi narxi online to‘lovga qo‘shilmaydi.</div>
              </div>
            )}

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

            {orderType==="dine_in" && (
              <div style={{background:"#f0fdf4",borderRadius:14,padding:"14px 16px",border:"2px solid var(--g3)"}}>
                <p style={{fontSize:"0.9rem",fontWeight:700,color:"#065f46"}}>🍽 Restoran — Stol №{tableNumber}</p>
              </div>
            )}

            {orderType==="delivery" && (
              <>
                <div className="cp-form-section-title">{t.deliveryAddress}</div>
                {savedAddr.length>0 && (
                  <div>
                    <button type="button" className={`cp-gps-btn ${showPicker?"active":""}`} onClick={() => setShowPicker(!showPicker)}>
                      {t.savedAddresses} ({savedAddr.length})
                    </button>
                    {showPicker && (
                      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
                        {savedAddr.map(a => (
                          <button key={a.id} type="button"
                            onClick={() => {setForm(f=>({...f,address:a.address}));setShowPicker(false);}}
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
                {location && selectedFilial && (
                  <div className="delivery-price-box">
                    <div className="delivery-price-title">🚕 Yetkazish narxi mijoz tomonidan alohida to‘lanadi</div>
                    <div className="delivery-price-row"><span>Filial:</span><strong>{selectedFilial.name}</strong></div>
                    <div className="delivery-price-row"><span>Masofa:</span><strong>{distanceKm.toFixed(1)} km</strong></div>
                    <div className="delivery-price-row"><span>Taxminiy taxi:</span><strong>{deliveryPrice.toLocaleString()} so'm</strong></div>
                    <div className="delivery-price-note">Online to‘lovga faqat taomlar narxi yuboriladi. Taxi pulini mijoz haydovchiga alohida to‘laydi.</div>
                  </div>
                )}
                {locError && <p className="cp-location-error">⚠️ {locError}</p>}
                <div className="cp-form-field">
                  <label>{t.fullAddress}</label>
                  <input type="text" required placeholder={t.addressPlaceholder} value={form.address} onChange={e => setForm({...form,address:e.target.value})} />
                  <span className="cp-field-hint">{t.addressHint}</span>
                </div>
              </>
            )}

            <button type="submit" className="cp-submit-btn" disabled={orderLoading}>
              {orderLoading ? t.sending : t.confirmOrder}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}