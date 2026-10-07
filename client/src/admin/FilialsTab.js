import { useEffect, useState } from "react";
import { api } from "../api";
import { AppIcon } from "../icons";

const emptyFilialForm = {
  name: "", address: "", lat: "", lng: "", isActive: true,
  useSchedule: false, openTime: "09:00", closeTime: "23:00",
};

// Filiallar tabi — mustaqil (o'z holati + CRUD, api.js orqali)
export default function FilialsTab() {
  const [filials, setFilials] = useState([]);
  const [filialForm, setFilialForm] = useState(emptyFilialForm);
  const [editingFilialId, setEditingFilialId] = useState(null);

  const fetchFilials = async () => {
    try { setFilials(await api.get("/api/filials/all", true)); } catch {}
  };
  useEffect(() => {
    fetchFilials();
    // Ro'yxatdagi "Hozir: Ochiq/Yopiq" holatini har daqiqada yangilab turadi
    const iv = setInterval(fetchFilials, 60 * 1000);
    return () => clearInterval(iv);
    /* eslint-disable-next-line */
  }, []);

  const resetFilialForm = () => { setFilialForm(emptyFilialForm); setEditingFilialId(null); };

  const saveFilial = async (e) => {
    e?.preventDefault?.();
    if (!filialForm.name.trim()) { alert("Filial nomini kiriting!"); return; }
    if (filialForm.useSchedule && (!filialForm.openTime || !filialForm.closeTime)) {
      alert("Ish vaqti jadvali uchun ochilish va yopilish vaqtini kiriting!");
      return;
    }
    const payload = {
      name: filialForm.name.trim(),
      address: filialForm.address.trim(),
      lat: filialForm.lat === "" ? "" : Number(filialForm.lat),
      lng: filialForm.lng === "" ? "" : Number(filialForm.lng),
      isActive: filialForm.isActive,
      useSchedule: filialForm.useSchedule,
      openTime: filialForm.openTime,
      closeTime: filialForm.closeTime,
    };
    try {
      if (editingFilialId) await api.put(`/api/filials/${editingFilialId}`, payload, true);
      else await api.post("/api/filials", payload, true);
      resetFilialForm(); fetchFilials();
    } catch (err) { alert(err.message || "Xatolik!"); }
  };

  const editFilial = (f) => {
    setEditingFilialId(f._id);
    setFilialForm({
      name: f.name || "", address: f.address || "", lat: f.lat ?? "", lng: f.lng ?? "",
      isActive: f.isActive !== false,
      useSchedule: !!f.useSchedule,
      openTime: f.openTime || "09:00",
      closeTime: f.closeTime || "23:00",
    });
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
      <h2 className="section-title"><AppIcon name="building" size={18} /> {editingFilialId ? "Filialni tahrirlash" : "Yangi filial qo'shish"}</h2>
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
          <AppIcon name="location" size={14} /> Koordinatani Yandex/Google xaritadan oling — taxi narxi shunga bog'liq.
        </p>

        <label className="availability-editor" style={{ cursor: "pointer" }}>
          <div>
            <strong>{filialForm.isActive ? <><AppIcon name="checkCircle" size={15} /> Ochiq (mijozga ko'rinadi)</> : <><AppIcon name="ban" size={15} /> Vaqtincha yopiq</>}</strong>
            <p>Qo'lda yopilgan filial mijozga ko'rinadi, lekin tanlab bo'lmaydi</p>
          </div>
          <label className="availability-switch">
            <input type="checkbox" checked={filialForm.isActive}
              onChange={e => setFilialForm({ ...filialForm, isActive: e.target.checked })} />
            <span></span>
          </label>
        </label>

        <label className="availability-editor" style={{ cursor: "pointer" }}>
          <div>
            <strong><AppIcon name="clock" size={15} /> Ish vaqti jadvali</strong>
            <p>Yoqilsa, filial faqat belgilangan soatlarda avtomatik "ochiq" bo'ladi</p>
          </div>
          <label className="availability-switch">
            <input type="checkbox" checked={filialForm.useSchedule}
              onChange={e => setFilialForm({ ...filialForm, useSchedule: e.target.checked })} />
            <span></span>
          </label>
        </label>

        {filialForm.useSchedule && (
          <div style={{ display: "flex", gap: 12 }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label>Ochilish vaqti *</label>
              <input type="time" value={filialForm.openTime}
                onChange={e => setFilialForm({ ...filialForm, openTime: e.target.value })} required />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label>Yopilish vaqti *</label>
              <input type="time" value={filialForm.closeTime}
                onChange={e => setFilialForm({ ...filialForm, closeTime: e.target.value })} required />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn-save">{editingFilialId ? <><AppIcon name="save" size={16} /> Saqlash</> : <><AppIcon name="plus" size={16} /> Qo'shish</>}</button>
          {editingFilialId && (
            <button type="button" className="btn-cancel" onClick={resetFilialForm}>Bekor qilish</button>
          )}
        </div>
      </form>

      <h2 className="section-title" style={{ marginTop: 24 }}><AppIcon name="list" size={18} /> Filiallar ({filials.length})</h2>
      <div className="admins-list">
        {filials.length === 0 && <p style={{ color: "var(--gray)" }}>Filiallar yo'q.</p>}
        {filials.map(f => {
          const closedManually = f.isActive === false;
          const isOpenNow = f.isOpenNow !== false;
          return (
          <div key={f._id} className="admin-row" style={{ opacity: closedManually ? 0.65 : 1 }}>
            <div className="admin-avatar"><AppIcon name="building" size={20} /></div>
            <div style={{ flex: 1 }}>
              <p className="admin-row-name">
                {f.name}{" "}
                {isOpenNow ? (
                  <span style={{ color: "#16a34a", fontWeight: 700 }}><AppIcon name="checkCircle" size={13} /> Hozir ochiq</span>
                ) : (
                  <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                    <AppIcon name="ban" size={13} /> {closedManually ? "Qo'lda yopilgan" : "Hozir yopiq (ish vaqti tashqarisida)"}
                  </span>
                )}
              </p>
              <p className="admin-row-role">
                {f.address || "Manzil yo'q"}{(f.lat && f.lng) ? ` · ${f.lat}, ${f.lng}` : " · koordinata yo'q"}
                {f.useSchedule && f.openTime && f.closeTime && <> · <AppIcon name="clock" size={12} /> Ish vaqti: {f.openTime}–{f.closeTime}</>}
              </p>
            </div>
            <div className="food-admin-btns">
              <button className={closedManually ? "btn-available" : "btn-unavailable"} onClick={() => toggleFilial(f)}>
                {closedManually ? <><AppIcon name="checkCircle" size={15} /> Ochish</> : <><AppIcon name="ban" size={15} /> Yopish</>}
              </button>
              <button className="btn-edit" onClick={() => editFilial(f)}><AppIcon name="edit" size={16} /></button>
              <button className="btn-delete" onClick={() => deleteFilial(f)}><AppIcon name="trash" size={16} /></button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
