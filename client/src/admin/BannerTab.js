import { useEffect, useState } from "react";
import { api } from "../api";
import { AppIcon } from "../icons";
import { thumb } from "../img";

const defaultBannerForm = { title:"", subtitle:"", description:"", bgColor:"#1a5c30", mediaType:"none", mediaUrl:"", buttonText:"", buttonLink:"", startDate:"", endDate:"", order:0, isActive:true, events:[], promoCategory:"", promoLabel:"Aksiya taomlar" };

// Banner tabi — o'z holati; promoCategory dropdown'i uchun `categories` prop'ini oladi.
export default function BannerTab({ categories, savedUser }) {
  const [banners, setBanners] = useState([]);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [editBanner, setEditBanner] = useState(null);
  const [bannerMediaFile, setBannerMediaFile] = useState(null);
  const [newBannerEvent, setNewBannerEvent] = useState({ label: "", emoji: "🔥" });
  const [bannerForm, setBannerForm] = useState(defaultBannerForm);

  const fetchBanners = async () => {
    try { setBanners(await api.get("/api/banners/all", true)); } catch {}
  };
  useEffect(() => { fetchBanners(); /* eslint-disable-next-line */ }, []);

  const saveBanner = async () => {
    setBannerLoading(true);
    try {
      let mediaUrl = bannerForm.mediaUrl;
      if (bannerMediaFile && bannerForm.mediaType !== "none") {
        const mfd = new FormData();
        mfd.append("image", bannerMediaFile);
        const d = await api.upload("/api/upload", mfd);
        mediaUrl = d.url;
      }
      const fd = new FormData();
      // Server `imageUrl` maydonini kutadi (mediaUrl emas) — bug tuzatildi
      Object.entries({ ...bannerForm, mediaUrl, imageUrl: mediaUrl, events: JSON.stringify(bannerForm.events) }).forEach(([k, v]) => {
        if (v !== null && v !== undefined) fd.append(k, v);
      });
      if (editBanner) await api.upload(`/api/banners/${editBanner}`, fd, "PUT");
      else await api.upload("/api/banners", fd, "POST");
      alert(editBanner ? "Yangilandi!" : "Banner qo'shildi!");
      setShowBannerForm(false); setEditBanner(null); setBannerForm(defaultBannerForm);
      setBannerMediaFile(null); fetchBanners();
    } catch (e) { alert("Xato: " + e.message); }
    finally { setBannerLoading(false); }
  };

  const deleteBanner = async (id) => {
    if (!window.confirm("Bannerni o'chirishni tasdiqlaysizmi?")) return;
    try { await api.del(`/api/banners/${id}`, true); fetchBanners(); } catch {}
  };

  const addBannerEvent = () => {
    if (!newBannerEvent.label.trim()) return;
    setBannerForm(f => ({ ...f, events: [...f.events, { id: Date.now().toString(), ...newBannerEvent }] }));
    setNewBannerEvent({ label: "", emoji: "🔥" });
  };

  return (
    <div>
      {/* Banner ro'yxati */}
      <div className="admin-section">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 className="section-title" style={{marginBottom:0}}><AppIcon name="palette" size={18} /> Bannerlar ({banners.length})</h2>
          {savedUser.role === "superadmin" && (
            <button className="btn-primary" onClick={() => { setEditBanner(null); setBannerForm(defaultBannerForm); setShowBannerForm(true); }}>
              + Yangi banner
            </button>
          )}
        </div>

        {banners.length === 0 ? (
          <div style={{textAlign:"center",padding:"40px 20px",color:"var(--gray)"}}>
            <p>Hali banner yo'q</p>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {banners.map(b => (
              <div key={b._id} style={{border:`2px solid ${b.isActive ? "var(--g3)" : "#fee2e2"}`,borderRadius:16,overflow:"hidden",background:"white"}}>
                <div style={{background:b.bgColor,padding:"16px 18px",position:"relative",overflow:"hidden",minHeight:80,display:"flex",alignItems:"center",gap:12}}>
                  {b.mediaType==="image" && b.mediaUrl && (
                    <img src={thumb(b.mediaUrl, 600)} alt="" loading="lazy" decoding="async"
                      onError={e => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = "1"; e.target.src = b.mediaUrl; } }}
                      style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:0.3}} />
                  )}
                  <div style={{position:"relative",zIndex:1,flex:1}}>
                    <div style={{fontWeight:900,color:"white",fontSize:"1rem"}}>{b.title}</div>
                    <div style={{color:"#a3d45b",fontWeight:700,fontSize:"0.88rem"}}>{b.subtitle}</div>
                    {b.description && <div style={{color:"rgba(255,255,255,0.8)",fontSize:"0.78rem",marginTop:2}}>{b.description}</div>}
                    {b.events?.length > 0 && (
                      <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                        {b.events.map(ev => <span key={ev.id} style={{background:"rgba(255,255,255,0.15)",color:"white",padding:"2px 10px",borderRadius:20,fontSize:"0.75rem"}}>{ev.emoji} {ev.label}</span>)}
                      </div>
                    )}
                  </div>
                  <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                    {b.startDate && <span style={{background:"rgba(0,0,0,0.3)",color:"white",padding:"2px 8px",borderRadius:10,fontSize:"0.7rem",display:"inline-flex",alignItems:"center",gap:4}}><AppIcon name="clock" size={12} /> {new Date(b.startDate).toLocaleDateString()}</span>}
                    {b.endDate && <span style={{background:"rgba(0,0,0,0.3)",color:"white",padding:"2px 8px",borderRadius:10,fontSize:"0.7rem",display:"inline-flex",alignItems:"center",gap:4}}><AppIcon name="clock" size={12} /> {new Date(b.endDate).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div style={{padding:"10px 14px",display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:"0.78rem",color:b.isActive?"var(--g)":"#ef4444",fontWeight:700,flex:1}}>
                    {b.isActive ? <><AppIcon name="checkCircle" size={14} /> Faol</> : <><AppIcon name="ban" size={14} /> Nofaol</>}
                    {b.endDate && new Date(b.endDate) < new Date() ? " (muddati o'tgan)" : ""}
                  </span>
                  <span style={{fontSize:"0.75rem",color:"var(--gray)"}}>Tartib: {b.order}</span>
                  {savedUser.role === "superadmin" && (
                    <>
                      <button className="btn-edit" onClick={() => {
                        setEditBanner(b._id);
                        setBannerForm({
                          title: b.title, subtitle: b.subtitle, description: b.description || "",
                          bgColor: b.bgColor, mediaType: b.mediaType, mediaUrl: b.mediaUrl || "",
                          buttonText: b.buttonText || "", buttonLink: b.buttonLink || "",
                          startDate: b.startDate ? new Date(b.startDate).toISOString().split("T")[0] : "",
                          endDate: b.endDate ? new Date(b.endDate).toISOString().split("T")[0] : "",
                          order: b.order || 0, isActive: b.isActive, events: b.events || [],
                          promoCategory: b.promoCategory || "", promoLabel: b.promoLabel || "Aksiya taomlar",
                        });
                        setShowBannerForm(true);
                      }}><AppIcon name="edit" size={15} /> Tahrirlash</button>
                      <button className="btn-delete" onClick={() => deleteBanner(b._id)}><AppIcon name="trash" size={16} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Banner forma (superadmin) */}
      {showBannerForm && savedUser.role === "superadmin" && (
        <div className="admin-section">
          <h2 className="section-title">{editBanner ? <><AppIcon name="edit" size={17} /> Bannerni tahrirlash</> : <><AppIcon name="plus" size={17} /> Yangi banner</>}</h2>
          <div className="food-form">
            <div className="form-grid">
              <div className="input-group"><label>Sarlavha *</label><input type="text" value={bannerForm.title} onChange={e => setBannerForm(f=>({...f,title:e.target.value}))} /></div>
              <div className="input-group"><label>Kichik sarlavha</label><input type="text" value={bannerForm.subtitle} onChange={e => setBannerForm(f=>({...f,subtitle:e.target.value}))} /></div>
              <div className="input-group"><label>Tavsif</label><input type="text" value={bannerForm.description} onChange={e => setBannerForm(f=>({...f,description:e.target.value}))} /></div>
              <div className="input-group">
                <label>Fon rangi</label>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <input type="color" value={bannerForm.bgColor} onChange={e => setBannerForm(f=>({...f,bgColor:e.target.value}))} style={{width:50,height:38,border:"none",borderRadius:8,cursor:"pointer"}} />
                  <input type="text" value={bannerForm.bgColor} onChange={e => setBannerForm(f=>({...f,bgColor:e.target.value}))} style={{flex:1}} />
                </div>
              </div>
              <div className="input-group"><label>Tugma matni</label><input type="text" placeholder="Batafsil..." value={bannerForm.buttonText} onChange={e => setBannerForm(f=>({...f,buttonText:e.target.value}))} /></div>
            </div>

            <div style={{background:"#fff9e6",borderRadius:14,padding:16,border:"2px solid #fde68a"}}>
              <p style={{fontWeight:800,fontSize:"0.88rem",marginBottom:12,color:"#92400e"}}><AppIcon name="tag" size={15} /> Banner ostida aksiya taomlar</p>
              <div className="form-grid">
                <div className="input-group">
                  <label>Kategoriya (aksiya uchun)</label>
                  <select value={bannerForm.promoCategory} onChange={e => setBannerForm(f=>({...f,promoCategory:e.target.value}))}>
                    <option value="">— Yo'q —</option>
                    {categories.map((cat, i) => {
                      const key = typeof cat==="object" ? cat.uz : cat;
                      return <option key={i} value={key}>{key}</option>;
                    })}
                  </select>
                  <span style={{fontSize:"0.72rem",color:"#92400e"}}>Bu kategoriya taomlar banner ostida chiqadi</span>
                </div>
                <div className="input-group">
                  <label>Aksiya sarlavhasi</label>
                  <input type="text" placeholder="Aksiya taomlar" value={bannerForm.promoLabel} onChange={e => setBannerForm(f=>({...f,promoLabel:e.target.value}))} />
                </div>
              </div>
            </div>

            <div style={{background:"var(--g3)",borderRadius:14,padding:16}}>
              <p style={{fontWeight:700,fontSize:"0.88rem",marginBottom:12}}><AppIcon name="clock" size={15} /> Muddatli aksiya (ixtiyoriy)</p>
              <div className="form-grid">
                <div className="input-group">
                  <label>Boshlanish sanasi</label>
                  <input type="date" value={bannerForm.startDate} onChange={e => setBannerForm(f=>({...f,startDate:e.target.value}))} />
                </div>
                <div className="input-group">
                  <label>Tugash sanasi</label>
                  <input type="date" value={bannerForm.endDate} onChange={e => setBannerForm(f=>({...f,endDate:e.target.value}))} />
                </div>
              </div>
              <p style={{fontSize:"0.75rem",color:"var(--gray)",marginTop:8}}><AppIcon name="warning" size={14} /> Tugash sanasi o'tsa — banner avtomatik yashirinadi</p>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"white",borderRadius:12,border:"2px solid var(--border)"}}>
              <input type="checkbox" id="bannerActive" checked={bannerForm.isActive}
                onChange={e => setBannerForm(f=>({...f,isActive:e.target.checked}))}
                style={{width:18,height:18,cursor:"pointer"}} />
              <label htmlFor="bannerActive" style={{fontWeight:700,cursor:"pointer"}}>Banner faol</label>
            </div>

            <div className="input-group">
              <label>Media turi</label>
              <div style={{display:"flex",gap:10}}>
                {["none","image","video"].map(type => (
                  <button key={type} type="button" className={`cat-chip ${bannerForm.mediaType===type?"selected":""}`}
                    onClick={() => setBannerForm(f=>({...f,mediaType:type}))}>
                    {type==="none"?<><AppIcon name="ban" size={14} /> Yo'q</>:type==="image"?<><AppIcon name="image" size={14} /> Rasm</>:<><AppIcon name="video" size={14} /> Video</>}
                  </button>
                ))}
              </div>
            </div>

            {bannerForm.mediaType !== "none" && (
              <div className="input-group">
                <label>Rasm / Video</label>
                <input type="file" accept={bannerForm.mediaType==="image"?"image/*":"video/*"}
                  onChange={e => setBannerMediaFile(e.target.files[0])} />
                <p className="banner-media-hint">
                  <AppIcon name="warning" size={15} />
                  <span>
                    Tavsiya: <b>16:6</b> nisbat (keng lenta).{" "}
                    {bannerForm.mediaType==="image"
                      ? <>O‘lcham ~<b>1600×600px</b>, format JPG / PNG / WebP, hajmi 1MB dan kam bo‘lsa yaxshi.</>
                      : <>O‘lcham ~<b>1280×480px</b>, format MP4 / WebM, 5–10 soniya, ovozsiz, hajmi 8MB dan kam.</>}
                    {" "}Matn media <b>pastki chap</b> burchakda chiqadi (o‘sha qism qoraytiriladi) — muhim detallarni markaz yoki yuqoriga joylang.
                  </span>
                </p>
                {bannerForm.mediaUrl && (
                  <div style={{marginTop:8}}>
                    {bannerForm.mediaType==="image" ? (
                      <img src={thumb(bannerForm.mediaUrl, 600)} alt="banner" decoding="async"
                        onError={e => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = "1"; e.target.src = bannerForm.mediaUrl; } }}
                        style={{width:"100%",maxHeight:120,objectFit:"cover",borderRadius:10}} />
                    ) : (
                      <video src={bannerForm.mediaUrl} style={{width:"100%",maxHeight:120,borderRadius:10}} controls />
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label style={{fontSize:"0.82rem",fontWeight:700,color:"var(--gray)",display:"block",marginBottom:8}}><AppIcon name="tag" size={14} /> Chip/Event labellar</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
                {bannerForm.events.map(ev => (
                  <span key={ev.id} style={{display:"flex",alignItems:"center",gap:6,background:"var(--g3)",padding:"5px 12px",borderRadius:20,fontSize:"0.85rem"}}>
                    {ev.emoji} {ev.label}
                    <button onClick={() => setBannerForm(f=>({...f,events:f.events.filter(e=>e.id!==ev.id)}))}
                      style={{background:"none",border:"none",cursor:"pointer",color:"#e53e3e",fontSize:14}}><AppIcon name="close" size={14} /></button>
                  </span>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input type="text" placeholder="🔥" value={newBannerEvent.emoji}
                  onChange={e => setNewBannerEvent(n=>({...n,emoji:e.target.value}))} style={{width:70}} />
                <input type="text" placeholder="Chegirma 30%..." value={newBannerEvent.label}
                  onChange={e => setNewBannerEvent(n=>({...n,label:e.target.value}))}
                  onKeyDown={e => e.key==="Enter" && (e.preventDefault(), addBannerEvent())} style={{flex:1}} />
                <button type="button" className="btn-primary" onClick={addBannerEvent}>+ Qo'shish</button>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-primary" onClick={saveBanner} disabled={bannerLoading}>
                {bannerLoading ? "Saqlanmoqda..." : editBanner ? <><AppIcon name="save" size={16} /> Saqlash</> : <><AppIcon name="plus" size={16} /> Qo'shish</>}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowBannerForm(false); setEditBanner(null); }}>
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
