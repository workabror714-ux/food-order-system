import { useEffect, useState } from "react";
import { LOGO_WHITE } from "./i18n";
import { api } from "./api";
import { getField, sortCategories } from "./adminUtils";
import FoodsTab from "./admin/FoodsTab";
import OrdersTab from "./admin/OrdersTab";
import BannerTab from "./admin/BannerTab";
import FilialsTab from "./admin/FilialsTab";
import AdminsTab from "./admin/AdminsTab";

// Admin panel — ingichka shell: topbar + tablar + faol tab komponenti.
// Har bir tab mustaqil; foods/categories Foods va Banner tablar bo'lishadi.
export default function Admin() {
  const token = localStorage.getItem("token");
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  useEffect(() => { if (!token) window.location.href = "/login"; }, [token]);

  const [tab, setTab] = useState("foods");
  const [foods, setFoods] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newOrderCount, setNewOrderCount] = useState(0); // OrdersTab badge uchun

  const fetchFoods = async () => {
    try {
      const data = await api.get("/api/foods");
      setFoods(data);
      const cats = [];
      data.forEach(f => {
        const key = getField(f.category, "uz");
        if (key && !cats.find(c => getField(c, "uz") === key)) cats.push(f.category);
      });
      setCategories(sortCategories(cats));
    } catch {}
  };
  useEffect(() => { fetchFoods(); }, []);

  const handleLogout = () => { localStorage.clear(); window.location.href = "/login"; };

  return (
    <div className="admin-root">
      <div className="admin-topbar">
        <div className="admin-logo">
          <img src={LOGO_WHITE} alt="Yalpiz" className="admin-logo-img" />
          <span style={{ fontSize: "0.88rem", fontWeight: 700, opacity: 0.9 }}>Admin Panel</span>
        </div>
        <div className="admin-user-info">
          <span className="admin-username">{savedUser.username}</span>
          <span className="admin-role-badge">{savedUser.role}</span>
          <button className="logout-btn" onClick={handleLogout}>Chiqish</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === "foods" ? "active" : ""}`} onClick={() => setTab("foods")}>🍜 Taomlar</button>
        <button className={`admin-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          📋 Buyurtmalar {newOrderCount > 0 && <span className="tab-badge">{newOrderCount}</span>}
        </button>
        <button className={`admin-tab ${tab === "banner" ? "active" : ""}`} onClick={() => setTab("banner")}>🎨 Banner</button>
        <button className={`admin-tab ${tab === "filials" ? "active" : ""}`} onClick={() => setTab("filials")}>🏢 Filiallar</button>
        {savedUser.role === "superadmin" && (
          <button className={`admin-tab ${tab === "admins" ? "active" : ""}`} onClick={() => setTab("admins")}>👤 Adminlar</button>
        )}
      </div>

      <div className="admin-content">
        {tab === "foods" && (
          <FoodsTab foods={foods} setFoods={setFoods} categories={categories} setCategories={setCategories} refetch={fetchFoods} />
        )}
        {tab === "orders" && <OrdersTab onNewCount={setNewOrderCount} />}
        {tab === "banner" && <BannerTab categories={categories} savedUser={savedUser} />}
        {tab === "filials" && <FilialsTab />}
        {tab === "admins" && savedUser.role === "superadmin" && <AdminsTab savedUser={savedUser} />}
      </div>
    </div>
  );
}
