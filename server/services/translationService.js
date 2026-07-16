const MYMEMORY_TRANSLATE_URL =
  "https://api.mymemory.translated.net/get";

const cleanText = (value) =>
  String(value || "").trim();

const envBoolean = (
  name,
  fallback = false
) => {
  const value = process.env[name];

  if (
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  return (
    String(value)
      .trim()
      .toLowerCase() === "true"
  );
};

const getTranslationConfig = () => ({
  enabled: envBoolean(
    "AUTO_TRANSLATE_ENABLED",
    false
  ),

  provider: cleanText(
    process.env.TRANSLATE_PROVIDER ||
      "mymemory"
  ).toLowerCase(),

  email: cleanText(
    process.env.MYMEMORY_EMAIL
  ),

  sourceLanguage: cleanText(
    process.env.TRANSLATE_SOURCE_LANGUAGE ||
      "ru"
  ).toLowerCase(),

  timeoutMs: Math.max(
    5000,
    Number(
      process.env.TRANSLATE_TIMEOUT_MS
    ) || 30000
  ),

  concurrency: Math.min(
    8,
    Math.max(
      1,
      Number(
        process.env.TRANSLATE_CONCURRENCY
      ) || 4
    )
  ),

  maxBytes: Math.min(
    490,
    Math.max(
      100,
      Number(
        process.env.MYMEMORY_MAX_BYTES
      ) || 450
    )
  ),

  maxRetries: Math.min(
    4,
    Math.max(
      0,
      Number(
        process.env.MYMEMORY_MAX_RETRIES
      ) || 2
    )
  ),
});

const decodeHtmlEntities = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, code) =>
        String.fromCodePoint(
          parseInt(code, 16)
        )
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const uniqueTexts = (values) => [
  ...new Set(
    (values || [])
      .map(cleanText)
      .filter(Boolean)
  ),
];

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

const utf8Length = (value) =>
  Buffer.byteLength(
    String(value || ""),
    "utf8"
  );

/*
 * MyMemory q parametri 500 baytdan oshmasligi kerak.
 * Uzun tavsiflar gap yoki so'z chegarasidan bo'linadi.
 */
const splitTextByBytes = (
  value,
  maxBytes
) => {
  const text = cleanText(value);

  if (!text) return [];

  if (utf8Length(text) <= maxBytes) {
    return [text];
  }

  const parts = text.match(
    /[^.!?;:\n]+[.!?;:]?|\n+/g
  ) || [text];

  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    const prepared = cleanText(current);

    if (prepared) {
      chunks.push(prepared);
    }

    current = "";
  };

  const appendWord = (word) => {
    const candidate = current
      ? `${current} ${word}`
      : word;

    if (
      utf8Length(candidate) <=
      maxBytes
    ) {
      current = candidate;
      return;
    }

    pushCurrent();

    if (
      utf8Length(word) <= maxBytes
    ) {
      current = word;
      return;
    }

    let piece = "";

    for (const character of word) {
      const next = piece + character;

      if (
        utf8Length(next) > maxBytes
      ) {
        if (piece) chunks.push(piece);
        piece = character;
      } else {
        piece = next;
      }
    }

    if (piece) current = piece;
  };

  for (const part of parts) {
    const normalizedPart = cleanText(part);

    if (!normalizedPart) continue;

    const candidate = current
      ? `${current} ${normalizedPart}`
      : normalizedPart;

    if (
      utf8Length(candidate) <=
      maxBytes
    ) {
      current = candidate;
      continue;
    }

    pushCurrent();

    if (
      utf8Length(normalizedPart) <=
      maxBytes
    ) {
      current = normalizedPart;
      continue;
    }

    for (
      const word of normalizedPart.split(
        /\s+/
      )
    ) {
      appendWord(word);
    }
  }

  pushCurrent();

  return chunks;
};

const getFetch = async () => {
  if (
    typeof globalThis.fetch ===
    "function"
  ) {
    return globalThis.fetch.bind(
      globalThis
    );
  }

  const module = await import(
    "node-fetch"
  );

  return module.default;
};

const translationCache = new Map();

const cacheKey = ({
  sourceLanguage,
  targetLanguage,
  text,
}) =>
  `${sourceLanguage}|${targetLanguage}|${text}`;

const parseMyMemoryResponse = (
  data,
  status
) => {
  const apiStatus = Number(
    data?.responseStatus || status
  );

  const details = cleanText(
    data?.responseDetails ||
      data?.message ||
      data?.error
  );

  const translatedText = cleanText(
    decodeHtmlEntities(
      data?.responseData
        ?.translatedText
    )
  );

  if (
    status >= 400 ||
    apiStatus >= 400 ||
    !translatedText
  ) {
    const error = new Error(
      details ||
        `MyMemory API xatosi (${status})`
    );

    error.status =
      apiStatus || status;
    error.response = data;

    throw error;
  }

  return translatedText;
};

const requestMyMemory = async ({
  text,
  sourceLanguage,
  targetLanguage,
  config,
}) => {
  const fetchImpl = await getFetch();

  const url = new URL(
    MYMEMORY_TRANSLATE_URL
  );

  url.searchParams.set("q", text);
  url.searchParams.set(
    "langpair",
    `${sourceLanguage}|${targetLanguage}`
  );
  url.searchParams.set("mt", "1");

  if (config.email) {
    url.searchParams.set(
      "de",
      config.email
    );
  }

  let lastError = null;

  for (
    let attempt = 0;
    attempt <= config.maxRetries;
    attempt += 1
  ) {
    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      config.timeoutMs
    );

    try {
      const response = await fetchImpl(
        url.toString(),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Damirchi-Food-Order/1.0",
          },
          signal: controller.signal,
        }
      );

      const raw = await response.text();
      let data = {};

      try {
        data = raw
          ? JSON.parse(raw)
          : {};
      } catch {
        data = { raw };
      }

      return parseMyMemoryResponse(
        data,
        response.status
      );
    } catch (error) {
      lastError = error;

      const retryable =
        error.name === "AbortError" ||
        error.status === 429 ||
        Number(error.status) >= 500;

      if (
        !retryable ||
        attempt >= config.maxRetries
      ) {
        break;
      }

      await sleep(
        500 * 2 ** attempt
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  if (
    lastError?.name === "AbortError"
  ) {
    throw new Error(
      "MyMemory tarjima so'rovi timeout bo'ldi"
    );
  }

  throw lastError ||
    new Error(
      "MyMemory tarjima xatosi"
    );
};

const translateOneText = async ({
  text,
  sourceLanguage,
  targetLanguage,
  config,
}) => {
  const key = cacheKey({
    sourceLanguage,
    targetLanguage,
    text,
  });

  if (translationCache.has(key)) {
    return translationCache.get(key);
  }

  const chunks = splitTextByBytes(
    text,
    config.maxBytes
  );

  const translatedChunks = [];

  for (const chunk of chunks) {
    const chunkKey = cacheKey({
      sourceLanguage,
      targetLanguage,
      text: chunk,
    });

    if (
      translationCache.has(chunkKey)
    ) {
      translatedChunks.push(
        translationCache.get(
          chunkKey
        )
      );
      continue;
    }

    const translated =
      await requestMyMemory({
        text: chunk,
        sourceLanguage,
        targetLanguage,
        config,
      });

    translationCache.set(
      chunkKey,
      translated
    );

    translatedChunks.push(
      translated
    );
  }

  const translatedText =
    translatedChunks
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || text;

  translationCache.set(
    key,
    translatedText
  );

  return translatedText;
};

const mapWithConcurrency = async (
  values,
  concurrency,
  mapper
) => {
  const results = new Array(
    values.length
  );

  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) {
        return;
      }

      results[index] = await mapper(
        values[index],
        index
      );
    }
  };

  const workers = Array.from(
    {
      length: Math.min(
        concurrency,
        values.length
      ),
    },
    () => worker()
  );

  await Promise.all(workers);

  return results;
};

const translateTexts = async (
  values,
  targetLanguage,
  options = {}
) => {
  const config =
    getTranslationConfig();

  const texts = uniqueTexts(values);

  const translations = new Map(
    texts.map((text) => [text, text])
  );

  if (!texts.length) {
    return {
      translations,
      translatedCount: 0,
      failedCount: 0,
      skipped: true,
      reason: "no_texts",
      errors: [],
    };
  }

  const sourceLanguage = cleanText(
    options.sourceLanguage ||
      config.sourceLanguage
  ).toLowerCase();

  const target = cleanText(
    targetLanguage
  ).toLowerCase();

  if (!target) {
    throw new Error(
      "Tarjima qilinadigan til berilmagan"
    );
  }

  if (
    sourceLanguage === target
  ) {
    return {
      translations,
      translatedCount: 0,
      failedCount: 0,
      skipped: true,
      reason:
        "source_equals_target",
      errors: [],
    };
  }

  if (!config.enabled) {
    return {
      translations,
      translatedCount: 0,
      failedCount: 0,
      skipped: true,
      reason:
        "AUTO_TRANSLATE_ENABLED=false",
      errors: [],
    };
  }

  if (
    config.provider !== "mymemory"
  ) {
    throw new Error(
      `Noma'lum tarjima provayderi: ${config.provider}`
    );
  }

  let translatedCount = 0;
  let failedCount = 0;
  const errors = [];

  await mapWithConcurrency(
    texts,
    config.concurrency,
    async (text) => {
      try {
        const translated =
          await translateOneText({
            text,
            sourceLanguage,
            targetLanguage:
              target,
            config,
          });

        translations.set(
          text,
          translated || text
        );

        translatedCount += 1;
      } catch (error) {
        failedCount += 1;

        if (errors.length < 10) {
          errors.push({
            text:
              text.slice(0, 120),
            message: cleanText(
              error.message ||
                "Tarjima xatosi"
            ),
          });
        }

        translations.set(
          text,
          text
        );
      }
    }
  );

  return {
    translations,
    translatedCount,
    failedCount,
    skipped: false,
    reason:
      failedCount === texts.length
        ? "all_failed"
        : "",
    errors,
  };
};

const translateToUzAndEn = async (
  values,
  options = {}
) => {
  const texts = uniqueTexts(values);

  const [uzResult, enResult] =
    await Promise.all([
      translateTexts(
        texts,
        "uz",
        options
      ),
      translateTexts(
        texts,
        "en",
        options
      ),
    ]);

  return {
    uz: uzResult.translations,
    en: enResult.translations,

    summary: {
      provider: "mymemory",
      uniqueTexts: texts.length,
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
      errors: [
        ...uzResult.errors,
        ...enResult.errors,
      ].slice(0, 10),
    },
  };
};

module.exports = {
  getTranslationConfig,
  splitTextByBytes,
  translateTexts,
  translateToUzAndEn,
};
