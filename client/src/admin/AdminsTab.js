import { useEffect, useState } from "react";
import { api } from "../api";

// Adminlar tabi — to'liq mustaqil (o'z holati, kross-tab bog'liqlik yo'q)
export default function AdminsTab({ savedUser }) {
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [admins, setAdmins] = useState([]);

  const fetchAdmins = async () => {
    if (savedUser.role !== "superadmin") return;
    try { setAdmins(await api.get("/auth/admins", true)); } catch {}
  };
  useEffect(() => { fetchAdmins(); /* eslint-disable-next-line */ }, []);

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/create-admin", { username: newUsername, password: newPassword, role: newRole }, true);
      alert("✅ Admin yaratildi!");
      setNewUsername(""); setNewPassword(""); fetchAdmins();
    } catch (err) { alert(err.message); }
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await api.del(`/auth/admins/${id}`, true); fetchAdmins(); } catch (err) { alert(err.message); }
  };

  return (
    <div className="admin-section">
      <h2 className="section-title">👤 Admin yaratish</h2>
      <form onSubmit={handleCreateAdmin} className="food-form" style={{ maxWidth: 420 }}>
        <div className="input-group"><label>Username *</label><input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required /></div>
        <div className="input-group"><label>Parol *</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></div>
        <div className="input-group"><label>Rol</label>
          <select value={newRole} onChange={e => setNewRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">➕ Admin yaratish</button>
      </form>
      <h2 className="section-title" style={{ marginTop: 32 }}>Adminlar ro'yxati</h2>
      <div className="admins-list">
        {admins.map(adm => (
          <div key={adm._id} className="admin-row">
            <div className="admin-avatar">{adm.username[0].toUpperCase()}</div>
            <div><p className="admin-row-name">{adm.username}</p><p className="admin-row-role">{adm.role}</p></div>
            {adm.username !== savedUser.username && (
              <button className="btn-delete" style={{ marginLeft: "auto", flex: "none" }}
                onClick={() => handleDeleteAdmin(adm._id)}>🗑</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
