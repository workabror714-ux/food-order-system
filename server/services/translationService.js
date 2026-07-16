const GOOGLE_TRANSLATE_URL =
  "https://translation.googleapis.com/language/translate/v2";

const cleanText = (value) => String(value || "").trim();

const envBoolean = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
};

const getTranslationConfig = () => ({
  enabled: envBoolean("AUTO_TRANSLATE_ENABLED", false),
  apiKey: cleanText(process.env.GOOGLE_TRANSLATE_API_KEY),
  sourceLanguage: cleanText(
    process.env.TRANSLATE_SOURCE_LANGUAGE || "ru"
  ),
  batchSize: Math.min(
    100,
    Math.max(1, Number(process.env.TRANSLATE_BATCH_SIZE) || 100)
  ),
  timeoutMs: Math.max(
    5000,
    Number(process.env.TRANSLATE_TIMEOUT_MS) || 30000
  ),
});

const decodeHtmlEntities = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const uniqueTexts = (values) => [
  ...new Set((values || []).map(cleanText).filter(Boolean)),
];

const chunkArray = (values, size) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const identityMap = (texts) =>
  new Map(texts.map((text) => [text, text]));

const translateTexts = async (
  values,
  targetLanguage,
  options = {}
) => {
  const config = getTranslationConfig();
  const texts = uniqueTexts(values);
  const translations = identityMap(texts);

  if (!texts.length) {
    return {
      translations,
      translatedCount: 0,
      skipped: true,
      reason: "no_texts",
    };
  }

  const sourceLanguage =
    cleanText(options.sourceLanguage) || config.sourceLanguage;
  const target = cleanText(targetLanguage);

  if (!target) {
    throw new Error("Tarjima qilinadigan til berilmagan");
  }

  if (sourceLanguage === target) {
    return {
      translations,
      translatedCount: 0,
      skipped: true,
      reason: "source_equals_target",
    };
  }

  if (!config.enabled) {
    return {
      translations,
      translatedCount: 0,
      skipped: true,
      reason: "AUTO_TRANSLATE_ENABLED=false",
    };
  }

  if (!config.apiKey) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY kiritilmagan");
  }

  let translatedCount = 0;

  for (const batch of chunkArray(texts, config.batchSize)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const url =
        `${GOOGLE_TRANSLATE_URL}?key=` +
        encodeURIComponent(config.apiKey);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: batch,
          source: sourceLanguage,
          target,
          format: "text",
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let responseData = {};

      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { raw: responseText };
      }

      if (!response.ok) {
        const message =
          responseData?.error?.message ||
          responseData?.message ||
          `Google Translation API xatosi (${response.status})`;

        const error = new Error(message);
        error.status = response.status;
        error.response = responseData;
        throw error;
      }

      const translatedItems = responseData?.data?.translations;

      if (
        !Array.isArray(translatedItems) ||
        translatedItems.length !== batch.length
      ) {
        throw new Error(
          "Google Translation API noto'g'ri javob qaytardi"
        );
      }

      batch.forEach((sourceText, index) => {
        const translatedText = decodeHtmlEntities(
          translatedItems[index]?.translatedText
        ).trim();

        translations.set(sourceText, translatedText || sourceText);
        translatedCount += 1;
      });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Google tarjima so'rovi timeout bo'ldi");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    translations,
    translatedCount,
    skipped: false,
    reason: "",
  };
};

const translateToUzAndEn = async (values, options = {}) => {
  const texts = uniqueTexts(values);

  const [uzResult, enResult] = await Promise.all([
    translateTexts(texts, "uz", options),
    translateTexts(texts, "en", options),
  ]);

  return {
    uz: uzResult.translations,
    en: enResult.translations,
    summary: {
      uniqueTexts: texts.length,
      uzTranslated: uzResult.translatedCount,
      enTranslated: enResult.translatedCount,
      skipped: uzResult.skipped && enResult.skipped,
      reason: uzResult.reason || enResult.reason || "",
    },
  };
};

module.exports = {
  getTranslationConfig,
  translateTexts,
  translateToUzAndEn,
};
