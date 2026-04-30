import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, setLangStore, TRANSLATIONS } from "./i18n";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const STATUS_COLOR = { new:"#3b82f6", preparing:"#f59e0b", delivered:"#10b981", cancelled:"#ef4444" };
const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile")||"{}"); } catch { return {}; } };
const saveProfile = (p) => { localStorage.setItem("profile",JSON.stringify(p)); window.dispatchEvent(new Event("profileUpdated")); };
const getAddresses = () => { try { return JSON.parse(localStorage.getItem("savedAddresses")||"[]"); } catch { return []; } };
const saveAddresses = (a) => localStorage.setItem("savedAddresses",JSON.stringify(a));
const fmtPhone = (v) => { const d=v.replace(/\D/g,"").replace(/^998/,"").slice(0,9); let r=""; if(d.length>0)r+=d.slice(0,2); if(d.length>2)r+=" "+d.slice(2,5); if(d.length>5)r+=" "+d.slice(5,7); if(d.length>7)r+=" "+d.slice(7,9); return r; };
const rawPhone = (f) => "+998"+f.replace(/\s/g,"");
const isValid = (f) => f.replace(/\s/g,"").length===9;

export default function ProfilePage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(getLang);
  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;
  const [tab, setTab] = useState("profile");
  const [profile, setProfileState] = useState(getProfile);
  const [editing, setEditing] = useState(!getProfile().name);
  const [form, setForm] = useState(() => {
    const p = getProfile();
    const ph = p.phone ? p.phone.replace("+998","").replace(/\D/g,"") : "";
    return { ...p, phoneFormatted: fmtPhone(ph) };
  });
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [addresses, setAddresses] = useState(getAddresses);
  const [newAddr, setNewAddr] = useState({ label:"", address:"" });
  const [addingAddr, setAddingAddr] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    const onLang = () => setLang(getLang());
    window.addEventListener("langChanged", onLang);
    return () => window.removeEventListener("langChanged", onLang);
  }, []);

  useEffect(() => { if (tab==="orders" && profile.phone) fetchOrders(); }, [tab]);

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`${API}/api/orders/my/${encodeURIComponent(profile.phone)}`);
      if (res.ok) setOrders(await res.json());
    } catch {}
    finally { setOrdersLoading(false); }
  };

  const changeLang = (l) => { setLang(l); setLangStore(l); };

  const saveData = () => {
    if (!form.name?.trim()) { alert("Ism kiriting!"); return; }
    if (!isValid(form.phoneFormatted)) { alert("9 ta raqam kiriting!"); return; }
    const saved = { ...form, phone: rawPhone(form.phoneFormatted) };
    delete saved.phoneFormatted;
    saveProfile(saved);
    setProfileState(saved);
    setEditing(false);
  };

  const getGPS = () => {
    setGpsLoading(true);
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=uz,ru`);
          const data = await res.json();
          if (data.display_name) setNewAddr(a => ({...a, address: data.display_name}));
        } catch {}
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy:true, timeout:10000 }
    );
  };

  const addAddress = () => {
    if (!newAddr.label.trim()||!newAddr.address.trim()) return;
    const updated = [...addresses, {id:Date.now(),...newAddr}];
    setAddresses(updated); saveAddresses(updated);
    setNewAddr({label:"",address:""}); setAddingAddr(false);
  };

  const removeAddress = (id) => { const u=addresses.filter(a=>a.id!==id); setAddresses(u); saveAddresses(u); };

  const initials = profile.name ? profile.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2) : "?";
  const displayPhone = profile.phone ? "+998 "+profile.phone.replace("+998","").replace(/(\d{2})(\d{3})(\d{2})(\d{2})/,"$1 $2 $3 $4") : t.noPhone;

  const statusLabel = { new:t.statusNew, preparing:t.statusPreparing, delivered:t.statusDelivered, cancelled:t.statusCancelled };

  return (
    <div className="cp-root">
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => navigate("/")}>{t.backToMenu}</button>
        <span className="cp-header-title">{t.profileTitle}</span>
        <div className="pf-lang-switcher">
          {["uz","ru","en"].map(l => (
            <button key={l} className={`pf-lang-btn ${lang===l?"active":""}`} onClick={() => changeLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="cp-body" style={{maxWidth:640}}>
        <div className="pf-hero">
          <div className="pf-avatar">{initials}</div>
          <div className="pf-hero-info">
            <div className="pf-hero-name">{profile.name||t.guest}</div>
            <div className="pf-hero-phone">{displayPhone}</div>
          </div>
        </div>

        <div className="pf-tabs">
          {[{key:"profile",label:`👤 ${t.profile}`},{key:"orders",label:`📋 ${t.orders}`},{key:"addresses",label:`📍 ${t.addresses}`}].map(tb => (
            <button key={tb.key} className={`pf-tab ${tab===tb.key?"active":""}`} onClick={() => setTab(tb.key)}>{tb.label}</button>
          ))}
        </div>

        {/* PROFILE TAB */}
        {tab==="profile" && (
          <div className="pf-card">
            {!editing ? (
              <>
                <div className="pf-info-row"><span className="pf-info-label">👤 {t.fullName}</span><span className="pf-info-val">{profile.name||"—"}</span></div>
                <div className="pf-info-row"><span className="pf-info-label">📞 {t.phoneNumber}</span><span className="pf-info-val">{displayPhone}</span></div>
                {profile.email && <div className="pf-info-row"><span className="pf-info-label">📧 Email</span><span className="pf-info-val">{profile.email}</span></div>}
                {profile.note && <div className="pf-info-row"><span className="pf-info-label">📝</span><span className="pf-info-val">{profile.note}</span></div>}
                <button className="cp-next-btn" style={{marginTop:16}} onClick={() => {setForm({...profile,phoneFormatted:fmtPhone(profile.phone?.replace("+998","")||"")});setEditing(true);}}>
                  {profile.name ? t.editProfile : t.fillProfile}
                </button>
                {profile.name && (
                  <button className="cp-continue-btn" style={{marginTop:8}} onClick={() => { if(window.confirm(t.clearConfirm)){localStorage.removeItem("profile");setProfileState({});setForm({phoneFormatted:""});setEditing(true);}}}>
                    {t.clearProfile}
                  </button>
                )}
              </>
            ) : (
              <div className="cp-form">
                <div className="cp-form-section-title">{t.personalInfo}</div>
                <div className="cp-form-field">
                  <label>{t.fullName} *</label>
                  <input type="text" placeholder={t.namePlaceholder} value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
                </div>
                <div className="cp-form-field">
                  <label>{t.phoneNumber} *</label>
                  <div className="pf-phone-wrap">
                    <span className="pf-phone-prefix">+998</span>
                    <input type="tel" className="pf-phone-input" placeholder={t.phonePlaceholder}
                      value={form.phoneFormatted||""} onChange={e=>setForm(f=>({...f,phoneFormatted:fmtPhone(e.target.value)}))} maxLength={12} />
                  </div>
                  <span className="cp-field-hint">{(form.phoneFormatted||"").replace(/\s/g,"").length}/9{isValid(form.phoneFormatted||"")?" ✅":""}</span>
                </div>
                <div className="cp-form-field">
                  <label>{t.email}</label>
                  <input type="email" placeholder={t.emailPlaceholder} value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
                </div>
                <div className="cp-form-field">
                  <label>{t.note}</label>
                  <input type="text" placeholder={t.notePlaceholder} value={form.note||""} onChange={e=>setForm(f=>({...f,note:e.target.value}))} />
                </div>
                <button className="cp-next-btn" onClick={saveData}>{t.save}</button>
                {profile.name && <button className="cp-continue-btn" onClick={() => setEditing(false)}>{t.cancel}</button>}
              </div>
            )}
          </div>
        )}

        {/* ORDERS TAB */}
        {tab==="orders" && (
          <>
            {!profile.phone ? (
              <div className="pf-card" style={{textAlign:"center",padding:"40px 20px"}}>
                <div style={{fontSize:"3rem",marginBottom:12}}>📋</div>
                <p style={{fontWeight:700,marginBottom:16}}>{t.noOrders}</p>
                <button className="cp-next-btn" onClick={() => {setTab("profile");setEditing(true);}}>👤 {t.fillProfile}</button>
              </div>
            ) : ordersLoading ? (
              <div style={{textAlign:"center",padding:60}}><div className="spinner" style={{margin:"0 auto"}} /></div>
            ) : orders.length===0 ? (
              <div className="pf-card" style={{textAlign:"center",padding:"40px 20px"}}>
                <div style={{fontSize:"3rem",marginBottom:12,opacity:0.3}}>🛒</div>
                <p style={{fontWeight:700,color:"var(--g4)",marginBottom:16}}>{t.noOrders}</p>
                <button className="cp-next-btn" onClick={() => navigate("/")}>{t.goToMenu}</button>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {orders.map(order => (
                  <div key={order._id} className="pf-order-card">
                    <div className="pf-order-header">
                      <span className="pf-order-date">🗓 {new Date(order.createdAt).toLocaleString()}</span>
                      <span style={{color:STATUS_COLOR[order.status]||"#888",background:(STATUS_COLOR[order.status]||"#888")+"18",padding:"3px 12px",borderRadius:20,fontSize:"0.8rem",fontWeight:700}}>
                        {statusLabel[order.status]||order.status}
                      </span>
                    </div>
                    <div className="pf-order-items">{order.items.map((item,i) => <span key={i} className="cp-summary-chip">{item.title} × {item.quantity}</span>)}</div>
                    {order.address && <div style={{fontSize:"0.82rem",color:"var(--gray)",marginTop:6}}>📍 {order.address}</div>}
                    <div className="pf-order-total">{t.total}: <strong>{order.totalPrice?.toLocaleString()} so'm</strong></div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ADDRESSES TAB */}
        {tab==="addresses" && (
          <>
            {addresses.length===0 && !addingAddr ? (
              <div className="pf-card" style={{textAlign:"center",padding:"40px 20px"}}>
                <div style={{fontSize:"3rem",marginBottom:12,opacity:0.3}}>📍</div>
                <p style={{fontWeight:700,color:"var(--g4)",marginBottom:16}}>{t.noAddresses}</p>
                <button className="cp-next-btn" onClick={() => setAddingAddr(true)}>{t.addAddress}</button>
              </div>
            ) : (
              <>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {addresses.map(addr => (
                    <div key={addr.id} className="pf-addr-card">
                      <div><div className="pf-addr-label">📍 {addr.label}</div><div className="pf-addr-text">{addr.address}</div></div>
                      <button onClick={() => removeAddress(addr.id)} className="cp-item-remove" style={{fontSize:"1.1rem"}}>🗑</button>
                    </div>
                  ))}
                </div>
                {!addingAddr && <button className="cp-continue-btn" style={{marginTop:12}} onClick={() => setAddingAddr(true)}>{t.addAddress}</button>}
              </>
            )}
            {addingAddr && (
              <div className="pf-card" style={{marginTop:12}}>
                <div className="cp-form-section-title" style={{marginBottom:14}}>📍 {t.deliveryAddress}</div>
                <div className="cp-form-field">
                  <label>{t.addrLabel} *</label>
                  <input type="text" placeholder={t.addrLabelPlaceholder} value={newAddr.label} onChange={e=>setNewAddr(a=>({...a,label:e.target.value}))} />
                </div>
                <button type="button" className="cp-gps-btn" onClick={getGPS} disabled={gpsLoading} style={{marginBottom:8}}>
                  {gpsLoading ? t.gpsLoading : t.gpsDetect}
                </button>
                <div className="cp-form-field">
                  <label>{t.addrFull} *</label>
                  <input type="text" placeholder={t.addrPlaceholder} value={newAddr.address} onChange={e=>setNewAddr(a=>({...a,address:e.target.value}))} />
                </div>
                <div style={{display:"flex",gap:10,marginTop:8}}>
                  <button className="cp-next-btn" style={{flex:1}} onClick={addAddress}>{t.save}</button>
                  <button className="cp-continue-btn" style={{flex:1}} onClick={() => {setAddingAddr(false);setNewAddr({label:"",address:""});}}>{t.cancel}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}