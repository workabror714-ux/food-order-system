import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { getLang, TRANSLATIONS } from "./i18n";

const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile")||"null"); } catch { return null; } };
const saveProfile = (p) => { localStorage.setItem("profile",JSON.stringify(p)); window.dispatchEvent(new Event("profileUpdated")); };
const fmtPhone = (v) => { const d=v.replace(/\D/g,"").replace(/^998/,"").slice(0,9); let r=""; if(d.length>0)r+=d.slice(0,2); if(d.length>2)r+=" "+d.slice(2,5); if(d.length>5)r+=" "+d.slice(5,7); if(d.length>7)r+=" "+d.slice(7,9); return r; };
const rawPhone = (f) => "+998"+f.replace(/\s/g,"");
const isValid = (f) => f.replace(/\s/g,"").length===9;

export default function UserAuth() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(getLang);
  const t = TRANSLATIONS[lang] || TRANSLATIONS.uz;
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState("phone");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onLang = () => setLang(getLang());
    window.addEventListener("langChanged", onLang);
    return () => window.removeEventListener("langChanged", onLang);
  }, []);

  const handlePhone = (e) => {
    e.preventDefault();
    if (!isValid(phone)) { alert("9 ta raqam kiriting!"); return; }
    const full = rawPhone(phone);
    const ex = getProfile();
    if (ex?.phone===full) { navigate("/profile"); return; }
    setStep("name");
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    saveProfile({ name:name.trim(), phone:rawPhone(phone), createdAt:new Date().toISOString() });
    setTimeout(() => { setLoading(false); navigate("/profile"); }, 500);
  };

  return (
    <div className="ua-root">
      <div className="ua-card">
        {/* Til tanlash */}
        <div style={{alignSelf:"flex-end",marginBottom:4}}>
          <div className="pf-lang-switcher">
            {["uz","ru","en"].map(l => (
              <button key={l} className={`pf-lang-btn ${lang===l?"active":""}`}
                onClick={() => { setLang(l); localStorage.setItem("lang",l); window.dispatchEvent(new Event("langChanged")); }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="ua-logo">🍃</div>
        <h1 className="ua-title">{t.appName}</h1>

        {step==="phone" ? (
          <>
            <p className="ua-desc">{t.enterPhone}</p>
            <form onSubmit={handlePhone} className="ua-form">
              <div className="cp-form-field">
                <div className="pf-phone-wrap">
                  <span className="pf-phone-prefix">+998</span>
                  <input type="tel" className="pf-phone-input" placeholder={t.phonePlaceholder}
                    value={phone} onChange={e => setPhone(fmtPhone(e.target.value))} maxLength={12} autoFocus />
                </div>
                <span className="cp-field-hint">{phone.replace(/\s/g,"").length}/9{isValid(phone)?" ✅":""}</span>
              </div>
              <button type="submit" className="cp-next-btn" disabled={!isValid(phone)}>{t.continue}</button>
              <button type="button" className="cp-continue-btn" onClick={() => navigate("/")}>{t.backToMenu}</button>
            </form>
          </>
        ) : (
          <>
            <p className="ua-desc">{t.enterName}</p>
            <div className="ua-phone-badge">📞 +998 {phone}</div>
            <form onSubmit={handleRegister} className="ua-form">
              <div className="cp-form-field">
                <input type="text" placeholder={t.enterNamePlaceholder} value={name}
                  onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <button type="submit" className="cp-next-btn" disabled={!name.trim()||loading}>
                {loading ? t.loading : "✅ "+t.save}
              </button>
              <button type="button" className="cp-continue-btn" onClick={() => setStep("phone")}>{t.back}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}