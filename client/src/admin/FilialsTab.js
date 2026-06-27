import { useEffect, useState } from "react";
import { api } from "../api";

const emptyFilialForm = { name: "", address: "", lat: "", lng: "", isActive: true };

// Filiallar tabi — mustaqil (o'z holati + CRUD, api.js orqali)
export default function FilialsTab() {
  const [filials, setFilials] = useState([]);
  const [filialForm, setFilialForm] = useState(emptyFilialForm);
  const [editingFilialId, setEditingFilialId] = useState(null);

  const fetchFilials = async () => {
    try { setFilials(await api.get("/api/filials/all", true)); } catch {}
  };
  useEffect(() => { fetchFilials(); /* eslint-disable-next-line */ }, []);

  const resetFilialForm = () => { setFilialForm(emptyFilialForm); setEditingFilialId(null); };

  const saveFilial = async (e) => {
    e?.preventDefault?.();
    if (!filialForm.name.trim()) { alert("Filial nomini kiriting!"); return; }
    const payload = {
      name: filialForm.name.trim(),
      address: filialForm.address.trim(),
      lat: filialForm.lat === "" ? "" : Number(filialForm.lat),
      lng: filialForm.lng === "" ? "" : Number(filialForm.lng),
      isActive: filialForm.isActive,
    };
    try {
      if (editingFilialId) await api.put(`/api/filials/${editingFilialId}`, payload, true);
      else await api.post("/api/filials", payload, true);
      resetFilialForm(); fetchFilials();
    } catch (err) { alert(err.message || "Xatolik!"); }
  };

  const editFilial = (f) => {
    setEditingFilialId(f._id);
    setFilialForm({ name: f.name || "", address: f.address || "", lat: f.lat ?? "", lng: f.lng ?? "", isActive: f.isActive !== false });
  };

  const toggleFilial = async (f) => {
    try { await api.patch(`/api/filials/${f._id}/toggle`, { isActive: f.isActive === false }, true); fetchFilials(); } catch {}
  };

  const deleteFilial = async (f) => {
    if (!window.confirm(`"${f.name}" filialini o'chirasizmi?`)) return;
    try { await api.del(`/api/filials/${f._id}`, true); if (editingFilialId === f._id) resetFilialForm(); fetchFilials(); } catch {}
  };

  return (
    <div className="admin-section">
      <h2 className="section-title">🏢 {editingFilialId ? "Filialni tahrirlash" : "Yangi filial qo'shish"}</h2>
      <form className="banner-form" onSubmit={saveFilial}>
        <div className="input-group">
          <label>Filial nomi *</label>
          <input type="text" value={filialForm.name}
            onChange={e => setFilialForm({ ...filialForm, name: e.target.value })}
            placeholder="Masalan: Yalpiz — Chilonzor" required />
        </div>
        <div className="input-group">
          <label>Manzil</label>
          <input type="text" value={filialForm.address}
            onChange={e => setFilialForm({ ...filialForm, address: e.target.value })}
            placeholder="Ko'cha, uy, shahar" />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="input-group" style={{ flex: 1 }}>
            <label>Lat (kenglik)</label>
            <input type="number" step="any" value={filialForm.lat}
              onChange={e => setFilialForm({ ...filialForm, lat: e.target.value })}
              placeholder="41.261532" />
          </div>
          <div className="input-group" style={{ flex: 1 }}>
            <label>Lng (uzunlik)</label>
            <input type="number" step="any" value={filialForm.lng}
              onChange={e => setFilialForm({ ...filialForm, lng: e.target.value })}
              placeholder="69.228442" />
          </div>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--gray)", marginTop: -4 }}>
          📍 Koordinatani Yandex/Google xaritadan oling — taxi narxi shunga bog'liq.
        </p>
        <label className="availability-editor" style={{ cursor: "pointer" }}>
          <div>
            <strong>{filialForm.isActive ? "✅ Ochiq (mijozga ko'rinadi)" : "⏸ Vaqtincha yopiq"}</strong>
            <p>Yopiq filial mijozga ko'rinadi, lekin tanlab bo'lmaydi</p>
          </div>
          <label className="availability-switch">
            <input type="checkbox" checked={filialForm.isActive}
              onChange={e => setFilialForm({ ...filialForm, isActive: e.target.checked })} />
            <span></span>
          </label>
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn-save">{editingFilialId ? "💾 Saqlash" : "➕ Qo'shish"}</button>
          {editingFilialId && (
            <button type="button" className="btn-cancel" onClick={resetFilialForm}>Bekor qilish</button>
          )}
        </div>
      </form>

      <h2 className="section-title" style={{ marginTop: 24 }}>📋 Filiallar ({filials.length})</h2>
      <div className="admins-list">
        {filials.length === 0 && <p style={{ color: "var(--gray)" }}>Filiallar yo'q.</p>}
        {filials.map(f => (
          <div key={f._id} className="admin-row" style={{ opacity: f.isActive === false ? 0.65 : 1 }}>
            <div className="admin-avatar">🏢</div>
            <div style={{ flex: 1 }}>
              <p className="admin-row-name">
                {f.name} {f.isActive === false && <span style={{ color: "#b91c1c", fontWeight: 700 }}>— ⏸ Yopiq</span>}
              </p>
              <p className="admin-row-role">
                {f.address || "Manzil yo'q"}{(f.lat && f.lng) ? ` · ${f.lat}, ${f.lng}` : " · 📍 koordinata yo'q"}
              </p>
            </div>
            <div className="food-admin-btns">
              <button className={f.isActive === false ? "btn-available" : "btn-unavailable"} onClick={() => toggleFilial(f)}>
                {f.isActive === false ? "✅ Ochish" : "⏸ Yopish"}
              </button>
              <button className="btn-edit" onClick={() => editFilial(f)}>✏️</button>
              <button className="btn-delete" onClick={() => deleteFilial(f)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
