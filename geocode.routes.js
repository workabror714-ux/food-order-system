const router = require("express").Router();
const { rateLimit } = require("../middleware/rateLimit");
const fetch = require("../lib/fetch");

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ITEMS = 1000;
const cache = new Map();

let queue = Promise.resolve();
let lastProviderRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scheduleProviderRequest = (task) => {
  const run = queue.then(async () => {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastProviderRequestAt));
    if (waitMs) await sleep(waitMs);
    lastProviderRequestAt = Date.now();
    return task();
  });

  queue = run.catch(() => {});
  return run;
};

const normalizeLanguage = (value) =>
  String(value || "").toLowerCase().startsWith("ru")
    ? "ru,uz,en"
    : "uz,ru,en";

const cacheKey = (lat, lng, lang) =>
  `${lat.toFixed(5)}:${lng.toFixed(5)}:${lang}`;

const readCache = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return item.value;
};

const writeCache = (key, value) => {
  if (cache.size >= MAX_CACHE_ITEMS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

router.get(
  "/api/geocode/reverse",
  rateLimit({ windowMs: 60 * 1000, max: 20 }),
  async (req, res) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const lang = normalizeLanguage(req.query.lang);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json({
          ok: false,
          message: "Koordinatalar noto'g'ri.",
        });
      }

      const key = cacheKey(lat, lng, lang);
      const cached = readCache(key);
      if (cached) {
        return res.json({ ok: true, ...cached, cached: true });
      }

      const query = new URLSearchParams({
        format: "jsonv2",
        lat: String(lat),
        lon: String(lng),
        zoom: "18",
        addressdetails: "1",
        "accept-language": lang,
      });

      const data = await scheduleProviderRequest(async () => {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Accept-Language": lang,
              "User-Agent":
                "YalpizRestaurantWebsite/1.0 (+https://www.yalpiz-restaurant.uz/)",
              Referer: "https://www.yalpiz-restaurant.uz/",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Geocoder HTTP ${response.status}`);
        }

        return response.json();
      });

      const address = String(data?.display_name || "").trim();
      if (!address) {
        return res.status(404).json({
          ok: false,
          message: "Bu joy uchun manzil topilmadi.",
        });
      }

      const result = {
        address,
        lat,
        lng,
        provider: "OpenStreetMap Nominatim",
        attribution: "© OpenStreetMap contributors",
      };

      writeCache(key, result);
      return res.json({ ok: true, ...result, cached: false });
    } catch (error) {
      console.error("[reverse-geocode]", error.message);
      return res.status(502).json({
        ok: false,
        message: "Manzilni avtomatik aniqlab bo'lmadi. Qo'lda kiriting.",
      });
    }
  }
);

module.exports = router;
