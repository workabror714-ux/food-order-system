import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const STATUS = {
  new:       { label: "Buyurtma qabul qilindi",  emoji: "🕐", color: "#3b82f6", bg: "#eff6ff", step: 1 },
  preparing: { label: "Tayyorlanmoqda...",         emoji: "👨‍🍳", color: "#f59e0b", bg: "#fffbeb", step: 2 },
  delivered: { label: "Yetkazib berildi! ✅",      emoji: "🎉", color: "#10b981", bg: "#ecfdf5", step: 3 },
  cancelled: { label: "Bekor qilindi",             emoji: "❌", color: "#ef4444", bg: "#fef2f2", step: 0 },
};

const STEPS = [
  { key: "new",       emoji: "✅", label: "Qabul qilindi" },
  { key: "preparing", emoji: "👨‍🍳", label: "Tayyorlanmoqda" },
  { key: "delivered", emoji: "🚀", label: "Yetkazildi" },
];

export default function OrderStatus() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState(() => {
    try { return JSON.parse(localStorage.getItem("profile") || "{}").phone || ""; } catch { return ""; }
  });
  const [inputPhone, setInputPhone] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const fetchOrders = async (ph) => {
    const target = ph || phone;
    if (!target) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/orders/my/${encodeURIComponent(target)}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
        setLastUpdated(new Date());
        setSearched(true);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Sahifa ochilganda profilda telefon bo'lsa avtomatik yuklaydi
  useEffect(() => {
    if (phone) { fetchOrders(phone); }
    return () => clearInterval(intervalRef.current);
  }, []);

  // Har 15 sekundda yangilanadi
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (phone && searched) {
      intervalRef.current = setInterval(() => fetchOrders(phone), 15000);
    }
    return () => clearInterval(intervalRef.current);
  }, [phone, searched]);

  const handleSearch = (e) => {
    e.preventDefault();
    const p = inputPhone.trim();
    if (!p) return;
    setPhone(p);
    fetchOrders(p);
  };

  const activeOrders = orders.filter(o => o.status !== "delivered" && o.status !== "cancelled");
  const historyOrders = orders.filter(o => o.status === "delivered" || o.status === "cancelled");

  return (
    <div className="cp-root">
      {/* HEADER */}
      <div className="cp-header">
        <button className="cp-back-btn" onClick={() => navigate("/")}>← Orqaga</button>
        <span className="cp-header-title">Buyurtmam holati</span>
        <div style={{ width: 80 }} />
      </div>

      <div className="cp-body" style={{ maxWidth: 600 }}>

        {/* Telefon qidirish */}
        {!phone ? (
          <div className="os-search-card">
            <div className="os-search-icon">📦</div>
            <h2 className="os-search-title">Buyurtmangizni kuzating</h2>
            <p className="os-search-desc">Telefon raqamingizni kiriting — buyurtmangiz holati chiqadi</p>
            <form onSubmit={handleSearch} style={{ width: "100%" }}>
              <div className="cp-form-field">
                <label>Telefon raqam</label>
                <input type="tel" placeholder="+998 90 000 00 00"
                  value={inputPhone}
                  onChange={e => setInputPhone(e.target.value)}
                  style={{ fontSize: "1rem" }} />
              </div>
              <button type="submit" className="cp-next-btn" style={{ marginTop: 12 }}
                disabled={loading || !inputPhone.trim()}>
                {loading ? "⏳ Qidirilmoqda..." : "🔍 Buyurtmalarni ko'rish"}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Raqam + Yangilash */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "white", borderRadius: 14, padding: "12px 16px", boxShadow: "var(--shadow)" }}>
              <div>
                <div style={{ fontSize: "0.78rem", color: "var(--gray)", fontWeight: 600 }}>Telefon raqam</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--g4)" }}>{phone}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {lastUpdated && (
                  <span style={{ fontSize: "0.72rem", color: "var(--gray)" }}>
                    {lastUpdated.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                <button className="cp-back-btn" onClick={() => fetchOrders(phone)} disabled={loading}>
                  {loading ? "⏳" : "🔄"}
                </button>
                <button className="cp-back-btn" onClick={() => { setPhone(""); setOrders([]); setSearched(false); }}>
                  ✕
                </button>
              </div>
            </div>

            {loading && orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div className="spinner" style={{ margin: "0 auto 16px" }} />
                <p style={{ color: "var(--gray)" }}>Buyurtmalar qidirilmoqda...</p>
              </div>
            ) : searched && orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: "3.5rem", opacity: 0.3, marginBottom: 12 }}>📭</div>
                <p style={{ fontWeight: 800, color: "var(--g4)", marginBottom: 8 }}>Buyurtma topilmadi</p>
                <p style={{ color: "var(--gray)", fontSize: "0.9rem" }}>
                  Bu raqamda buyurtma yo'q yoki boshqa raqam bilan buyurtma qilingan
                </p>
                <button className="cp-next-btn" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
                  Menyuga o'tish
                </button>
              </div>
            ) : (
              <>
                {/* AKTIV BUYURTMALAR */}
                {activeOrders.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--gray)",
                      textTransform: "uppercase", marginBottom: 10, marginTop: 4 }}>
                      Faol buyurtmalar ({activeOrders.length})
                    </div>
                    {activeOrders.map(order => (
                      <OrderCard key={order._id} order={order} />
                    ))}
                  </div>
                )}

                {/* TARIX */}
                {historyOrders.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--gray)",
                      textTransform: "uppercase", marginBottom: 10, marginTop: 4 }}>
                      Tarix ({historyOrders.length})
                    </div>
                    {historyOrders.map(order => (
                      <OrderCard key={order._id} order={order} compact />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Yangi buyurtma */}
        <button className="cp-continue-btn" onClick={() => navigate("/")}>
          🍽 Yangi buyurtma berish
        </button>
      </div>
    </div>
  );
}

function OrderCard({ order, compact }) {
  const s = STATUS[order.status] || STATUS.new;
  const currentStep = s.step;

  return (
    <div style={{
      background: "white", borderRadius: 18, padding: "18px",
      boxShadow: "var(--shadow)", marginBottom: 12,
      border: `2px solid ${s.color}22`
    }}>
      {/* Status header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: s.bg, borderRadius: 12, padding: "12px 14px", marginBottom: 14
      }}>
        <span style={{ fontSize: "1.8rem" }}>{s.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: "1rem", color: s.color }}>{s.label}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--gray)", marginTop: 2 }}>
            {new Date(order.createdAt).toLocaleString("uz-UZ")}
          </div>
        </div>
      </div>

      {/* Progress bar — faqat aktiv buyurtmalarda */}
      {!compact && order.status !== "cancelled" && (
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 16 }}>
          {STEPS.map((step, idx) => {
            const done = currentStep > idx;
            const active = currentStep === idx + 1;
            return (
              <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
                  {idx > 0 && (
                    <div style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: done || active ? "var(--g)" : "#e2e8e2",
                      transition: "background 0.4s"
                    }} />
                  )}
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1rem",
                    background: done ? "var(--g)" : active ? "var(--g2)" : "#f2f7f2",
                    border: `3px solid ${done || active ? "var(--g)" : "#d4e8da"}`,
                    transition: "all 0.4s",
                    boxShadow: active ? "0 0 0 4px rgba(29,107,62,0.15)" : "none"
                  }}>
                    {done ? "✓" : step.emoji}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: done ? "var(--g)" : "#e2e8e2",
                      transition: "background 0.4s"
                    }} />
                  )}
                </div>
                <div style={{
                  fontSize: "0.7rem", fontWeight: active ? 800 : 600,
                  color: active ? "var(--g)" : done ? "var(--g4)" : "var(--gray)",
                  marginTop: 6, textAlign: "center"
                }}>{step.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Taomlar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {order.items.map((item, i) => (
          <span key={i} className="cp-summary-chip">{item.title} × {item.quantity}</span>
        ))}
      </div>

      {/* Manzil */}
      {order.address && (
        <div style={{ fontSize: "0.82rem", color: "var(--gray)", marginBottom: 8, display: "flex", gap: 6 }}>
          <span>📍</span>
          <span style={{ flex: 1 }}>{order.address}</span>
        </div>
      )}

      {/* Jami */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        borderTop: "1px solid var(--g3)", paddingTop: 10, marginTop: 4
      }}>
        <span style={{ fontSize: "0.85rem", color: "var(--gray)" }}>Jami to'lov</span>
        <strong style={{ color: "var(--g)", fontSize: "0.95rem" }}>
          {order.totalPrice?.toLocaleString()} so'm
        </strong>
      </div>
    </div>
  );
}