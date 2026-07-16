const {
  translateToUzAndEn,
} = require("./translationService");

const USER_TEXT_KEYS = new Set([
  "name",
  "title",
  "label",
  "description",
  "desc",
  "comment",
  "caption",
  "displayName",
  "shortName",
  "groupName",
  "modifierName",
  "productName",
  "categoryName",
  "hint",
  "placeholder",
]);

const cleanText = (value) => String(value || "").trim();

const getSourceText = (value) => {
  if (typeof value === "string" || typeof value === "number") {
    return cleanText(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  return cleanText(
    value.ru ||
      value.ru_RU ||
      value.ruRu ||
      value.uz ||
      value.uz_UZ ||
      value.en ||
      value.en_US ||
      value.value ||
      value.name ||
      value.title ||
      ""
  );
};

const manualFlagName = (field, language) => {
  const suffix = language === "uz" ? "Uz" : "En";
  return `${field}${suffix}`;
};

const resolveMainTranslation = ({
  field,
  language,
  source,
  existingFood,
  translationMap,
}) => {
  const currentField = existingFood?.[field] || {};
  const currentSource = getSourceText(currentField);
  const currentTranslation = cleanText(currentField?.[language]);

  const isManual =
    existingFood?.translationManual?.[
      manualFlagName(field, language)
    ] === true;

  if (isManual && currentTranslation) {
    return currentTranslation;
  }

  if (
    currentSource === source &&
    currentTranslation &&
    currentTranslation !== source
  ) {
    return currentTranslation;
  }

  return (
    translationMap.get(source) ||
    currentTranslation ||
    source
  );
};

const localizeMainField = ({
  field,
  incomingValue,
  existingFood,
  uzTranslations,
  enTranslations,
}) => {
  const source = getSourceText(incomingValue);

  if (!source) {
    return {
      ru: "",
      uz: "",
      en: "",
    };
  }

  return {
    ru: source,
    uz: resolveMainTranslation({
      field,
      language: "uz",
      source,
      existingFood,
      translationMap: uzTranslations,
    }),
    en: resolveMainTranslation({
      field,
      language: "en",
      source,
      existingFood,
      translationMap: enTranslations,
    }),
  };
};

const collectNestedTexts = (value, collection) => {
  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectNestedTexts(item, collection)
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (USER_TEXT_KEYS.has(key)) {
      const source = getSourceText(child);
      if (source) collection.add(source);
    }

    if (child && typeof child === "object") {
      collectNestedTexts(child, collection);
    }
  }
};

const translateNestedValue = (
  value,
  uzTranslations,
  enTranslations
) => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      translateNestedValue(
        item,
        uzTranslations,
        enTranslations
      )
    );
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const translated = {};

  for (const [key, child] of Object.entries(value)) {
    if (USER_TEXT_KEYS.has(key)) {
      const source = getSourceText(child);

      if (source) {
        translated[key] = {
          ru: source,
          uz: uzTranslations.get(source) || source,
          en: enTranslations.get(source) || source,
        };
        continue;
      }
    }

    translated[key] = translateNestedValue(
      child,
      uzTranslations,
      enTranslations
    );
  }

  return translated;
};

const translateDeleverProducts = async (
  products,
  existingFoodMap = new Map()
) => {
  const textCollection = new Set();

  for (const product of products) {
    const title = getSourceText(product.title);
    const category = getSourceText(product.category);
    const description = getSourceText(product.description);

    if (title) textCollection.add(title);
    if (category) textCollection.add(category);
    if (description) textCollection.add(description);

    collectNestedTexts(
      product.modifierGroups,
      textCollection
    );
  }

  let uzTranslations = new Map();
  let enTranslations = new Map();

  let summary = {
    uniqueTexts: textCollection.size,
    uzTranslated: 0,
    enTranslated: 0,
    skipped: true,
    reason: "translation_not_started",
    error: "",
  };

  try {
    const translation = await translateToUzAndEn(
      [...textCollection],
      {
        sourceLanguage:
          process.env.TRANSLATE_SOURCE_LANGUAGE || "ru",
      }
    );

    uzTranslations = translation.uz;
    enTranslations = translation.en;

    summary = {
      ...translation.summary,
      error: "",
    };
  } catch (error) {
    summary = {
      ...summary,
      skipped: true,
      reason: "translation_error",
      error: String(
        error.message || "Tarjima xatosi"
      ).slice(0, 1000),
    };
  }

  const translatedProducts = products.map((product) => {
    const existingFood = existingFoodMap.get(
      String(product.deleverId)
    );

    return {
      ...product,
      title: localizeMainField({
        field: "title",
        incomingValue: product.title,
        existingFood,
        uzTranslations,
        enTranslations,
      }),
      category: localizeMainField({
        field: "category",
        incomingValue: product.category,
        existingFood,
        uzTranslations,
        enTranslations,
      }),
      description: localizeMainField({
        field: "description",
        incomingValue: product.description,
        existingFood,
        uzTranslations,
        enTranslations,
      }),
      translatedModifierGroups: translateNestedValue(
        product.modifierGroups,
        uzTranslations,
        enTranslations
      ),
    };
  });

  return {
    products: translatedProducts,
    summary,
  };
};

module.exports = {
  translateDeleverProducts,
};
