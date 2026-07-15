// Delever API integratsiyasi.
// Muhim: API host va autentifikatsiya formati env orqali boshqariladi,
// chunki Delever muhiti/akkauntiga qarab qiymatlar farq qilishi mumkin.
const fetch = require("../lib/fetch");

class DeleverError extends Error {
  constructor(message, { status = 0, code = "DELEVER_ERROR", response = null } = {}) {
    super(message);
    this.name = "DeleverError";
    this.status = status;
    this.code = code;
    this.response = response;
  }
}

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const normalizePath = (value, fallback) => {
  const path = String(value || fallback || "").trim();
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
};

const getConfig = () => ({
  enabled: String(process.env.DELEVER_ENABLED || "false").toLowerCase() === "true",
  baseUrl: normalizeBaseUrl(process.env.DELEVER_BASE_URL),
  clientId: String(process.env.DELEVER_CLIENT_ID || "").trim(),
  clientSecret: String(process.env.DELEVER_CLIENT_SECRET || "").trim(),
  restaurantId: String(process.env.DELEVER_RESTAURANT_ID || "").trim(),
  tokenPath: normalizePath(process.env.DELEVER_TOKEN_PATH, "/v1/security/oauth/token"),
  restaurantsPath: normalizePath(process.env.DELEVER_RESTAURANTS_PATH, "/v1/restaurants"),
  menuCompositionPath: normalizePath(process.env.DELEVER_MENU_COMPOSITION_PATH, "/v1/menu/{restaurantId}/composition"),
  menuAvailabilityPath: normalizePath(process.env.DELEVER_MENU_AVAILABILITY_PATH, "/v1/menu/{restaurantId}/availability"),
  orderPath: normalizePath(process.env.DELEVER_ORDER_PATH, "/v1/order"),
  orderStatusPath: normalizePath(process.env.DELEVER_ORDER_STATUS_PATH, "/v1/order/{orderId}/status"),
  orderCancelPath: normalizePath(process.env.DELEVER_ORDER_CANCEL_PATH, "/v1/order/{orderId}"),
  grantType: String(process.env.DELEVER_GRANT_TYPE || "").trim(),
  scope: String(process.env.DELEVER_SCOPE || "").trim(),
  tokenAuthMode: String(process.env.DELEVER_TOKEN_AUTH_MODE || "auto").trim().toLowerCase(),
  authScheme: String(process.env.DELEVER_AUTH_SCHEME || "Bearer").trim(),
  platform: String(process.env.DELEVER_PLATFORM || "BOT").trim(),
  timeoutMs: Math.max(1000, Number(process.env.DELEVER_TIMEOUT_MS) || 15000),
});

const getPublicConfig = () => {
  const c = getConfig();
  return {
    enabled: c.enabled,
    configured: Boolean(c.baseUrl && c.clientId && c.clientSecret && c.restaurantId),
    baseUrl: c.baseUrl,
    restaurantId: c.restaurantId,
    clientIdConfigured: Boolean(c.clientId),
    clientSecretConfigured: Boolean(c.clientSecret),
    platform: c.platform,
    tokenAuthMode: c.tokenAuthMode,
    authScheme: c.authScheme || "raw",
  };
};

const assertConfigured = ({ requireRestaurant = false } = {}) => {
  const c = getConfig();
  const missing = [];
  if (!c.baseUrl) missing.push("DELEVER_BASE_URL");
  if (!c.clientId) missing.push("DELEVER_CLIENT_ID");
  if (!c.clientSecret) missing.push("DELEVER_CLIENT_SECRET");
  if (requireRestaurant && !c.restaurantId) missing.push("DELEVER_RESTAURANT_ID");
  if (missing.length) {
    throw new DeleverError(`Delever sozlamalari yetishmayapti: ${missing.join(", ")}`, {
      code: "DELEVER_NOT_CONFIGURED",
    });
  }
  return c;
};

const replacePathParams = (template, params = {}) => {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
  }
  return result;
};

const joinUrl = (baseUrl, path) => {
  if (/^https?:\/\//i.test(path)) return path;
  return `${normalizeBaseUrl(baseUrl)}${normalizePath(path)}`;
};

const decodeBase64Credentials = (value) => {
  try {
    const decoded = Buffer.from(String(value || ""), "base64").toString("utf8");
    return decoded.includes(":") ? decoded : "";
  } catch {
    return "";
  }
};

const parseResponseBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
};

let tokenCache = { token: "", expiresAt: 0 };
let tokenPromise = null;

const clearTokenCache = () => {
  tokenCache = { token: "", expiresAt: 0 };
  tokenPromise = null;
};

const requestAccessToken = async ({ fetchImpl = fetch } = {}) => {
  const c = assertConfigured();
  const decodedSecret = decodeBase64Credentials(c.clientSecret);

  // auto rejimda support bergan secret tayyor Base64 credential bo'lsa avval
  // Basic header sinovdan o'tadi. Server qabul qilmasa client_secret body varianti
  // bir marta avtomatik tekshiriladi.
  const modes = c.tokenAuthMode === "auto" && decodedSecret
    ? ["basic-secret", "body"]
    : [c.tokenAuthMode === "auto" ? "body" : c.tokenAuthMode];

  let lastFailure = null;
  for (const mode of modes) {
    const body = new URLSearchParams();
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };

    if (c.clientId) body.set("client_id", c.clientId);
    if (c.grantType) body.set("grant_type", c.grantType);
    if (c.scope) body.set("scope", c.scope);

    if (mode === "basic-secret") {
      headers.Authorization = `Basic ${c.clientSecret}`;
    } else if (mode === "basic-client") {
      headers.Authorization = `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`;
    } else {
      body.set("client_secret", c.clientSecret);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), c.timeoutMs);
    let response;
    try {
      response = await fetchImpl(joinUrl(c.baseUrl, c.tokenPath), {
        method: "POST",
        headers,
        body: body.toString(),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error?.name === "AbortError"
        ? `Delever token so'rovi ${c.timeoutMs} ms ichida javob bermadi`
        : `Delever token so'rovi bajarilmadi: ${error.message}`;
      throw new DeleverError(message, { code: "DELEVER_TOKEN_NETWORK" });
    } finally {
      clearTimeout(timer);
    }

    const data = await parseResponseBody(response);
    if (!response.ok) {
      lastFailure = new DeleverError(`Delever token xatosi (${response.status})`, {
        status: response.status,
        code: "DELEVER_TOKEN_HTTP",
        response: data,
      });
      continue;
    }

    const token = data?.access_token || data?.accessToken || data?.token || data?.data?.access_token || data?.data?.token;
    if (!token) {
      lastFailure = new DeleverError("Delever token javobida access token topilmadi", {
        code: "DELEVER_TOKEN_MISSING",
        response: data,
      });
      continue;
    }

    const expiresIn = Number(data?.expires_in || data?.expiresIn || data?.data?.expires_in || 3600);
    tokenCache = {
      token: String(token),
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    };
    return tokenCache.token;
  }

  throw lastFailure || new DeleverError("Delever tokenini olib bo'lmadi", { code: "DELEVER_TOKEN_FAILED" });
};

const getAccessToken = async ({ force = false, fetchImpl = fetch } = {}) => {
  if (!force && tokenCache.token && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  if (!force && tokenPromise) return tokenPromise;

  tokenPromise = requestAccessToken({ fetchImpl })
    .finally(() => { tokenPromise = null; });
  return tokenPromise;
};

const buildApiAuthorization = (token, scheme) => {
  const normalized = String(scheme || "").trim();
  if (!normalized || normalized.toLowerCase() === "raw") return token;
  return `${normalized} ${token}`;
};

const deleverRequest = async (path, {
  method = "GET",
  body,
  headers = {},
  retryAuth = true,
  fetchImpl = fetch,
} = {}) => {
  const c = assertConfigured();
  const token = await getAccessToken({ fetchImpl });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), c.timeoutMs);

  let response;
  try {
    response = await fetchImpl(joinUrl(c.baseUrl, path), {
      method,
      headers: {
        Accept: "application/json",
        Authorization: buildApiAuthorization(token, c.authScheme),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const message = error?.name === "AbortError"
      ? `Delever API ${c.timeoutMs} ms ichida javob bermadi`
      : `Delever API so'rovi bajarilmadi: ${error.message}`;
    throw new DeleverError(message, { code: "DELEVER_NETWORK" });
  } finally {
    clearTimeout(timer);
  }

  const data = await parseResponseBody(response);
  if ((response.status === 401 || response.status === 403) && retryAuth) {
    clearTokenCache();
    return deleverRequest(path, { method, body, headers, retryAuth: false, fetchImpl });
  }
  if (!response.ok) {
    throw new DeleverError(`Delever API xatosi (${response.status})`, {
      status: response.status,
      code: "DELEVER_HTTP",
      response: data,
    });
  }
  return data;
};

const getRestaurants = (options) => {
  const c = assertConfigured();
  return deleverRequest(c.restaurantsPath, options);
};

const getMenuComposition = (restaurantId, options) => {
  const c = assertConfigured({ requireRestaurant: !restaurantId });
  const id = restaurantId || c.restaurantId;
  return deleverRequest(replacePathParams(c.menuCompositionPath, { restaurantId: id }), options);
};

const getMenuAvailability = (restaurantId, options) => {
  const c = assertConfigured({ requireRestaurant: !restaurantId });
  const id = restaurantId || c.restaurantId;
  return deleverRequest(replacePathParams(c.menuAvailabilityPath, { restaurantId: id }), options);
};

const createOrder = (payload, options = {}) => {
  const c = assertConfigured({ requireRestaurant: true });
  return deleverRequest(c.orderPath, { ...options, method: "POST", body: payload });
};

const getOrderStatus = (orderId, options) => {
  const c = assertConfigured();
  return deleverRequest(replacePathParams(c.orderStatusPath, { orderId }), options);
};

const cancelOrder = (orderId, body = {}, options = {}) => {
  const c = assertConfigured();
  return deleverRequest(replacePathParams(c.orderCancelPath, { orderId }), {
    ...options,
    method: "DELETE",
    body,
  });
};

module.exports = {
  DeleverError,
  getConfig,
  getPublicConfig,
  assertConfigured,
  replacePathParams,
  clearTokenCache,
  getAccessToken,
  deleverRequest,
  getRestaurants,
  getMenuComposition,
  getMenuAvailability,
  createOrder,
  getOrderStatus,
  cancelOrder,
};
