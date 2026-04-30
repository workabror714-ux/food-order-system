import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "null"); } catch { return null; } };
const saveProfile = (p) => { localStorage.setItem("profile", JSON.stringify(p)); window.dispatchEvent(new Event("profileUpdated")); };

const formatPhone = (val) => {
  const digits = val.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
  let r = "";
  if (digits.length > 0) r += digits.slice(0, 2);
  if (digits.length > 2) r += " " + digits.slice(2, 5);
  if (digits.length > 5) r += " " + digits.slice(5, 7);
  if (digits.length > 7) r += " " + digits.slice(7, 9);
  return r;
};
const rawPhone = (f) => "+998" + f.replace(/\s/g, "");
const isPhoneValid = (f) => f.replace(/\s/g, "").length === 9;

export default function UserAuth() {
  const navigate = useNavigate();
  const [phoneFormatted, setPhoneFormatted] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState("phone");
  const [loading, setLoading] = useState(false);

  const handlePhone = (e) => {
    e.preventDefault();
    if (!isPhoneValid(phoneFormatted)) {
      alert("Telefon raqam to'liq emas! 9 ta raqam kiriting.");
      return;
    }
    const fullPhone = rawPhone(phoneFormatted);
    const existing = getProfile();
    if (existing?.phone === fullPhone) {
      navigate("/profile");
      return;
    }
    setStep("name");
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const fullPhone = rawPhone(phoneFormatted);
    const profile = { name: name.trim(), phone: fullPhone, createdAt: new Date().toISOString() };
    saveProfile(profile);
    setTimeout(() => { setLoading(false); navigate("/profile"); }, 600);
  };

  return (
    <div className="ua-root">
      <div className="ua-card">
        <div className="ua-logo">🍃</div>
        <h1 className="ua-title">FreshBite</h1>

        {step === "phone" ? (
          <>
            <p className="ua-desc">Telefon raqamingizni kiriting</p>
            <form onSubmit={handlePhone} className="ua-form">
              {/* Telefon — +998 prefix qotib turadi */}
              <div className="cp-form-field">
                <label>Telefon raqam *</label>
                <div className="pf-phone-wrap">
                  <span className="pf-phone-prefix">+998</span>
                  <input
                    type="tel"
                    className="pf-phone-input"
                    placeholder="90 123 45 67"
                    value={phoneFormatted}
                    onChange={e => setPhoneFormatted(formatPhone(e.target.value))}
                    maxLength={12}
                    autoFocus
                  />
                </div>
                <span className="cp-field-hint">
                  {phoneFormatted.replace(/\s/g, "").length}/9 raqam
                  {isPhoneValid(phoneFormatted) ? " ✅" : ""}
                </span>
              </div>
              <button type="submit" className="cp-next-btn"
                disabled={!isPhoneValid(phoneFormatted)}>
                Davom etish →
              </button>
              <button type="button" className="cp-continue-btn" onClick={() => navigate("/")}>
                ← Menyuga qaytish
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="ua-desc">Ismingizni kiriting</p>
            <div className="ua-phone-badge">📞 +998 {phoneFormatted}</div>
            <form onSubmit={handleRegister} className="ua-form">
              <div className="cp-form-field">
                <label>Ismingiz *</label>
                <input type="text" placeholder="Isim Familiya"
                  value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <button type="submit" className="cp-next-btn"
                disabled={!name.trim() || loading}>
                {loading ? "⏳ Saqlanmoqda..." : "✅ Kirish"}
              </button>
              <button type="button" className="cp-continue-btn"
                onClick={() => setStep("phone")}>← Orqaga</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}