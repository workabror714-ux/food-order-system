import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const saveCart = (cart) => { localStorage.setItem("cart", JSON.stringify(cart)); window.dispatchEvent(new Event("cartUpdated")); };
const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "{}"); } catch { return {}; } };
const getSaved = () => { try { return JSON.parse(localStorage.getItem("savedAddresses") || "[]"); } catch { return []; } };
const getField = (field) => { if (!field) return ""; if (typeof field === "string") return field; return field.uz || ""; };

const fmtPhone = (v) => {
  const d = v.replace(/\D/g,"").replace(/^998/,"").slice(0,9);
  let r=""; if(d.length>0)r+=d.slice(0,2); if(d.length>2)r+=" "+d.slice(2,5);
  if(d.length>5)r+=" "+d.slice(5,7); if(d.length>7)r+=" "+d.slice(7,9); return r;
};
const rawPhone = (f) => "+998"+f.replace(/\s/g,"");
const isValid = (f) => f.replace(/\s/g,"").length===9;

export default function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(getCart);
  const [step, setStep] = useState("cart");

  // ORDER TYPE: "dine_in" (restoran) | "delivery" (yetkazib berish)
  const [orderType, setOrderType] = useState(null);
  const [tableNumber, setTableNumber] = useState("");

  // TO'LOV: "cash" (naqd) | "card" (karta/payme)
  const [paymentType, setPaymentType] = useState("cash");

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

  const changeQty = (id, d) => setCart(p => p.map(i => i._id===id ? {...i,qty:Math.max(1,i.qty+d)} : i));
  const removeItem = (id) => setCart(p => p.filter(i => i._id!==id));

  const getLocation = () => {
    setLocError(""); setLocLoading(true);
    if (!navigator.geolocation) { setLocError("GPS qo'llab-quvvatlanmaydi"); setLocLoading(false); return; }
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
      () => { setLocError("GPS ruxsat berilmadi. Manzilni qo'lda kiriting."); setLocLoading(false); },
      { enableHighAccuracy:true, timeout:10000 }
    );
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    if (!isValid(form.phoneFormatted)) { alert("Telefon raqam to'liq emas! 9 ta raqam kiriting."); return; }
    if (orderType === "dine_in" && !tableNumber.trim()) { alert("Stol raqamini kiriting!"); return; }
    if (orderType === "delivery" && !form.address.trim()) { alert("Manzilni kiriting!"); return; }

    setOrderLoading(true);
    try {
      const fullPhone = rawPhone(form.phoneFormatted);
      const res = await fetch(`${API}/api/orders`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          customerName: form.name,
          customerPhone: fullPhone,
          address: orderType === "dine_in" ? `Restoran — Stol №${tableNumber}` : form.address,
          location: orderType === "delivery" ? location : null,
          orderType,
          tableNumber: orderType === "dine_in" ? tableNumber : null,
          paymentType,
          items: cart.map(i => ({
            foodId: i._id,
            title: getField(i.title),
            price: i.price,
            quantity: i.qty
          })),
          totalPrice: total,
        }),
      });
      if (res.ok) {
        const p = getProfile();
        if (!p.name) localStorage.setItem("profile", JSON.stringify({...p, name:form.name, phone:fullPhone}));
        localStorage.removeItem("cart");
        window.dispatchEvent(new Event("cartUpdated"));
        setCart([]); setStep("success");
      } else {
        const data = await res.json();
        alert(data.message || "Xatolik!");
      }
    } catch { alert("Server bilan bog'lanishda xatolik."); }
    finally { setOrderLoading(false); }
  };

  // ── SUCCESS ────────────────────────────────────────────────
  if (step === "success") return (
    <div className="cp-success">
      <div style={{ fontSize:"4rem" }}>🎉</div>
      <h2 className="cp-success-title">Buyurtma qabul qilindi!</h2>
      <p className="cp-success-sub">
        {orderType === "dine_in"
          ? `Stol №${tableNumber} — Taomlaringiz tayyorlanmoqda`
          : "Tez orada siz bilan bog'lanamiz"}
      </p>
      <div style={{ background:"#f0fdf4",borderRadius:14,padding:"12px 20px",fontSize:"0.9rem",fontWeight:700,color:"#065f46" }}>
        {paymentType === "cash" ? "💵 Naqd to'lov" : "💳 Karta orqali to'lov"}
      </div>
      <button className="cp-success-btn" onClick={() => navigate("/")}>Menyuga qaytish</button>
      <button className="cp-continue-btn" style={{borderRadius:14,padding:"12px 24px"}} onClick={() => navigate("/orders")}>
        📋 Buyurtmamni kuzatish
      </button>
    </div>
  );

  return (
    <div className="cp-root">
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => {
          if (step === "type") setStep("cart");
          else if (step === "form") setStep("type");
          else navigate(-1);
        }}>← Orqaga</button>
        <span className="cp-header-title">
          {step === "cart" ? `Savat (${count} ta)` : step === "type" ? "Buyurtma turi" : "Ma'lumotlar"}
        </span>
        <div style={{width:80}} />
      </div>

      {/* ── SAVAT ── */}
      {step === "cart" && (
        <div className="cp-body">
          {cart.length === 0 ? (
            <div className="cp-empty">
              <div style={{fontSize:"4rem",opacity:0.3}}>🛒</div>
              <p className="cp-empty-title">Savat bo'sh</p>
              <p className="cp-empty-sub">Taomlardan birini tanlang</p>
              <button className="cp-empty-btn" onClick={() => navigate("/")}>Menyuga o'tish</button>
            </div>
          ) : (
            <>
              <div className="cp-items">
                {cart.map(item => (
                  <div key={item._id} className="cp-item">
                    <img src={item.image || "https://placehold.co/80/e8f5ee/1d6b3e?text=+"}
                      alt={getField(item.title)} className="cp-item-img"
                      onError={e => e.target.src="https://placehold.co/80/e8f5ee/1d6b3e?text=+"} />
                    <div className="cp-item-info">
                      <p className="cp-item-title">{getField(item.title)}</p>
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
                <div className="cp-total-row"><span>Mahsulotlar ({count} ta)</span><span>{total.toLocaleString()} so'm</span></div>
                <div className="cp-total-row big"><span>Jami:</span><strong>{total.toLocaleString()} so'm</strong></div>
              </div>
              <div className="cp-footer">
                <button className="cp-next-btn" onClick={() => setStep("type")}>Buyurtma berish →</button>
                <button className="cp-continue-btn" onClick={() => navigate("/")}>← Menyuni davom ettirish</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── BUYURTMA TURI TANLASH ── */}
      {step === "type" && (
        <div className="cp-body">
          <div className="cp-order-summary">
            <p className="cp-summary-label">📋 Buyurtma</p>
            <div className="cp-summary-items">
              {cart.map(i => <span key={i._id} className="cp-summary-chip">{getField(i.title)} × {i.qty}</span>)}
            </div>
            <p className="cp-summary-total">Jami: <strong>{total.toLocaleString()} so'm</strong></p>
          </div>

          <p style={{fontWeight:800,fontSize:"1rem",color:"var(--g4)",textAlign:"center",marginTop:8}}>
            Qayerda zakaz qilmoqchisiz?
          </p>

          {/* Buyurtma turi */}
          <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:4}}>
            {/* RESTORAN */}
            <div
              className={`order-type-card ${orderType==="dine_in"?"selected":""}`}
              onClick={() => setOrderType("dine_in")}
            >
              <div className="order-type-icon">🍽</div>
              <div className="order-type-info">
                <div className="order-type-title">Restoranda ovqatlanish</div>
                <div className="order-type-desc">Stol bandlash, ichkarida xizmat</div>
              </div>
              <div className={`order-type-check ${orderType==="dine_in"?"active":""}`}>✓</div>
            </div>

            {/* Stol raqami */}
            {orderType === "dine_in" && (
              <div className="cp-form-field" style={{marginTop:-4,padding:"14px 16px",background:"#f0fdf4",borderRadius:14,border:"2px solid var(--g3)"}}>
                <label>Stol raqami *</label>
                <input type="number" placeholder="Masalan: 5" min="1"
                  value={tableNumber} onChange={e => setTableNumber(e.target.value)}
                  style={{marginTop:6}} />
              </div>
            )}

            {/* YETKAZIB BERISH */}
            <div
              className={`order-type-card ${orderType==="delivery"?"selected":""}`}
              onClick={() => setOrderType("delivery")}
            >
              <div className="order-type-icon">🛵</div>
              <div className="order-type-info">
                <div className="order-type-title">Yetkazib berish</div>
                <div className="order-type-desc">Eshigingizgacha ~30 daqiqada</div>
              </div>
              <div className={`order-type-check ${orderType==="delivery"?"active":""}`}>✓</div>
            </div>
          </div>

          {/* TO'LOV TURI */}
          {orderType && (
            <>
              <p style={{fontWeight:800,fontSize:"0.95rem",color:"var(--g4)",marginTop:16,marginBottom:10}}>
                To'lov usuli
              </p>
              <div style={{display:"flex",gap:10}}>
                <div
                  className={`payment-card ${paymentType==="cash"?"selected":""}`}
                  onClick={() => setPaymentType("cash")}
                >
                  <span style={{fontSize:"1.8rem"}}>💵</span>
                  <span className="payment-label">Naqd pul</span>
                </div>
                <div
                  className={`payment-card ${paymentType==="card"?"selected":""}`}
                  onClick={() => setPaymentType("card")}
                >
                  <span style={{fontSize:"1.8rem"}}>💳</span>
                  <span className="payment-label">Karta / Payme</span>
                </div>
              </div>
            </>
          )}

          {orderType && (
            <div className="cp-footer" style={{marginTop:16}}>
              <button className="cp-next-btn" onClick={() => setStep("form")}>
                Davom etish →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── FORMA ── */}
      {step === "form" && (
        <div className="cp-body">
          <form className="cp-form" onSubmit={handleOrder}>
            {/* Xulosa */}
            <div className="cp-order-summary">
              <p className="cp-summary-label">📋 Buyurtma xulosa</p>
              <div className="cp-summary-items">
                {cart.map(i => <span key={i._id} className="cp-summary-chip">{getField(i.title)} × {i.qty}</span>)}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                <p className="cp-summary-total">Jami: <strong>{total.toLocaleString()} so'm</strong></p>
                <div style={{display:"flex",gap:6}}>
                  <span style={{background:"#e0f2fe",color:"#0369a1",padding:"3px 10px",borderRadius:12,fontSize:"0.78rem",fontWeight:700}}>
                    {orderType==="dine_in" ? "🍽 Restoran" : "🛵 Yetkazish"}
                  </span>
                  <span style={{background:"#f0fdf4",color:"#065f46",padding:"3px 10px",borderRadius:12,fontSize:"0.78rem",fontWeight:700}}>
                    {paymentType==="cash" ? "💵 Naqd" : "💳 Karta"}
                  </span>
                </div>
              </div>
            </div>

            <div className="cp-form-section-title">👤 Shaxsiy ma'lumotlar</div>

            <div className="cp-form-field">
              <label>Ismingiz *</label>
              <input type="text" placeholder="Isim Familiya" required
                value={form.name} onChange={e => setForm({...form,name:e.target.value})} />
            </div>

            <div className="cp-form-field">
              <label>Telefon raqam *</label>
              <div className="pf-phone-wrap">
                <span className="pf-phone-prefix">+998</span>
                <input type="tel" className="pf-phone-input" placeholder="90 123 45 67"
                  value={form.phoneFormatted}
                  onChange={e => setForm({...form,phoneFormatted:fmtPhone(e.target.value)})}
                  maxLength={12} required />
              </div>
              <span className="cp-field-hint">
                {form.phoneFormatted.replace(/\s/g,"").length}/9 raqam{isValid(form.phoneFormatted)?" ✅":""}
              </span>
            </div>

            {/* RESTORAN — stol raqami ko'rsatiladi */}
            {orderType === "dine_in" && (
              <div style={{background:"#f0fdf4",borderRadius:14,padding:"12px 16px",border:"2px solid var(--g3)"}}>
                <p style={{fontSize:"0.88rem",fontWeight:700,color:"#065f46"}}>
                  🍽 Restoran — Stol №{tableNumber}
                </p>
              </div>
            )}

            {/* DELIVERY — manzil */}
            {orderType === "delivery" && (
              <>
                <div className="cp-form-section-title">📍 Yetkazib berish manzili</div>

                {savedAddr.length > 0 && (
                  <div>
                    <button type="button" className={`cp-gps-btn ${showPicker?"active":""}`}
                      onClick={() => setShowPicker(!showPicker)}>
                      📋 Saqlangan manzillar ({savedAddr.length} ta)
                    </button>
                    {showPicker && (
                      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
                        {savedAddr.map(a => (
                          <button key={a.id} type="button"
                            onClick={() => {setForm(f=>({...f,address:a.address}));setShowPicker(false);}}
                            style={{textAlign:"left",padding:"10px 14px",
                              background:form.address===a.address?"#d1fae5":"white",
                              border:`2px solid ${form.address===a.address?"var(--g)":"#d4e8da"}`,
                              borderRadius:12,cursor:"pointer"}}>
                            <div style={{fontWeight:700,fontSize:"0.88rem"}}>📍 {a.label}</div>
                            <div style={{fontSize:"0.8rem",color:"var(--gray)"}}>{a.address}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button type="button" className={`cp-gps-btn ${location?"active":""}`}
                  onClick={getLocation} disabled={locLoading}>
                  {locLoading ? "⏳ GPS aniqlanmoqda..." : location ? "✅ GPS ulandi" : "📍 GPS orqali manzilni aniqlash"}
                </button>
                {location && (
                  <a href={`https://yandex.com/maps/?pt=${location.lng},${location.lat}&z=16&l=map`}
                    target="_blank" rel="noreferrer" className="cp-map-link">🗺 Yandex xaritada ko'rish →</a>
                )}
                {locError && <p className="cp-location-error">⚠️ {locError}</p>}

                <div className="cp-form-field">
                  <label>To'liq manzil *</label>
                  <input type="text" required placeholder="Ko'cha, uy raqami, kvartira..."
                    value={form.address} onChange={e => setForm({...form,address:e.target.value})} />
                  <span className="cp-field-hint">GPS bosganingizda avtomatik to'ldiriladi</span>
                </div>
              </>
            )}

            <button type="submit" className="cp-submit-btn" disabled={orderLoading}>
              {orderLoading ? "⏳ Yuborilmoqda..." : "✅ Buyurtmani tasdiqlash"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}