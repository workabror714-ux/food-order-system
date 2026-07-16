import { useMemo, useState } from "react";
import { api, invalidateCache } from "../api";
import {
  compressImage,
  uploadToServer,
  getField,
  sortCategories,
  LANGS,
  LANG_LABELS,
} from "../adminUtils";
import { AppIcon } from "../icons";
import { thumb } from "../img";

const emptyLang = () => ({ uz: "", ru: "", en: "" });

const asCategory = (value, extras = {}) => {
  const localized =
    value && typeof value === "object"
      ? {
          uz: getField(value, "uz"),
          ru: getField(value, "ru"),
          en: getField(value, "en"),
        }
      : {
          uz: String(value || ""),
          ru: String(value || ""),
          en: String(value || ""),
        };

  return {
    ...localized,
    ...extras,
  };
};

export default function FoodsTab({
  foods,
  setFoods,
  categories,
  setCategories,
  refetch,
  savedUser,
}) {
  const isSuperAdmin = savedUser?.role === "superadmin";

  const [activeLang, setActiveLang] = useState("uz");
  const [titles, setTitles] = useState(emptyLang());
  const [descs, setDescs] = useState(emptyLang());
  const [price, setPrice] = useState("");
  const [selectedCat, setSelectedCat] = useState(emptyLang());
  const [catNames, setCatNames] = useState(emptyLang());
  const [showCatInput, setShowCatInput] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editingFood, setEditingFood] = useState(null);
  const [foodLoading, setFoodLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [cleaningLocal, setCleaningLocal] = useState(false);

  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryDraft, setCategoryDraft] = useState(emptyLang());
  const [categorySaving, setCategorySaving] = useState(false);

  const [search, setSearch] = useState("");

  const isDeleverEdit = editingFood?.source === "delever";

  const visibleFoods = useMemo(() => {
    const deleverFoods = foods.filter(
      (food) =>
        food?.source === "delever" &&
        food?.deleverId
    );

    const query = search.trim().toLowerCase();
    if (!query) return deleverFoods;

    return deleverFoods.filter((food) => {
      const haystack = [
        getField(food.title, "uz"),
        getField(food.title, "ru"),
        getField(food.title, "en"),
        getField(food.category, "uz"),
        getField(food.category, "ru"),
        food.deleverId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [foods, search]);

  const resetForm = () => {
    setTitles(emptyLang());
    setDescs(emptyLang());
    setSelectedCat(emptyLang());
    setPrice("");
    setIsAvailable(true);
    setImageFile(null);
    setImagePreview(null);
    setUploadedUrl("");
    setEditId(null);
    setEditingFood(null);
    setActiveLang("uz");
  };

  const addCategory = () => {
    if (!catNames.uz.trim()) {
      alert("O'zbek tilidagi nomi shart!");
      return;
    }

    const newCat = {
      uz: catNames.uz.trim(),
      ru: catNames.ru.trim() || catNames.uz.trim(),
      en: catNames.en.trim() || catNames.uz.trim(),
      source: "local",
    };

    setCategories((prev) => sortCategories([...prev, newCat]));
    setSelectedCat(newCat);
    setCatNames(emptyLang());
    setShowCatInput(false);
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    setUploadedUrl("");
    setImagePreview(null);

    try {
      const compressed = await compressImage(file);
      setImageFile(compressed);
      const reader = new FileReader();
      reader.onload = (readerEvent) => setImagePreview(readerEvent.target.result);
      reader.readAsDataURL(compressed);
    } catch {
      setImageFile(file);
    } finally {
      setCompressing(false);
    }
  };

  const handleUpload = async () => {
    if (!imageFile) {
      alert("Avval rasm tanlang!");
      return;
    }

    setUploading(true);

    try {
      const url = await uploadToServer(imageFile);
      setUploadedUrl(url);
      setImagePreview(url);
      alert("Rasm yuklandi!");
    } catch (error) {
      alert("Yuklash xatosi: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFoodSubmit = async (event) => {
    event.preventDefault();

    if (!isDeleverEdit) {
      alert(
        "Yangi taom Delever/Neon Alisa ichida qo‘shiladi. Keyin sinxronlash tugmasini bosing."
      );
      return;
    }

    if (!titles.uz.trim()) {
      alert("O'zbek tili nomini kiriting!");
      return;
    }

    if (isDeleverEdit) {
      setFoodLoading(true);

      try {
        await api.patch(
          `/api/admin/delever/foods/${editId}/translations`,
          {
            title: {
              uz: titles.uz.trim(),
              en: titles.en.trim(),
            },
            description: {
              uz: descs.uz.trim(),
              en: descs.en.trim(),
            },
          },
          true
        );

        alert("Taom tarjimalari saqlandi!");
        resetForm();
        await refetch();
      } catch (error) {
        alert("Xato: " + error.message);
      } finally {
        setFoodLoading(false);
      }

      return;
    }

    if (!selectedCat.uz) {
      alert("Kategoriya tanlang!");
      return;
    }

    if (!uploadedUrl && !editId) {
      alert(
        "Rasmni serverga yuklang!\n\n1. Fayl tanlang\n2. 'Serverga yuklash' tugmasini bosing"
      );
      return;
    }

    setFoodLoading(true);

    try {
      const body = {
        title_uz: titles.uz,
        title_ru: titles.ru || titles.uz,
        title_en: titles.en || titles.uz,
        price: String(Number(price) || 0),
        category_uz: selectedCat.uz,
        category_ru: selectedCat.ru || selectedCat.uz,
        category_en: selectedCat.en || selectedCat.uz,
        desc_uz: descs.uz,
        desc_ru: descs.ru || descs.uz,
        desc_en: descs.en || descs.uz,
        isAvailable,
      };

      if (uploadedUrl) body.imageUrl = uploadedUrl;

      if (editId) {
        await api.put(`/api/foods/${editId}`, body, true);
      } else {
        await api.post("/api/foods", body, true);
      }

      alert(editId ? "Yangilandi!" : "Qo'shildi!");
      invalidateCache("/api/foods");
      resetForm();
      await refetch();
    } catch (error) {
      alert("Xato: " + error.message);
    } finally {
      setFoodLoading(false);
    }
  };

  const handleDelete = async (food) => {
    if (food.source === "delever") {
      alert("Delever taomini Delever ichidan boshqaring.");
      return;
    }

    if (!window.confirm("O'chirishni tasdiqlaysizmi?")) return;

    try {
      await api.del(`/api/foods/${food._id}`, true);
      setSelectedFood(null);
      await refetch();
    } catch (error) {
      alert(error.message || "O'chirishda xato");
    }
  };

  const toggleFoodAvailability = async (food, event) => {
    event?.stopPropagation?.();

    if (food.source === "delever") {
      alert("Delever taomining mavjudligini Delever stop-list orqali boshqaring.");
      return;
    }

    try {
      const updated = await api.patch(
        `/api/foods/${food._id}/availability`,
        { isAvailable: food.isAvailable === false },
        true
      );

      setFoods((prev) =>
        prev.map((item) => (item._id === updated._id ? updated : item))
      );
      setSelectedFood((prev) =>
        prev && prev._id === updated._id ? updated : prev
      );
    } catch (error) {
      alert(error.message || "Holatni o'zgartirishda xato");
    }
  };

  const handleEdit = (food) => {
    setTitles({
      uz: getField(food.title, "uz"),
      ru: getField(food.title, "ru"),
      en: getField(food.title, "en"),
    });

    setDescs({
      uz: getField(food.description, "uz"),
      ru: getField(food.description, "ru"),
      en: getField(food.description, "en"),
    });

    setSelectedCat(
      asCategory(food.category, {
        deleverCategoryId: food.deleverCategoryId || "",
        source: food.source || "local",
      })
    );

    setPrice(food.price);
    setIsAvailable(food.isAvailable !== false);
    setEditId(food._id);
    setEditingFood(food);
    setUploadedUrl(food.image || "");
    setImagePreview(food.image || null);
    setImageFile(null);
    setSelectedFood(null);
    setActiveLang("uz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const syncDelever = async () => {
    setSyncing(true);
    setSyncMessage("");

    try {
      const response = await api.post(
        "/api/admin/delever/sync-menu",
        { force: true },
        true
      );

      const result = response?.result || {};

      setSyncMessage(
        `✅ Sinxronlandi: ${result.productsReceived || 0} ta olindi, ` +
          `${result.modified || 0} ta yangilandi, ` +
          `${result.upserted || 0} ta yangi, ` +
          `${result.productsWithoutImage || 0} ta rasmsiz item Yalpiz menyusida yashirin.`
      );

      resetForm();
      await refetch();
    } catch (error) {
      setSyncMessage(`❌ ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };


  const deleteLocalFoods = async () => {
    const approved = window.confirm(
      "Oldin admin paneldan qo‘shilgan barcha LOCAL taomlar o‘chiriladi. Delever taomlariga tegilmaydi. Davom etamizmi?"
    );

    if (!approved) {
      return;
    }

    setCleaningLocal(true);
    setSyncMessage("");

    try {
      const response = await api.post(
        "/api/admin/foods/delete-local",
        {
          confirm:
            "DELETE_LOCAL_FOODS",
        },
        true
      );

      invalidateCache();

      setSyncMessage(
        `✅ ${response.deletedCount || 0} ta lokal taom o‘chirildi. Endi faqat Delever menyusi ishlaydi.`
      );

      resetForm();
      await refetch();
    } catch (error) {
      setSyncMessage(
        `❌ ${error.message}`
      );
    } finally {
      setCleaningLocal(false);
    }
  };

  const startCategoryEdit = (category) => {
    setEditingCategory(category);
    setCategoryDraft({
      uz: getField(category, "uz"),
      ru: getField(category, "ru"),
      en: getField(category, "en"),
    });
  };

  const saveCategoryTranslations = async () => {
    const categoryId = editingCategory?.deleverCategoryId;

    if (!categoryId) {
      alert("Bu kategoriya Delever ID ga ega emas.");
      return;
    }

    if (!categoryDraft.uz.trim()) {
      alert("O'zbekcha kategoriya nomini kiriting.");
      return;
    }

    setCategorySaving(true);

    try {
      await api.patch(
        `/api/admin/delever/categories/${encodeURIComponent(
          categoryId
        )}/translations`,
        {
          category: {
            uz: categoryDraft.uz.trim(),
            en: categoryDraft.en.trim(),
          },
        },
        true
      );

      alert("Kategoriya tarjimasi saqlandi!");
      setEditingCategory(null);
      setCategoryDraft(emptyLang());
      await refetch();
    } catch (error) {
      alert("Xato: " + error.message);
    } finally {
      setCategorySaving(false);
    }
  };

  return (
    <>
      {isSuperAdmin && (
        <div className="admin-section delever-tools-panel">
          <div className="delever-tools-head">
            <div>
              <h2 className="section-title">
                <AppIcon name="refresh" size={18} /> Delever boshqaruvi
              </h2>
              <p className="delever-tools-note">
                Rasm, narx, ruscha nom va stop-list Deleverdan olinadi. O‘zbekcha
                va inglizcha tarjimalar shu admin panelda saqlanadi.
              </p>
            </div>

            <div className="delever-tools-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={syncDelever}
                disabled={syncing}
              >
                <AppIcon name="refresh" size={16} />
                {syncing ? "Sinxronlanmoqda..." : "Delever bilan sinxronlash"}
              </button>

              <button
                type="button"
                className="btn-delete"
                style={{
                  flex: "none",
                  padding: "11px 20px",
                }}
                onClick={deleteLocalFoods}
                disabled={cleaningLocal}
              >
                <AppIcon name="trash" size={16} />
                {cleaningLocal
                  ? "Tozalanmoqda..."
                  : "Lokal taomlarni o‘chirish"}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCategoryManager((value) => !value)}
              >
                <AppIcon name="edit" size={16} />
                Kategoriyalarni tahrirlash
              </button>
            </div>
          </div>

          {syncMessage && <div className="sync-result-box">{syncMessage}</div>}

          {showCategoryManager && (
            <div className="category-manager">
              <h3>Kategoriyalar tarjimasi</h3>
              <p>
                Ruscha nom Deleverdan keladi. O‘zbekcha va inglizcha nomlarni shu
                yerda kiriting.
              </p>

              <div className="category-manager-grid">
                {categories
                  .filter((category) => category.deleverCategoryId)
                  .map((category) => (
                    <div
                      key={category.deleverCategoryId}
                      className="category-manager-card"
                    >
                      <div>
                        <span className="category-language-label">RU</span>
                        <strong>{getField(category, "ru") || "—"}</strong>
                      </div>
                      <div>
                        <span className="category-language-label">UZ</span>
                        <strong>{getField(category, "uz") || "—"}</strong>
                      </div>
                      <div>
                        <span className="category-language-label">EN</span>
                        <strong>{getField(category, "en") || "—"}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn-edit"
                        onClick={() => startCategoryEdit(category)}
                      >
                        <AppIcon name="edit" size={14} /> Tahrirlash
                      </button>
                    </div>
                  ))}
              </div>

              {editingCategory && (
                <div className="category-edit-form">
                  <h4>
                    Kategoriya: {getField(editingCategory, "ru") || "—"}
                  </h4>

                  <div className="form-grid">
                    <div className="input-group">
                      <label>Ruscha — Deleverdan</label>
                      <input value={categoryDraft.ru} readOnly disabled />
                    </div>
                    <div className="input-group">
                      <label>O‘zbekcha *</label>
                      <input
                        value={categoryDraft.uz}
                        onChange={(event) =>
                          setCategoryDraft((value) => ({
                            ...value,
                            uz: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="input-group">
                      <label>Inglizcha</label>
                      <input
                        value={categoryDraft.en}
                        onChange={(event) =>
                          setCategoryDraft((value) => ({
                            ...value,
                            en: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={saveCategoryTranslations}
                      disabled={categorySaving}
                    >
                      <AppIcon name="save" size={15} />
                      {categorySaving ? "Saqlanmoqda..." : "Saqlash"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setEditingCategory(null)}
                    >
                      Bekor qilish
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="admin-section">
        <h2 className="section-title">
          {editId ? (
            <>
              <AppIcon name="edit" size={17} />
              {isDeleverEdit ? "Taom tarjimasini tahrirlash" : "Taomni tahrirlash"}
            </>
          ) : (
            <>
              <AppIcon name="plus" size={17} /> Yangi taom qo'shish
            </>
          )}
        </h2>

        {isDeleverEdit && (
          <div className="delever-edit-warning">
            <strong>Delever taomi</strong>
            <span>
              Ruscha nom, narx, rasm va mavjudlik Deleverdan boshqariladi. Bu
              formada o‘zbekcha va inglizcha nom hamda tavsifni tahrirlaysiz.
            </span>
          </div>
        )}

        <form onSubmit={handleFoodSubmit} className="food-form">
          <div className="language-tabs">
            {LANGS.map((language) => (
              <button
                key={language}
                type="button"
                className={`cat-chip ${
                  activeLang === language ? "selected" : ""
                }`}
                onClick={() => setActiveLang(language)}
              >
                {LANG_LABELS[language]}
              </button>
            ))}
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>
                Nomi — {LANG_LABELS[activeLang]} {activeLang === "uz" && "*"}
              </label>
              <input
                type="text"
                placeholder={
                  activeLang === "uz"
                    ? "Masalan: Osh"
                    : activeLang === "ru"
                    ? "Например: Плов"
                    : "e.g. Pilaf"
                }
                value={titles[activeLang]}
                onChange={(event) =>
                  setTitles((value) => ({
                    ...value,
                    [activeLang]: event.target.value,
                  }))
                }
                required={activeLang === "uz"}
                readOnly={isDeleverEdit && activeLang === "ru"}
                disabled={isDeleverEdit && activeLang === "ru"}
              />
            </div>

            <div className="input-group">
              <label>Narxi (so'm) *</label>
              <input
                type="number"
                placeholder="35000"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required={!isDeleverEdit}
                readOnly={isDeleverEdit}
                disabled={isDeleverEdit}
              />
            </div>
          </div>

          <div className="input-group">
            <label>Tavsif — {LANG_LABELS[activeLang]}</label>
            <textarea
              rows={3}
              placeholder={
                activeLang === "uz"
                  ? "Taom haqida..."
                  : activeLang === "ru"
                  ? "Описание..."
                  : "Description..."
              }
              value={descs[activeLang]}
              onChange={(event) =>
                setDescs((value) => ({
                  ...value,
                  [activeLang]: event.target.value,
                }))
              }
              readOnly={isDeleverEdit && activeLang === "ru"}
              disabled={isDeleverEdit && activeLang === "ru"}
            />
          </div>

          {!isDeleverEdit && (
            <div className="availability-editor">
              <div>
                <strong>
                  {isAvailable ? (
                    <>
                      <AppIcon name="checkCircle" size={15} /> Taom mavjud
                    </>
                  ) : (
                    <>
                      <AppIcon name="ban" size={15} /> Hozircha yo‘q
                    </>
                  )}
                </strong>
                <p>O‘chirib qo‘yilsa, mijoz savatga qo‘sha olmaydi.</p>
              </div>
              <label className="availability-switch">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(event) => setIsAvailable(event.target.checked)}
                />
                <span></span>
              </label>
            </div>
          )}

          <div className="input-group">
            <label>Kategoriya *</label>

            {isDeleverEdit ? (
              <div className="readonly-source-box">
                <strong>{getField(selectedCat, "uz") || "—"}</strong>
                <span>{getField(selectedCat, "ru") || ""}</span>
                <small>
                  Kategoriya tarjimasini yuqoridagi “Kategoriyalarni tahrirlash”
                  bo‘limidan o‘zgartiring.
                </small>
              </div>
            ) : (
              <div className="cat-select-wrap">
                <div className="cat-chips">
                  {categories.map((category, index) => (
                    <button
                      key={category.deleverCategoryId || index}
                      type="button"
                      className={`cat-chip ${
                        selectedCat.uz === getField(category, "uz")
                          ? "selected"
                          : ""
                      }`}
                      onClick={() => setSelectedCat(asCategory(category))}
                    >
                      {getField(category, activeLang) || getField(category, "uz")}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="cat-chip add-cat-btn"
                    onClick={() => setShowCatInput((value) => !value)}
                  >
                    + Yangi kategoriya
                  </button>
                </div>

                {showCatInput && (
                  <div className="new-category-box">
                    <p>Yangi kategoriya — 3 tilda</p>
                    {LANGS.map((language) => (
                      <div
                        key={language}
                        className="input-group"
                        style={{ marginBottom: 8 }}
                      >
                        <label>
                          {LANG_LABELS[language]} {language === "uz" && "*"}
                        </label>
                        <input
                          type="text"
                          placeholder={
                            language === "uz"
                              ? "Salatlar"
                              : language === "ru"
                              ? "Салаты"
                              : "Salads"
                          }
                          value={catNames[language]}
                          onChange={(event) =>
                            setCatNames((value) => ({
                              ...value,
                              [language]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={addCategory}
                      >
                        <AppIcon name="check" size={15} /> Qo'shish
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowCatInput(false)}
                      >
                        Bekor
                      </button>
                    </div>
                  </div>
                )}

                {selectedCat.uz && (
                  <p className="selected-cat-label">
                    <AppIcon name="check" size={14} /> {selectedCat.uz}
                    {selectedCat.ru && selectedCat.ru !== selectedCat.uz
                      ? ` / ${selectedCat.ru}`
                      : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          {!isDeleverEdit && (
            <div className="input-group">
              <label>Rasm {!editId && "*"}</label>
              <label className="upload-zone">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  hidden
                />
                <span className="upload-zone-icon">
                  <AppIcon name="camera" size={26} />
                </span>
                <span className="upload-zone-text">
                  {imageFile
                    ? imageFile.name
                    : uploadedUrl
                    ? "Rasm yuklandi — almashtirish uchun bosing"
                    : "Rasm tanlash uchun bosing"}
                </span>
              </label>

              {compressing && (
                <p className="form-help-success">Optimallashtirilmoqda...</p>
              )}

              {imageFile && !uploadedUrl && !compressing && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: 10 }}
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    "Yuklanmoqda..."
                  ) : (
                    <>
                      <AppIcon name="cloud" size={16} /> Serverga yuklash
                    </>
                  )}
                </button>
              )}

              {uploadedUrl && (
                <div className="upload-success-box">
                  <span>
                    <AppIcon name="checkCircle" size={14} /> Rasm yuklandi!
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedUrl("");
                      setImagePreview(null);
                      setImageFile(null);
                    }}
                  >
                    <AppIcon name="close" size={18} />
                  </button>
                </div>
              )}

              {!editId && !uploadedUrl && (
                <p className="form-help-danger">
                  <AppIcon name="warning" size={14} /> Fayl tanlang → “Serverga
                  yuklash” tugmasini bosing!
                </p>
              )}

              {imagePreview && (
                <img
                  src={thumb(imagePreview, 500)}
                  alt="preview"
                  decoding="async"
                  onError={(event) => {
                    if (!event.currentTarget.dataset.fb) {
                      event.currentTarget.dataset.fb = "1";
                      event.currentTarget.src = imagePreview;
                    }
                  }}
                  className="food-form-preview"
                />
              )}
            </div>
          )}

          {isDeleverEdit && imagePreview && (
            <div className="input-group">
              <label>Delever rasmi</label>
              <img
                src={thumb(imagePreview, 500)}
                alt="preview"
                className="food-form-preview"
              />
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={foodLoading || compressing || uploading}
            >
              {foodLoading ? (
                "Saqlanmoqda..."
              ) : editId ? (
                <>
                  <AppIcon name="save" size={16} />
                  {isDeleverEdit ? "Tarjimani saqlash" : "Saqlash"}
                </>
              ) : (
                <>
                  <AppIcon name="plus" size={16} /> Qo'shish
                </>
              )}
            </button>

            {editId && (
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Bekor qilish
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="admin-section">
        <div className="food-list-header">
          <h2 className="section-title">
            <AppIcon name="list" size={18} /> Delever taomlari ({visibleFoods.length})
          </h2>
          <input
            className="admin-search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Taom yoki kategoriya qidirish..."
          />
        </div>

        <div className="food-admin-grid">
          {visibleFoods.map((food) => (
            <div
              key={food._id}
              className={`food-admin-card ${
                food.isAvailable === false ? "unavailable" : ""
              }`}
              onClick={() => setSelectedFood(food)}
            >
              <div className="food-admin-img-wrap">
                <img
                  src={
                    thumb(food.image, 240) ||
                    "https://placehold.co/200x120/e8f5ee/1d6b3e?text=Rasm"
                  }
                  alt={getField(food.title, "uz")}
                  className="food-admin-img"
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.src =
                      "https://placehold.co/200x120/e8f5ee/1d6b3e?text=Rasm";
                  }}
                />
                <span
                  className={`availability-badge ${
                    food.isAvailable === false ? "off" : "on"
                  }`}
                >
                  {food.isAvailable === false ? "Hozircha yo‘q" : "Mavjud"}
                </span>
              </div>

              <div className="food-admin-info">
                <div className="food-source-row">
                  <span className="food-admin-cat">
                    {getField(food.category, "uz")}
                  </span>
                  <span
                    className={`source-badge ${
                      food.source === "delever" ? "delever" : "local"
                    }`}
                  >
                    {food.source === "delever" ? "Delever" : "Local"}
                  </span>
                </div>
                <h4>{getField(food.title, "uz")}</h4>
                <p className="food-admin-price">
                  {food.price?.toLocaleString()} so'm
                </p>
                <p className="food-admin-desc">
                  {getField(food.description, "uz")}
                </p>
                <div className="food-admin-btns" onClick={(event) => event.stopPropagation()}>
                  <button className="btn-edit" onClick={() => handleEdit(food)}>
                    <AppIcon name="edit" size={15} />
                    {food.source === "delever" ? "Tarjima" : "Tahrirlash"}
                  </button>

                  {food.source !== "delever" && (
                    <>
                      <button
                        className={
                          food.isAvailable === false
                            ? "btn-available"
                            : "btn-unavailable"
                        }
                        onClick={(event) => toggleFoodAvailability(food, event)}
                      >
                        {food.isAvailable === false ? (
                          <>
                            <AppIcon name="checkCircle" size={15} /> Sotuvga qaytarish
                          </>
                        ) : (
                          <>
                            <AppIcon name="ban" size={15} /> Sotuvdan olish
                          </>
                        )}
                      </button>
                      <button className="btn-delete" onClick={() => handleDelete(food)}>
                        <AppIcon name="trash" size={15} /> O'chirish
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedFood && (
        <div className="modal-overlay" onClick={() => setSelectedFood(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedFood(null)}>
              <AppIcon name="close" size={20} />
            </button>
            <img
              src={
                thumb(selectedFood.image, 500) ||
                "https://placehold.co/400x200/e8f5ee/1d6b3e?text=Rasm"
              }
              alt={getField(selectedFood.title, "uz")}
              className="modal-img"
              decoding="async"
            />
            <div className="modal-body">
              <div className="food-source-row">
                <span className="food-admin-cat">
                  {getField(selectedFood.category, "uz")}
                </span>
                <span
                  className={`source-badge ${
                    selectedFood.source === "delever" ? "delever" : "local"
                  }`}
                >
                  {selectedFood.source === "delever" ? "Delever" : "Local"}
                </span>
              </div>
              <span
                className={`availability-badge ${
                  selectedFood.isAvailable === false ? "off" : "on"
                }`}
              >
                {selectedFood.isAvailable === false ? "Hozircha yo‘q" : "Mavjud"}
              </span>
              <h2 className="modal-title">
                {getField(selectedFood.title, "uz")}
              </h2>
              <p className="modal-price">
                {selectedFood.price?.toLocaleString()} so'm
              </p>
              <p className="modal-desc">
                {getField(selectedFood.description, "uz")}
              </p>
              <div className="modal-actions">
                <button className="btn-edit" onClick={() => handleEdit(selectedFood)}>
                  <AppIcon name="edit" size={15} />
                  {selectedFood.source === "delever" ? "Tarjima" : "Tahrirlash"}
                </button>

                {selectedFood.source !== "delever" && (
                  <>
                    <button
                      className={
                        selectedFood.isAvailable === false
                          ? "btn-available"
                          : "btn-unavailable"
                      }
                      onClick={(event) => toggleFoodAvailability(selectedFood, event)}
                    >
                      {selectedFood.isAvailable === false ? (
                        <>
                          <AppIcon name="checkCircle" size={15} /> Sotuvga qaytarish
                        </>
                      ) : (
                        <>
                          <AppIcon name="ban" size={15} /> Sotuvdan olish
                        </>
                      )}
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(selectedFood)}
                    >
                      <AppIcon name="trash" size={15} /> O'chirish
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
