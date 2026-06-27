import { useEffect, useState } from "react";
import { api } from "../api";

const statusLabel = { new: "Yangi", preparing: "Tayyorlanmoqda", on_way: "Yo'lda", delivered: "Yetkazildi", cancelled: "Bekor" };
const statusColor = { new: "#3b82f6", preparing: "#f59e0b", on_way: "#0ea5e9", delivered: "#10b981", cancelled: "#ef4444" };
const paymentStatusLabel = { paid: "To‘langan", unpaid: "To‘lanmagan (naqd)", pending: "Kutilmoqda", cancelled: "Bekor qilingan" };

// Buyurtmalar tabi — mustaqil. newOrderCount'ni shell'ga (tab badge uchun) onNewCount orqali yetkazadi.
export default function OrdersTab({ onNewCount }) {
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState("all");
  const [ordersLoading, setOrdersLoading] = useState(false);

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const q = orderFilter === "all" ? "" : `?status=${orderFilter}`;
      setOrders(await api.get(`/api/orders${q}`, true));
    } catch {} finally { setOrdersLoading(false); }
  };
  useEffect(() => { fetchOrders(); /* eslint-disable-next-line */ }, [orderFilter]);

  const newOrderCount = orders.filter(o => o.status === "new").length;
  useEffect(() => { onNewCount?.(newOrderCount); /* eslint-disable-next-line */ }, [newOrderCount]);

  const updateOrderStatus = async (id, status) => {
    try { await api.put(`/api/orders/${id}/status`, { status }, true); fetchOrders(); } catch {}
  };
  const deleteOrder = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await api.del(`/api/orders/${id}`, true); fetchOrders(); } catch {}
  };

  return (
    <div className="admin-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>📋 Buyurtmalar</h2>
        <button className="filter-btn" onClick={fetchOrders}>🔄 Yangilash</button>
      </div>
      <div className="order-filter-bar">
        {["all", "new", "preparing", "on_way", "delivered", "cancelled"].map(s => (
          <button key={s} className={`filter-btn ${orderFilter === s ? "active" : ""}`} onClick={() => setOrderFilter(s)}>
            {s === "all" ? "Barchasi" : statusLabel[s]}
            {s === "new" && newOrderCount > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", padding: "1px 6px", fontSize: 11, marginLeft: 6 }}>
                {newOrderCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {ordersLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Buyurtmalar yo'q</div>
      ) : (
        <div className="orders-list">
          {orders.map(order => (
            <div key={order._id} className="order-card">
              <div className="order-card-header">
                <div>
                  <span className="order-name">{order.customerName}</span>
                  <span className="order-phone">📞 {order.customerPhone}</span>
                  {order.address && <span className="order-address">📍 {order.address}</span>}
                  {order.location && (
                    <a className="order-address"
                      href={`https://yandex.com/maps/?pt=${order.location.lng},${order.location.lat}&z=16&l=map`}
                      target="_blank" rel="noreferrer">🗺 Xaritada ko'rish</a>
                  )}
                  {order.orderType === "pickup" && (
                    <span className="order-address">🛍 Olib ketish{order.filialName ? ` — ${order.filialName}` : ""}</span>
                  )}
                  {order.orderType === "delivery" && (
                    <span className={`millenium-badge ${order.milleniumOrderId ? "success" : "pending"}`}>
                      🚕 Millenium: {order.milleniumOrderId ? `#${order.milleniumOrderId}` : "yuborilmagan"}
                      {(order.driverName || order.driverPhone || order.carModel) && (
                        <div className="driver-info-box">
                          <div className="driver-info-title">🚗 Kuryer ma'lumotlari</div>
                          {order.driverName && <div>👤 {order.driverName}</div>}
                          {order.driverPhone && <div>📞 {order.driverPhone}</div>}
                          {order.carModel && <div>🚙 {order.carModel}</div>}
                          {order.driverLocation?.lat && (
                            <a href={`https://yandex.com/maps/?pt=${order.driverLocation.lng},${order.driverLocation.lat}&z=16&l=map`}
                              target="_blank" rel="noreferrer">🗺 Kuryerni xaritada ko‘rish</a>
                          )}
                        </div>
                      )}
                    </span>
                  )}
                </div>
                <div className="order-right">
                  <span className="order-status-badge"
                    style={{ backgroundColor: statusColor[order.status] + "22", color: statusColor[order.status] }}>
                    {statusLabel[order.status]}
                  </span>
                  {order.paymentType && (
                    <span style={{ fontSize: "0.72rem", color: "#888", display: "block", marginTop: 2 }}>
                      {order.paymentType === "cash" && "💵 Naqd"}
                      {order.paymentType === "click" && "🟦 Click"}
                      {order.paymentType === "payme" && "🟩 Payme"}
                      {order.paymentType === "card" && "💳 Karta"}
                      {order.paymentStatus && (
                        <span className={`millenium-badge ${order.paymentStatus === "paid" ? "success" : "pending"}`}>
                          To‘lov: {paymentStatusLabel[order.paymentStatus] || order.paymentStatus}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="order-date">{new Date(order.createdAt).toLocaleString("uz-UZ")}</span>
                </div>
              </div>
              <div className="order-items">
                {order.items.map((item, i) => (
                  <span key={i} className="order-item-chip">{item.title} × {item.quantity}</span>
                ))}
              </div>
              <div className="order-card-footer">
                <span className="order-total">Jami: <strong>{order.totalPrice?.toLocaleString()} so'm</strong></span>
                <div className="order-actions">
                  {order.status === "new" && (
                    <button className="status-btn preparing" onClick={() => updateOrderStatus(order._id, "preparing")}>🍳 Tayyorlash</button>
                  )}
                  {order.status === "preparing" && order.orderType === "delivery" && (
                    <button className="status-btn preparing" onClick={() => updateOrderStatus(order._id, "on_way")}>🚕 Yo'lda</button>
                  )}
                  {((order.status === "preparing" && order.orderType !== "delivery") || order.status === "on_way") && (
                    <button className="status-btn delivered" onClick={() => updateOrderStatus(order._id, "delivered")}>✅ Yetkazildi</button>
                  )}
                  {(order.status === "new" || order.status === "preparing" || order.status === "on_way") && (
                    <button className="status-btn cancelled" onClick={() => updateOrderStatus(order._id, "cancelled")}>✕ Bekor</button>
                  )}
                  <button className="status-btn delete-order" onClick={() => deleteOrder(order._id)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
