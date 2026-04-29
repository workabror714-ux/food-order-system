import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const getProfile = () => { try { return JSON.parse(localStorage.getItem("profile") || "null"); } catch { return null; } };
const saveProfile = (p) => localStorage.setItem("profile", JSON.stringify(p));

export default function UserAuth() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState("phone"); // "phone" | "name"
  const [loading, setLoading] = useState(false);

  const handlePhone = (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    // Agar avval ro'yxatdan o'tgan bo'lsa
    const existing = getProfile();
    if (existing?.phone === phone.trim()) {
      navigate("/profile");
      return;
    }
    setStep("name");
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const profile = { name: name.trim(), phone: phone.trim(), createdAt: new Date().toISOString() };
    saveProfile(profile);
    setTimeout(() => {
      setLoading(false);
      navigate("/profile");
    }, 600);
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
              <div className="cp-form-field">
                <label>Telefon raqam *</label>
                <input
                  type="tel"
                  placeholder="+998 90 000 00 00"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  autoFocus
                  style={{ fontSize: "1.1rem", textAlign: "center", letterSpacing: 1 }}
                />
              </div>
              <button type="submit" className="cp-next-btn" disabled={!phone.trim()}>
                Davom etish →
              </button>
              <button type="button" className="cp-continue-btn"
                onClick={() => navigate("/")}>
                ← Menyuga qaytish
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="ua-desc">Ismingizni kiriting</p>
            <div className="ua-phone-badge">📞 {phone}</div>
            <form onSubmit={handleRegister} className="ua-form">
              <div className="cp-form-field">
                <label>Ismingiz *</label>
                <input
                  type="text"
                  placeholder="Isim Familiya"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                  style={{ fontSize: "1.05rem" }}
                />
              </div>
              <button type="submit" className="cp-next-btn" disabled={!name.trim() || loading}>
                {loading ? "⏳ Saqlanmoqda..." : "✅ Kirish"}
              </button>
              <button type="button" className="cp-continue-btn"
                onClick={() => setStep("phone")}>
                ← Orqaga
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}