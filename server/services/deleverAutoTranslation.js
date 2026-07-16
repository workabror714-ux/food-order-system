const {
  translateTexts,
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

const cleanText = (value) =>
  String(value || "").trim();

const getSourceText = (value) => {
  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return cleanText(value);
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
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

const manualFlagName = (
  field,
  language
) => {
  const suffix =
    language === "uz"
      ? "Uz"
      : "En";

  return `${field}${suffix}`;
};

const needsMainTranslation = ({
  field,
  language,
  source,
  existingFood,
}) => {
  if (!source) return false;

  const currentField =
    existingFood?.[field] || {};

  const currentSource =
    getSourceText(currentField);

  const currentTranslation =
    cleanText(
      currentField?.[language]
    );

  const isManual =
    existingFood
      ?.translationManual?.[
        manualFlagName(
          field,
          language
        )
      ] === true;

  if (
    isManual &&
    currentTranslation
  ) {
    return false;
  }

  if (
    currentSource === source &&
    currentTranslation &&
    currentTranslation !== source
  ) {
    return false;
  }

  return true;
};

const resolveMainTranslation = ({
  field,
  language,
  source,
  existingFood,
  translationMap,
}) => {
  const currentField =
    existingFood?.[field] || {};

  const currentSource =
    getSourceText(currentField);

  const currentTranslation =
    cleanText(
      currentField?.[language]
    );

  const isManual =
    existingFood
      ?.translationManual?.[
        manualFlagName(
          field,
          language
        )
      ] === true;

  if (
    isManual &&
    currentTranslation
  ) {
    return currentTranslation;
  }

  if (
    currentSource === source &&
    currentTranslation &&
    currentTranslation !== source
  ) {
    return currentTranslation;
  }

  const translated = cleanText(
    translationMap.get(source)
  );

  if (translated) {
    return translated;
  }

  if (
    currentSource === source &&
    currentTranslation
  ) {
    return currentTranslation;
  }

  return source;
};

const localizeMainField = ({
  field,
  incomingValue,
  existingFood,
  uzTranslations,
  enTranslations,
}) => {
  const source =
    getSourceText(incomingValue);

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
      translationMap:
        uzTranslations,
    }),

    en: resolveMainTranslation({
      field,
      language: "en",
      source,
      existingFood,
      translationMap:
        enTranslations,
    }),
  };
};

const collectNestedTexts = (
  value,
  collection
) => {
  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectNestedTexts(
        item,
        collection
      )
    );

    return;
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return;
  }

  for (
    const [key, child]
    of Object.entries(value)
  ) {
    if (
      USER_TEXT_KEYS.has(key)
    ) {
      const source =
        getSourceText(child);

      if (source) {
        collection.add(source);
      }
    }

    if (
      child &&
      typeof child === "object"
    ) {
      collectNestedTexts(
        child,
        collection
      );
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

  if (
    !value ||
    typeof value !== "object"
  ) {
    return value;
  }

  const translated = {};

  for (
    const [key, child]
    of Object.entries(value)
  ) {
    if (
      USER_TEXT_KEYS.has(key)
    ) {
      const source =
        getSourceText(child);

      if (source) {
        translated[key] = {
          ru: source,
          uz:
            cleanText(
              uzTranslations.get(
                source
              )
            ) || source,
          en:
            cleanText(
              enTranslations.get(
                source
              )
            ) || source,
        };

        continue;
      }
    }

    translated[key] =
      translateNestedValue(
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
  const uzTextCollection =
    new Set();

  const enTextCollection =
    new Set();

  const nestedTextCollection =
    new Set();

  for (const product of products) {
    const existingFood =
      existingFoodMap.get(
        String(product.deleverId)
      );

    const fields = [
      ["title", product.title],
      ["category", product.category],
      [
        "description",
        product.description,
      ],
    ];

    for (
      const [field, value]
      of fields
    ) {
      const source =
        getSourceText(value);

      if (
        needsMainTranslation({
          field,
          language: "uz",
          source,
          existingFood,
        })
      ) {
        uzTextCollection.add(
          source
        );
      }

      if (
        needsMainTranslation({
          field,
          language: "en",
          source,
          existingFood,
        })
      ) {
        enTextCollection.add(
          source
        );
      }
    }

    collectNestedTexts(
      product.modifierGroups,
      nestedTextCollection
    );
  }

  for (
    const text of nestedTextCollection
  ) {
    uzTextCollection.add(text);
    enTextCollection.add(text);
  }

  const sourceLanguage =
    process.env
      .TRANSLATE_SOURCE_LANGUAGE ||
    "ru";

  const [uzResult, enResult] =
    await Promise.all([
      translateTexts(
        [...uzTextCollection],
        "uz",
        { sourceLanguage }
      ),
      translateTexts(
        [...enTextCollection],
        "en",
        { sourceLanguage }
      ),
    ]);

  const summaryErrors = [
    ...uzResult.errors.map(
      (item) => ({
        language: "uz",
        ...item,
      })
    ),
    ...enResult.errors.map(
      (item) => ({
        language: "en",
        ...item,
      })
    ),
  ].slice(0, 10);

  const translatedProducts =
    products.map((product) => {
      const existingFood =
        existingFoodMap.get(
          String(
            product.deleverId
          )
        );

      return {
        ...product,

        title: localizeMainField({
          field: "title",
          incomingValue:
            product.title,
          existingFood,
          uzTranslations:
            uzResult.translations,
          enTranslations:
            enResult.translations,
        }),

        category:
          localizeMainField({
            field: "category",
            incomingValue:
              product.category,
            existingFood,
            uzTranslations:
              uzResult.translations,
            enTranslations:
              enResult.translations,
          }),

        description:
          localizeMainField({
            field: "description",
            incomingValue:
              product.description,
            existingFood,
            uzTranslations:
              uzResult.translations,
            enTranslations:
              enResult.translations,
          }),

        translatedModifierGroups:
          translateNestedValue(
            product.modifierGroups,
            uzResult.translations,
            enResult.translations
          ),
      };
    });

  return {
    products:
      translatedProducts,

    summary: {
      provider: "mymemory",
      uniqueUzTexts:
        uzTextCollection.size,
      uniqueEnTexts:
        enTextCollection.size,
      uzTranslated:
        uzResult.translatedCount,
      enTranslated:
        enResult.translatedCount,
      uzFailed:
        uzResult.failedCount,
      enFailed:
        enResult.failedCount,
      skipped:
        uzResult.skipped &&
        enResult.skipped,
      reason:
        uzResult.reason ||
        enResult.reason ||
        "",
      error:
        summaryErrors.length
          ? summaryErrors
              .map(
                (item) =>
                  `${item.language}: ${item.message}`
              )
              .join(" | ")
              .slice(0, 1000)
          : "",
      errors: summaryErrors,
    },
  };
};

module.exports = {
  translateDeleverProducts,
};
