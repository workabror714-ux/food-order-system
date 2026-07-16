import { useEffect, useState } from "react";
import { LOGO_WHITE } from "./i18n";
import { AppIcon } from "./icons";
import { api } from "./api";
import { getField, sortCategories } from "./adminUtils";
import FoodsTab from "./admin/FoodsTab";
import OrdersTab from "./admin/OrdersTab";
import BannerTab from "./admin/BannerTab";
import FilialsTab from "./admin/FilialsTab";
import AdminsTab from "./admin/AdminsTab";
import CustomersTab from "./admin/CustomersTab";
import BroadcastTab from "./admin/BroadcastTab";

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
      let data = [];

      try {
        const adminData = await api.get(
          "/api/admin/foods?limit=500",
          true
        );
        data = Array.isArray(adminData?.foods) ? adminData.foods : [];
      } catch {
        data = await api.get("/api/foods");
      }

      const deleverFoods = data.filter(
        (food) =>
          food?.source === "delever" &&
          food?.deleverId
      );

      setFoods(deleverFoods);

      const categoryMap = new Map();

      deleverFoods.forEach((food) => {
        const category =
          food.category && typeof food.category === "object"
            ? {
                uz: getField(food.category, "uz"),
                ru: getField(food.category, "ru"),
                en: getField(food.category, "en"),
              }
            : {
                uz: String(food.category || ""),
                ru: String(food.category || ""),
                en: String(food.category || ""),
              };

        const key =
          food.deleverCategoryId;

        if (
          !key ||
          categoryMap.has(key)
        ) {
          return;
        }

        categoryMap.set(key, {
          ...category,
          deleverCategoryId:
            key,
          source:
            "delever",
        });
      });

      setCategories(sortCategories([...categoryMap.values()]));
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
        <button className={`admin-tab ${tab === "foods" ? "active" : ""}`} onClick={() => setTab("foods")}><AppIcon name="menu" size={16} /> Taomlar</button>
        <button className={`admin-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          <AppIcon name="list" size={16} /> Buyurtmalar {newOrderCount > 0 && <span className="tab-badge">{newOrderCount}</span>}
        </button>
        <button className={`admin-tab ${tab === "banner" ? "active" : ""}`} onClick={() => setTab("banner")}><AppIcon name="palette" size={16} /> Banner</button>
        <button className={`admin-tab ${tab === "filials" ? "active" : ""}`} onClick={() => setTab("filials")}><AppIcon name="building" size={16} /> Filiallar</button>
        <button className={`admin-tab ${tab === "customers" ? "active" : ""}`} onClick={() => setTab("customers")}>👥 Mijozlar</button>
        <button className={`admin-tab ${tab === "broadcast" ? "active" : ""}`} onClick={() => setTab("broadcast")}>📢 Reklama</button>
        {savedUser.role === "superadmin" && (
          <button className={`admin-tab ${tab === "admins" ? "active" : ""}`} onClick={() => setTab("admins")}><AppIcon name="profile" size={16} /> Adminlar</button>
        )}
      </div>

      <div className="admin-content">
        {tab === "foods" && (
          <FoodsTab
            foods={foods}
            setFoods={setFoods}
            categories={categories}
            setCategories={setCategories}
            refetch={fetchFoods}
            savedUser={savedUser}
          />
        )}
        {tab === "orders" && <OrdersTab onNewCount={setNewOrderCount} />}
        {tab === "banner" && <BannerTab categories={categories} savedUser={savedUser} />}
        {tab === "filials" && <FilialsTab />}
        {tab === "customers" && <CustomersTab />}
        {tab === "broadcast" && <BroadcastTab />}
        {tab === "admins" && savedUser.role === "superadmin" && <AdminsTab savedUser={savedUser} />}
      </div>
    </div>
  );
}
