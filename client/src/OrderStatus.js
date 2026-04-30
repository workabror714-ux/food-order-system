import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, TRANSLATIONS } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const fmtPhone = (v) => { const d=v.replace(/\D/g,"").replace(/^998/,"").slice(0,9); let r=""; if(d.length>0)r+=d.slice(0,2); if(d.length>2)r+=" "+d.slice(2,5); if(d.length>5)r+=" "+d.slice(5,7); if(d.length>7)r+=" "+d.slice(7,9); return r; };
const rawPhone = (f) => "+998"+f.replace(/\s/g,"");
const isValid = (f) => f.replace(/\s/g,"").length===9;
const STATUS_COLOR = { new:"#3b82f6", preparing:"#f59e0b", delivered:"#10b981", cancelled:"#ef4444" };

export default function OrderStatus() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(getLang);
  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;
  const [phoneFormatted, setPhoneFormatted] = useState(() => {
    try { const p=JSON.parse(localStorage.getItem("profile")||"null"); return p?.phone ? fmtPhone(p.phone.replace("+998","")) : ""; } catch { return ""; }
  });
  const [inputPhone, setInputPhone] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const onLang = () => setLang(getLang());
    window.addEventListener("langChanged", onLang);
    if (phoneFormatted && isValid(phoneFormatted)) { fetchOrders(phoneFormatted); }
    return () => { window.removeEventListener("langChanged", onLang); clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (phoneFormatted && isValid(phoneFormatted) && searched) {
      intervalRef.current = setInterval(() => fetchOrders(phoneFormatted), 15000);
    }
    return () => clearInterval(intervalRef.current);
  }, [phoneFormatted, searched]);

  const fetchOrders = async (ph) => {
    const target = ph || phoneFormatted;
    if (!target || !isValid(target)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/orders/my/${encodeURIComponent(rawPhone(target))}`);
      if (res.ok) { setOrders(await res.json()); setLastUpdated(new Date()); setSearched(true); }
    } catch {}
    finally { setLoading(false); }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!isValid(inputPhone)) return;
    setPhoneFormatted(inputPhone);
    fetchOrders(inputPhone);
  };

  const activeOrders = orders.filter(o => o.status!=="delivered" && o.status!=="cancelled");
  const historyOrders = orders.filter(o => o.status==="delivered" || o.status==="cancelled");

  return (
    <div className="cp-root">
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => navigate("/")}>{t.back}</button>
        <span className="cp-header-title">{t.orderStatus}</span>
        <div style={{width:80}} />
      </div>

      <div className="cp-body" style={{maxWidth:600}}>
        {!phoneFormatted || !isValid(phoneFormatted) ? (
          <div className="os-search-card">
            <div className="os-search-icon">📦</div>
            <h2 className="os-search-title">{t.trackTitle}</h2>
            <p className="os-search-desc">{t.trackDesc}</p>
            <form onSubmit={handleSearch} style={{width:"100%"}}>
              <div className="cp-form-field">
                <div className="pf-phone-wrap">
                  <span className="pf-phone-prefix">+998</span>
                  <input type="tel" className="pf-phone-input" placeholder={t.phonePlaceholder}
                    value={inputPhone} onChange={e => setInputPhone(fmtPhone(e.target.value))} maxLength={12} autoFocus />
                </div>
                <span className="cp-field-hint">{inputPhone.replace(/\s/g,"").length}/9{isValid(inputPhone)?" ✅":""}</span>
              </div>
              <button type="submit" className="cp-next-btn" style={{marginTop:12}} disabled={!isValid(inputPhone)||loading}>
                {loading ? t.searching : t.searchOrders}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"white",borderRadius:14,padding:"12px 16px",boxShadow:"var(--shadow)"}}>
              <div>
                <div style={{fontSize:"0.78rem",color:"var(--gray)",fontWeight:600}}>{t.phoneNumber}</div>
                <div style={{fontSize:"0.95rem",fontWeight:800,color:"var(--g4)"}}>+998 {phoneFormatted}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {lastUpdated && <span style={{fontSize:"0.72rem",color:"var(--gray)"}}>{lastUpdated.toLocaleTimeString()}</span>}
                <button className="cp-back-btn" onClick={() => fetchOrders(phoneFormatted)} disabled={loading}>{loading?"⏳":"🔄"}</button>
                <button className="cp-back-btn" onClick={() => {setPhoneFormatted("");setOrders([]);setSearched(false);}}>✕</button>
              </div>
            </div>

            {loading && orders.length===0 ? (
              <div style={{textAlign:"center",padding:60}}><div className="spinner" style={{margin:"0 auto 16px"}} /><p style={{color:"var(--gray)"}}>{t.searching}</p></div>
            ) : searched && orders.length===0 ? (
              <div style={{textAlign:"center",padding:"60px 20px"}}>
                <div style={{fontSize:"3.5rem",opacity:0.3,marginBottom:12}}>📭</div>
                <p style={{fontWeight:800,color:"var(--g4)",marginBottom:8}}>{t.noOrderFound}</p>
                <p style={{color:"var(--gray)",fontSize:"0.9rem"}}>{t.noOrderFoundSub}</p>
                <button className="cp-next-btn" style={{marginTop:16}} onClick={() => navigate("/")}>{t.goToMenu}</button>
              </div>
            ) : (
              <>
                {activeOrders.length>0 && (
                  <div>
                    <div style={{fontSize:"0.82rem",fontWeight:700,color:"var(--gray)",textTransform:"uppercase",marginBottom:10,marginTop:4}}>
                      {t.activeOrders} ({activeOrders.length})
                    </div>
                    {activeOrders.map(o => <OrderCard key={o._id} order={o} t={t} />)}
                  </div>
                )}
                {historyOrders.length>0 && (
                  <div>
                    <div style={{fontSize:"0.82rem",fontWeight:700,color:"var(--gray)",textTransform:"uppercase",marginBottom:10,marginTop:4}}>
                      {t.historyOrders} ({historyOrders.length})
                    </div>
                    {historyOrders.map(o => <OrderCard key={o._id} order={o} t={t} compact />)}
                  </div>
                )}
              </>
            )}
          </>
        )}
        <button className="cp-continue-btn" onClick={() => navigate("/")}>{t.newOrder}</button>
      </div>
    </div>
  );
}

function OrderCard({ order, t, compact }) {
  const statusMap = {
    new: { label: t.statusNew, emoji:"🕐", color: STATUS_COLOR.new, bg:"#eff6ff", step:1 },
    preparing: { label: t.statusPreparing, emoji:"👨‍🍳", color: STATUS_COLOR.preparing, bg:"#fffbeb", step:2 },
    delivered: { label: t.statusDelivered, emoji:"🎉", color: STATUS_COLOR.delivered, bg:"#ecfdf5", step:3 },
    cancelled: { label: t.statusCancelled, emoji:"❌", color: STATUS_COLOR.cancelled, bg:"#fef2f2", step:0 },
  };
  const STATUS_COLOR = { new:"#3b82f6", preparing:"#f59e0b", delivered:"#10b981", cancelled:"#ef4444" };
  const s = statusMap[order.status] || statusMap.new;
  const steps = [{ key:"new",emoji:"✅",label:t.step1 },{ key:"preparing",emoji:"👨‍🍳",label:t.step2 },{ key:"delivered",emoji:"🚀",label:t.step3 }];

  return (
    <div style={{background:"white",borderRadius:18,padding:18,boxShadow:"var(--shadow)",marginBottom:12,border:`2px solid ${s.color}22`}}>
      <div style={{display:"flex",alignItems:"center",gap:12,background:s.bg,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
        <span style={{fontSize:"1.8rem"}}>{s.emoji}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:"1rem",color:s.color}}>{s.label}</div>
          <div style={{fontSize:"0.78rem",color:"var(--gray)",marginTop:2}}>{new Date(order.createdAt).toLocaleString()}</div>
        </div>
      </div>

      {!compact && order.status!=="cancelled" && (
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          {steps.map((step,idx) => {
            const done = s.step > idx+1;
            const active = s.step === idx+1;
            return (
              <div key={step.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{display:"flex",width:"100%",alignItems:"center"}}>
                  {idx>0 && <div style={{flex:1,height:3,borderRadius:2,background:done||active?"var(--g)":"#e2e8e2",transition:"background 0.4s"}} />}
                  <div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",
                    background:done?"var(--g)":active?"var(--g2)":"#f2f7f2",border:`3px solid ${done||active?"var(--g)":"#d4e8da"}`,
                    transition:"all 0.4s",boxShadow:active?"0 0 0 4px rgba(29,107,62,0.15)":"none"}}>
                    {done?"✓":step.emoji}
                  </div>
                  {idx<steps.length-1 && <div style={{flex:1,height:3,borderRadius:2,background:done?"var(--g)":"#e2e8e2",transition:"background 0.4s"}} />}
                </div>
                <div style={{fontSize:"0.7rem",fontWeight:active?800:600,color:active?"var(--g)":done?"var(--g4)":"var(--gray)",marginTop:6,textAlign:"center"}}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
        {order.items.map((item,i) => <span key={i} className="cp-summary-chip">{item.title} × {item.quantity}</span>)}
      </div>
      {order.address && <div style={{fontSize:"0.82rem",color:"var(--gray)",marginBottom:8}}>📍 {order.address}</div>}
      <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid var(--g3)",paddingTop:10,marginTop:4}}>
        <span style={{fontSize:"0.85rem",color:"var(--gray)"}}>{t.total}</span>
        <strong style={{color:"var(--g)",fontSize:"0.95rem"}}>{order.totalPrice?.toLocaleString()} so'm</strong>
      </div>
    </div>
  );
}