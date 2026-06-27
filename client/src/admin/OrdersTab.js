import { useEffect, useState } from "react";
import { api } from "../api";
import { AppIcon } from "../icons";

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
        <h2 className="section-title" style={{ marginBottom: 0 }}><AppIcon name="list" size={18} /> Buyurtmalar</h2>
        <button className="filter-btn" onClick={fetchOrders}><AppIcon name="refresh" size={15} /> Yangilash</button>
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
                  <span className="order-phone"><AppIcon name="phone" size={13} /> {order.customerPhone}</span>
                  {order.address && <span className="order-address"><AppIcon name="location" size={13} /> {order.address}</span>}
                  {order.location && (
                    <a className="order-address"
                      href={`https://yandex.com/maps/?pt=${order.location.lng},${order.location.lat}&z=16&l=map`}
                      target="_blank" rel="noreferrer"><AppIcon name="map" size={13} /> Xaritada ko'rish</a>
                  )}
                  {order.orderType === "pickup" && (
                    <span className="order-address"><AppIcon name="bag" size={13} /> Olib ketish{order.filialName ? ` — ${order.filialName}` : ""}</span>
                  )}
                  {order.orderType === "delivery" && (
                    <span className={`millenium-badge ${order.milleniumOrderId ? "success" : "pending"}`}>
                      <AppIcon name="taxi" size={13} /> Millenium: {order.milleniumOrderId ? `#${order.milleniumOrderId}` : "yuborilmagan"}
                      {(order.driverName || order.driverPhone || order.carModel) && (
                        <div className="driver-info-box">
                          <div className="driver-info-title"><AppIcon name="taxi" size={14} /> Kuryer ma'lumotlari</div>
                          {order.driverName && <div><AppIcon name="user" size={13} /> {order.driverName}</div>}
                          {order.driverPhone && <div><AppIcon name="phone" size={13} /> {order.driverPhone}</div>}
                          {order.carModel && <div><AppIcon name="taxi" size={13} /> {order.carModel}</div>}
                          {order.driverLocation?.lat && (
                            <a href={`https://yandex.com/maps/?pt=${order.driverLocation.lng},${order.driverLocation.lat}&z=16&l=map`}
                              target="_blank" rel="noreferrer"><AppIcon name="map" size={13} /> Kuryerni xaritada ko‘rish</a>
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
                      {order.paymentType === "cash" && <><AppIcon name="money" size={13} /> Naqd</>}
                      {order.paymentType === "click" && <><AppIcon name="card" size={13} /> Click</>}
                      {order.paymentType === "payme" && <><AppIcon name="card" size={13} /> Payme</>}
                      {order.paymentType === "card" && <><AppIcon name="card" size={13} /> Karta</>}
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
                    <button className="status-btn preparing" onClick={() => updateOrderStatus(order._id, "preparing")}><AppIcon name="chef" size={15} /> Tayyorlash</button>
                  )}
                  {order.status === "preparing" && order.orderType === "delivery" && (
                    <button className="status-btn preparing" onClick={() => updateOrderStatus(order._id, "on_way")}><AppIcon name="taxi" size={15} /> Yo'lda</button>
                  )}
                  {((order.status === "preparing" && order.orderType !== "delivery") || order.status === "on_way") && (
                    <button className="status-btn delivered" onClick={() => updateOrderStatus(order._id, "delivered")}><AppIcon name="check" size={15} /> Yetkazildi</button>
                  )}
                  {(order.status === "new" || order.status === "preparing" || order.status === "on_way") && (
                    <button className="status-btn cancelled" onClick={() => updateOrderStatus(order._id, "cancelled")}><AppIcon name="close" size={15} /> Bekor</button>
                  )}
                  <button className="status-btn delete-order" onClick={() => deleteOrder(order._id)}><AppIcon name="trash" size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
