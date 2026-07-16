const asArray = (value) =>
  Array.isArray(value) ? value : [];

const firstDefined = (...values) =>
  values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== ""
  );

const getAtPath = (obj, path) => {
  let current = obj;

  for (const key of path.split(".")) {
    if (
      !current ||
      typeof current !== "object"
    ) {
      return undefined;
    }

    current = current[key];
  }

  return current;
};

const firstArrayAt = (obj, paths) => {
  for (const path of paths) {
    const value = getAtPath(
      obj,
      path
    );

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
};

const cleanText = (value) =>
  String(value || "").trim();

const normalizeLanguage = (value) => {
  const language =
    cleanText(value)
      .toLowerCase()
      .replace("_", "-");

  if (
    language === "uz" ||
    language.startsWith("uz-")
  ) {
    return "uz";
  }

  if (
    language === "ru" ||
    language.startsWith("ru-")
  ) {
    return "ru";
  }

  if (
    language === "en" ||
    language.startsWith("en-")
  ) {
    return "en";
  }

  return "";
};

const localizedText = (
  value,
  fallback = ""
) => {
  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const text =
      cleanText(value);

    return {
      uz: text,
      ru: text,
      en: text,
    };
  }

  const data =
    value &&
    typeof value === "object"
      ? value
      : {};

  const uz = cleanText(
    firstDefined(
      data.uz,
      data.uz_UZ,
      data.uzUz,
      data.nameUz,
      data.titleUz,
      data.descriptionUz,
      data.value,
      data.name,
      data.title,
      data.description,
      fallback
    )
  );

  const ru = cleanText(
    firstDefined(
      data.ru,
      data.ru_RU,
      data.ruRu,
      data.nameRu,
      data.titleRu,
      data.descriptionRu,
      uz
    )
  );

  const en = cleanText(
    firstDefined(
      data.en,
      data.en_US,
      data.enEn,
      data.nameEn,
      data.titleEn,
      data.descriptionEn,
      uz
    )
  );

  return {
    uz,
    ru,
    en,
  };
};

const valueFromTranslationEntry = (
  entry,
  fieldNames
) => {
  if (
    typeof entry === "string" ||
    typeof entry === "number"
  ) {
    return cleanText(entry);
  }

  if (
    !entry ||
    typeof entry !== "object"
  ) {
    return "";
  }

  for (const field of fieldNames) {
    const value =
      entry[field];

    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {
      const text =
        cleanText(value);

      if (text) {
        return text;
      }
    }
  }

  return cleanText(
    firstDefined(
      entry.value,
      entry.text,
      entry.label
    )
  );
};

/*
 * Delever turli integratsiyalarda tarjimalarni turli
 * formatda qaytarishi mumkin. Ushbu helper quyidagilarni
 * qo'llaydi:
 *
 * name: { uz, ru, en }
 * nameUz / nameRu / nameEn
 * name_uz / name_ru / name_en
 * translations: { uz: {...}, ru: {...}, en: {...} }
 * translations: [{ language: "uz", name: "..." }]
 */
const localizedEntityText = (
  entity,
  {
    baseFields,
    fallback = "",
  }
) => {
  const source =
    entity &&
    typeof entity === "object"
      ? entity
      : {};

  const firstBaseValue =
    firstDefined(
      ...baseFields.map(
        (field) =>
          source[field]
      )
    );

  const result =
    localizedText(
      firstBaseValue,
      fallback
    );

  const fieldCandidates = {
    uz: [],
    ru: [],
    en: [],
  };

  for (const field of baseFields) {
    fieldCandidates.uz.push(
      source[`${field}Uz`],
      source[`${field}_uz`],
      source[`${field}UZ`]
    );

    fieldCandidates.ru.push(
      source[`${field}Ru`],
      source[`${field}_ru`],
      source[`${field}RU`]
    );

    fieldCandidates.en.push(
      source[`${field}En`],
      source[`${field}_en`],
      source[`${field}EN`]
    );
  }

  for (
    const language
    of ["uz", "ru", "en"]
  ) {
    const direct =
      cleanText(
        firstDefined(
          ...fieldCandidates[
            language
          ]
        )
      );

    if (direct) {
      result[language] =
        direct;
    }
  }

  const translations =
    firstDefined(
      source.translations,
      source.localizations,
      source.localizedValues,
      source.localized
    );

  if (
    translations &&
    !Array.isArray(
      translations
    ) &&
    typeof translations ===
      "object"
  ) {
    for (
      const language
      of ["uz", "ru", "en"]
    ) {
      const entry =
        firstDefined(
          translations[
            language
          ],
          translations[
            `${language}_${language.toUpperCase()}`
          ],
          translations[
            `${language}-${language.toUpperCase()}`
          ]
        );

      const text =
        valueFromTranslationEntry(
          entry,
          baseFields
        );

      if (text) {
        result[language] =
          text;
      }
    }
  }

  if (
    Array.isArray(
      translations
    )
  ) {
    for (
      const entry
      of translations
    ) {
      const language =
        normalizeLanguage(
          firstDefined(
            entry?.language,
            entry?.lang,
            entry?.locale,
            entry?.code
          )
        );

      if (!language) {
        continue;
      }

      const text =
        valueFromTranslationEntry(
          entry,
          baseFields
        );

      if (text) {
        result[language] =
          text;
      }
    }
  }

  const fallbackText =
    cleanText(
      result.uz ||
      result.ru ||
      result.en ||
      fallback
    );

  return {
    uz:
      cleanText(result.uz) ||
      fallbackText,

    ru:
      cleanText(result.ru) ||
      fallbackText,

    en:
      cleanText(result.en) ||
      fallbackText,
  };
};

const entityId = (item) =>
  cleanText(
    firstDefined(
      item?.id,
      item?.itemId,
      item?.productId,
      item?.dishId,
      item?.guid,
      item?.uuid,
      item?.externalId,
      item?.code
    )
  );

const categoryId = (item) =>
  cleanText(
    firstDefined(
      item?.categoryId,
      item?.menuCategoryId,
      item?.groupId,
      item?.sectionId,
      item?.parentId,
      item?.category?.id,
      item?.group?.id
    )
  );

const numeric = (value) => {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const number = Number(
      value
        .replace(/\s/g, "")
        .replace(",", ".")
        .replace(
          /[^0-9.-]/g,
          ""
        )
    );

    return Number.isFinite(
      number
    )
      ? number
      : null;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return numeric(
      firstDefined(
        value.value,
        value.amount,
        value.price,
        value.current
      )
    );
  }

  return null;
};

const extractPrice = (item) => {
  const direct =
    numeric(
      firstDefined(
        item?.price,
        item?.cost,
        item?.salePrice,
        item?.currentPrice,
        item?.priceValue,
        item?.defaultPrice
      )
    );

  if (direct !== null) {
    return direct;
  }

  for (
    const price
    of asArray(
      item?.prices
    )
  ) {
    const value =
      numeric(
        firstDefined(
          price?.price,
          price?.value,
          price?.amount
        )
      );

    if (value !== null) {
      return value;
    }
  }

  return null;
};

const extractImage = (item) => {
  const direct =
    firstDefined(
      item?.imageUrl,
      item?.image,
      item?.pictureUrl,
      item?.photoUrl,
      item?.picture,
      item?.photo
    );

  if (
    typeof direct === "string"
  ) {
    return cleanText(direct);
  }

  if (
    direct &&
    typeof direct === "object"
  ) {
    const url =
      firstDefined(
        direct.url,
        direct.src,
        direct.original
      );

    if (url) {
      return cleanText(url);
    }
  }

  for (
    const image
    of asArray(
      item?.images
    )
  ) {
    const url =
      typeof image === "string"
        ? image
        : firstDefined(
            image?.url,
            image?.src,
            image?.original
          );

    if (url) {
      return cleanText(url);
    }
  }

  return "";
};

const extractModifierGroups = (
  item
) =>
  asArray(
    firstDefined(
      item?.modifierGroups,
      item?.modifiersGroups,
      item?.modifier_groups,
      item?.groups,
      item?.modifications
    )
  );

const extractSortOrder = (
  item,
  fallback = 0
) =>
  Number(
    firstDefined(
      item?.sortOrder,
      item?.sort,
      item?.order,
      item?.position,
      item?.index,
      fallback
    )
  ) || 0;

const explicitAvailability = (
  item
) => {
  const direct =
    firstDefined(
      item?.isAvailable,
      item?.available,
      item?.is_active,
      item?.active,
      item?.enabled
    );

  if (
    typeof direct === "boolean"
  ) {
    return direct;
  }

  if (
    item?.isDeleted === true ||
    item?.deleted === true ||
    item?.isStop === true ||
    item?.stopped === true
  ) {
    return false;
  }

  const stock =
    numeric(
      firstDefined(
        item?.stock,
        item?.balance,
        item?.quantity,
        item?.remaining
      )
    );

  if (stock !== null) {
    return stock > 0;
  }

  return null;
};

const compositionCollections = (
  payload
) => {
  const categories =
    firstArrayAt(
      payload,
      [
        "categories",
        "itemCategories",
        "menuCategories",
        "groups",
        "sections",

        "data.categories",
        "data.itemCategories",
        "data.menuCategories",
        "data.groups",
        "data.sections",

        "result.categories",
        "result.itemCategories",
        "result.menuCategories",
        "result.groups",
        "result.sections",

        "menu.categories",
        "data.menu.categories",
        "result.menu.categories",
      ]
    );

  const directProducts =
    firstArrayAt(
      payload,
      [
        "items",
        "products",
        "dishes",
        "menuItems",
        "goods",
        "nomenclature",

        "data.items",
        "data.products",
        "data.dishes",
        "data.menuItems",
        "data.goods",
        "data.nomenclature",

        "result.items",
        "result.products",
        "result.dishes",
        "result.menuItems",
        "result.goods",
        "result.nomenclature",

        "menu.items",
        "menu.products",
        "data.menu.items",
        "data.menu.products",
        "result.menu.items",
        "result.menu.products",
      ]
    );

  const nestedProducts = [];

  for (
    const category
    of categories
  ) {
    for (
      const key
      of [
        "items",
        "products",
        "dishes",
        "menuItems",
        "goods",
      ]
    ) {
      for (
        const product
        of asArray(
          category?.[key]
        )
      ) {
        nestedProducts.push({
          ...product,

          categoryId:
            categoryId(product) ||
            entityId(category),
        });
      }
    }
  }

  const dedup =
    new Map();

  for (
    const product
    of [
      ...directProducts,
      ...nestedProducts,
    ]
  ) {
    const id =
      entityId(product);

    if (id) {
      dedup.set(
        id,
        product
      );
    }
  }

  return {
    categories,
    products: [
      ...dedup.values(),
    ],
  };
};

const safeDate = (value) => {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
};

const normalizeComposition = (
  payload,
  restaurantId
) => {
  const {
    categories,
    products,
  } =
    compositionCollections(
      payload || {}
    );

  const categoryMap =
    new Map();

  categories.forEach(
    (
      category,
      index
    ) => {
      const id =
        entityId(category);

      if (!id) {
        return;
      }

      categoryMap.set(
        id,
        {
          id,

          title:
            localizedEntityText(
              category,
              {
                baseFields: [
                  "name",
                  "title",
                  "label",
                ],

                fallback:
                  "Boshqa",
              }
            ),

          sortOrder:
            extractSortOrder(
              category,
              index
            ),
        }
      );
    }
  );

  const normalized = [];
  const skipped = [];

  products.forEach(
    (
      product,
      index
    ) => {
      const id =
        entityId(product);

      const price =
        extractPrice(product);

      if (
        !id ||
        price === null ||
        price < 0
      ) {
        skipped.push({
          id,

          reason:
            !id
              ? "ID topilmadi"
              : "Narx topilmadi",

          raw:
            product,
        });

        return;
      }

      const catId =
        categoryId(product);

      const category =
        categoryMap.get(
          catId
        );

      const title =
        localizedEntityText(
          product,
          {
            baseFields: [
              "name",
              "title",
              "label",
            ],

            fallback:
              `Taom ${id}`,
          }
        );

      const description =
        localizedEntityText(
          product,
          {
            baseFields: [
              "description",
              "desc",
              "comment",
            ],

            fallback: "",
          }
        );

      const categoryTitle =
        category?.title ||
        localizedEntityText(
          {
            name:
              firstDefined(
                product?.categoryName,
                product?.category?.name,
                product?.groupName
              ),

            nameUz:
              firstDefined(
                product?.categoryNameUz,
                product?.category?.nameUz,
                product?.groupNameUz
              ),

            nameRu:
              firstDefined(
                product?.categoryNameRu,
                product?.category?.nameRu,
                product?.groupNameRu
              ),

            nameEn:
              firstDefined(
                product?.categoryNameEn,
                product?.category?.nameEn,
                product?.groupNameEn
              ),
          },
          {
            baseFields: [
              "name",
            ],

            fallback:
              "Boshqa",
          }
        );

      normalized.push({
        deleverId:
          id,

        deleverCategoryId:
          catId,

        deleverRestaurantId:
          restaurantId,

        externalCode:
          cleanText(
            firstDefined(
              product?.code,
              product?.article,
              product?.sku,
              product?.externalCode
            )
          ),

        title,

        category:
          categoryTitle,

        description,

        price,

        image:
          extractImage(
            product
          ),

        isAvailable:
          explicitAvailability(
            product
          ),

        modifierGroups:
          extractModifierGroups(
            product
          ),

        sortOrder:
          Number(
            category?.sortOrder ||
            0
          ) *
            10000 +
          extractSortOrder(
            product,
            index
          ),

        deleverUpdatedAt:
          safeDate(
            firstDefined(
              product?.updatedAt,
              product?.modifiedAt,
              product?.lastChange
            )
          ),

        deleverRaw:
          product,
      });
    }
  );

  const lastChange =
    cleanText(
      firstDefined(
        payload?.lastChange,
        payload?.last_change,
        payload?.updatedAt,

        payload?.data?.lastChange,
        payload?.data?.last_change,
        payload?.data?.updatedAt,

        payload?.result?.lastChange,
        payload?.result?.last_change,
        payload?.result?.updatedAt
      )
    );

  return {
    categories: [
      ...categoryMap.values(),
    ],

    products:
      normalized,

    skipped,

    lastChange,
  };
};

const availabilityCollections = (
  payload
) => ({
  items:
    firstArrayAt(
      payload || {},
      [
        "items",
        "products",
        "dishes",
        "availability",

        "data.items",
        "data.products",
        "data.dishes",
        "data.availability",

        "result.items",
        "result.products",
        "result.dishes",
        "result.availability",
      ]
    ),

  modifiers:
    firstArrayAt(
      payload || {},
      [
        "modifiers",
        "modifierItems",
        "modifications",

        "data.modifiers",
        "data.modifierItems",
        "data.modifications",

        "result.modifiers",
        "result.modifierItems",
        "result.modifications",
      ]
    ),
});

const availabilityValue = (
  entry
) => {
  const bool =
    firstDefined(
      entry?.isAvailable,
      entry?.available,
      entry?.enabled,
      entry?.active
    );

  if (
    typeof bool === "boolean"
  ) {
    return bool;
  }

  if (
    entry?.isStop === true ||
    entry?.stopped === true ||
    entry?.disabled === true
  ) {
    return false;
  }

  const stock =
    numeric(
      firstDefined(
        entry?.stock,
        entry?.balance,
        entry?.quantity,
        entry?.remaining
      )
    );

  if (stock !== null) {
    return stock > 0;
  }

  return false;
};

const availabilityId = (
  entry,
  type
) =>
  cleanText(
    firstDefined(
      type === "modifier"
        ? entry?.modifierId
        : entry?.itemId,

      entry?.productId,
      entry?.id,
      entry?.guid,
      entry?.uuid
    )
  );

module.exports = {
  localizedText,
  localizedEntityText,
  normalizeComposition,
  availabilityCollections,
  availabilityValue,
  availabilityId,
};
