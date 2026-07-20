// Delever API integratsiyasi.
// API host va autentifikatsiya env orqali boshqariladi.
const fetch = require("../lib/fetch");

class DeleverError extends Error {
  constructor(
    message,
    {
      status = 0,
      code =
        "DELEVER_ERROR",
      response = null,
    } = {}
  ) {
    super(message);

    this.name =
      "DeleverError";

    this.status =
      status;

    this.code =
      code;

    this.response =
      response;
  }
}

const normalizeBaseUrl = (
  value
) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const normalizePath = (
  value,
  fallback
) => {
  const path =
    String(
      value ||
        fallback ||
        ""
    ).trim();

  if (!path) {
    return "";
  }

  return path.startsWith("/")
    ? path
    : `/${path}`;
};

const envBoolean = (
  value,
  fallback = false
) => {
  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return (
    normalized === "true"
  );
};

const getConfig = () => {
  const enabled =
    envBoolean(
      process.env
        .DELEVER_ENABLED,
      false
    );

  return {
    enabled,

    /*
     * Menyu va order alohida boshqariladi.
     * Order test tugamaguncha false qoladi.
     */
    orderEnabled:
      envBoolean(
        process.env
          .DELEVER_ORDER_ENABLED,
        enabled
      ),

    baseUrl:
      normalizeBaseUrl(
        process.env
          .DELEVER_BASE_URL
      ),

    clientId:
      String(
        process.env
          .DELEVER_CLIENT_ID ||
          ""
      ).trim(),

    clientSecret:
      String(
        process.env
          .DELEVER_CLIENT_SECRET ||
          ""
      ).trim(),

    restaurantId:
      String(
        process.env
          .DELEVER_RESTAURANT_ID ||
          ""
      ).trim(),

    tokenPath:
      normalizePath(
        process.env
          .DELEVER_TOKEN_PATH,

        "/v1/custom-integration/security/oauth/token"
      ),

    restaurantsPath:
      normalizePath(
        process.env
          .DELEVER_RESTAURANTS_PATH,

        "/v1/custom-integration/restaurants"
      ),

    menuCompositionPath:
      normalizePath(
        process.env
          .DELEVER_MENU_COMPOSITION_PATH,

        "/v1/custom-integration/menu/{restaurantId}/composition"
      ),

    menuAvailabilityPath:
      normalizePath(
        process.env
          .DELEVER_MENU_AVAILABILITY_PATH,

        "/v1/custom-integration/menu/{restaurantId}/availability"
      ),

    /*
     * Delever Custom Integration V2 endpointlari.
     */
    orderPath:
      normalizePath(
        process.env
          .DELEVER_ORDER_PATH,

        "/v1/custom-integration/order"
      ),

    orderStatusPath:
      normalizePath(
        process.env
          .DELEVER_ORDER_STATUS_PATH,

        "/v1/custom-integration/order/{orderId}/status"
      ),

    orderCancelPath:
      normalizePath(
        process.env
          .DELEVER_ORDER_CANCEL_PATH,

        "/v1/custom-integration/order/{orderId}"
      ),

    orderDetailsPath:
      normalizePath(
        process.env
          .DELEVER_ORDER_DETAILS_PATH,

        "/v1/custom-integration/order/{orderId}"
      ),

    grantType:
      String(
        process.env
          .DELEVER_GRANT_TYPE ||
          ""
      ).trim(),

    scope:
      String(
        process.env
          .DELEVER_SCOPE ||
          ""
      ).trim(),

    tokenAuthMode:
      String(
        process.env
          .DELEVER_TOKEN_AUTH_MODE ||
          "auto"
      )
        .trim()
        .toLowerCase(),

    authScheme:
      String(
        process.env
          .DELEVER_AUTH_SCHEME ||
          "Bearer"
      ).trim(),

    timeoutMs:
      Math.max(
        1000,
        Number(
          process.env
            .DELEVER_TIMEOUT_MS
        ) || 15000
      ),
  };
};

const getPublicConfig = () => {
  const config =
    getConfig();

  return {
    enabled:
      config.enabled,

    orderEnabled:
      config.orderEnabled,

    configured:
      Boolean(
        config.baseUrl &&
          config.clientId &&
          config.clientSecret &&
          config.restaurantId
      ),

    baseUrl:
      config.baseUrl,

    restaurantId:
      config.restaurantId,

    clientIdConfigured:
      Boolean(
        config.clientId
      ),

    clientSecretConfigured:
      Boolean(
        config.clientSecret
      ),

    tokenAuthMode:
      config.tokenAuthMode,

    authScheme:
      config.authScheme ||
      "raw",
  };
};

const assertConfigured = ({
  requireRestaurant =
    false,
} = {}) => {
  const config =
    getConfig();

  const missing = [];

  if (!config.baseUrl) {
    missing.push(
      "DELEVER_BASE_URL"
    );
  }

  if (!config.clientId) {
    missing.push(
      "DELEVER_CLIENT_ID"
    );
  }

  if (
    !config.clientSecret
  ) {
    missing.push(
      "DELEVER_CLIENT_SECRET"
    );
  }

  if (
    requireRestaurant &&
    !config.restaurantId
  ) {
    missing.push(
      "DELEVER_RESTAURANT_ID"
    );
  }

  if (missing.length) {
    throw new DeleverError(
      `Delever sozlamalari yetishmayapti: ${missing.join(", ")}`,
      {
        code:
          "DELEVER_NOT_CONFIGURED",
      }
    );
  }

  return config;
};

const replacePathParams = (
  template,
  params = {}
) => {
  let result =
    template;

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      params
    )
  ) {
    result =
      result.replaceAll(
        `{${key}}`,
        encodeURIComponent(
          String(value)
        )
      );
  }

  return result;
};

const joinUrl = (
  baseUrl,
  path
) => {
  if (
    /^https?:\/\//i.test(
      path
    )
  ) {
    return path;
  }

  return (
    `${normalizeBaseUrl(
      baseUrl
    )}${normalizePath(
      path
    )}`
  );
};

const decodeBase64Credentials = (
  value
) => {
  try {
    const decoded =
      Buffer.from(
        String(
          value || ""
        ),
        "base64"
      ).toString(
        "utf8"
      );

    return decoded.includes(
      ":"
    )
      ? decoded
      : "";
  } catch {
    return "";
  }
};

const parseResponseBody = async (
  response
) => {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(
      text
    );
  } catch {
    return text;
  }
};

let tokenCache = {
  token: "",
  expiresAt: 0,
};

let tokenPromise =
  null;

const clearTokenCache = () => {
  tokenCache = {
    token: "",
    expiresAt: 0,
  };

  tokenPromise =
    null;
};

const requestAccessToken = async ({
  fetchImpl = fetch,
} = {}) => {
  const config =
    assertConfigured();

  const decodedSecret =
    decodeBase64Credentials(
      config.clientSecret
    );

  const modes =
    config.tokenAuthMode ===
      "auto" &&
    decodedSecret
      ? [
          "basic-secret",
          "body",
        ]
      : [
          config
            .tokenAuthMode ===
          "auto"
            ? "body"
            : config
                .tokenAuthMode,
        ];

  let lastFailure =
    null;

  for (
    const mode
    of modes
  ) {
    const body =
      new URLSearchParams();

    const headers = {
      "Content-Type":
        "application/x-www-form-urlencoded",
    };

    if (config.clientId) {
      body.set(
        "client_id",
        config.clientId
      );
    }

    if (config.grantType) {
      body.set(
        "grant_type",
        config.grantType
      );
    }

    if (config.scope) {
      body.set(
        "scope",
        config.scope
      );
    }

    if (
      mode ===
      "basic-secret"
    ) {
      headers.Authorization =
        `Basic ${config.clientSecret}`;
    } else if (
      mode ===
      "basic-client"
    ) {
      headers.Authorization =
        `Basic ${Buffer.from(
          `${config.clientId}:${config.clientSecret}`
        ).toString("base64")}`;
    } else {
      body.set(
        "client_secret",
        config.clientSecret
      );
    }

    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        config.timeoutMs
      );

    let response;

    try {
      response =
        await fetchImpl(
          joinUrl(
            config.baseUrl,
            config.tokenPath
          ),
          {
            method: "POST",
            headers,

            body:
              body.toString(),

            signal:
              controller.signal,
          }
        );
    } catch (error) {
      const message =
        error?.name ===
        "AbortError"
          ? `Delever token so'rovi ${config.timeoutMs} ms ichida javob bermadi`
          : `Delever token so'rovi bajarilmadi: ${error.message}`;

      throw new DeleverError(
        message,
        {
          code:
            "DELEVER_TOKEN_NETWORK",
        }
      );
    } finally {
      clearTimeout(
        timer
      );
    }

    const data =
      await parseResponseBody(
        response
      );

    if (!response.ok) {
      lastFailure =
        new DeleverError(
          `Delever token xatosi (${response.status})`,
          {
            status:
              response.status,

            code:
              "DELEVER_TOKEN_HTTP",

            response:
              data,
          }
        );

      continue;
    }

    const token =
      data?.access_token ||
      data?.accessToken ||
      data?.token ||
      data?.data
        ?.access_token ||
      data?.data?.token;

    if (!token) {
      lastFailure =
        new DeleverError(
          "Delever token javobida access token topilmadi",
          {
            code:
              "DELEVER_TOKEN_MISSING",

            response:
              data,
          }
        );

      continue;
    }

    const expiresIn =
      Number(
        data?.expires_in ||
          data?.expiresIn ||
          data?.data
            ?.expires_in ||
          3600
      );

    tokenCache = {
      token:
        String(token),

      expiresAt:
        Date.now() +
        Math.max(
          60,
          expiresIn - 60
        ) *
          1000,
    };

    return tokenCache
      .token;
  }

  throw (
    lastFailure ||
    new DeleverError(
      "Delever tokenini olib bo'lmadi",
      {
        code:
          "DELEVER_TOKEN_FAILED",
      }
    )
  );
};

const getAccessToken = async ({
  force = false,
  fetchImpl = fetch,
} = {}) => {
  if (
    !force &&
    tokenCache.token &&
    tokenCache.expiresAt >
      Date.now()
  ) {
    return tokenCache
      .token;
  }

  if (
    !force &&
    tokenPromise
  ) {
    return tokenPromise;
  }

  tokenPromise =
    requestAccessToken({
      fetchImpl,
    }).finally(() => {
      tokenPromise =
        null;
    });

  return tokenPromise;
};

const buildApiAuthorization = (
  token,
  scheme
) => {
  const normalized =
    String(scheme || "")
      .trim();

  if (
    !normalized ||
    normalized.toLowerCase() ===
      "raw"
  ) {
    return token;
  }

  return (
    `${normalized} ${token}`
  );
};

const deleverRequest = async (
  path,
  {
    method = "GET",
    body,
    headers = {},
    retryAuth = true,
    fetchImpl = fetch,
  } = {}
) => {
  const config =
    assertConfigured();

  const token =
    await getAccessToken({
      fetchImpl,
    });

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      config.timeoutMs
    );

  let response;

  try {
    response =
      await fetchImpl(
        joinUrl(
          config.baseUrl,
          path
        ),
        {
          method,

          headers: {
            Accept:
              "application/json",

            Authorization:
              buildApiAuthorization(
                token,
                config.authScheme
              ),

            ...(
              body !== undefined
                ? {
                    "Content-Type":
                      "application/json",
                  }
                : {}
            ),

            ...headers,
          },

          body:
            body === undefined
              ? undefined
              : JSON.stringify(
                  body
                ),

          signal:
            controller.signal,
        }
      );
  } catch (error) {
    const message =
      error?.name ===
      "AbortError"
        ? `Delever API ${config.timeoutMs} ms ichida javob bermadi`
        : `Delever API so'rovi bajarilmadi: ${error.message}`;

    throw new DeleverError(
      message,
      {
        code:
          "DELEVER_NETWORK",
      }
    );
  } finally {
    clearTimeout(
      timer
    );
  }

  const data =
    await parseResponseBody(
      response
    );

  if (
    (
      response.status ===
        401 ||
      response.status ===
        403
    ) &&
    retryAuth
  ) {
    clearTokenCache();

    return deleverRequest(
      path,
      {
        method,
        body,
        headers,
        retryAuth: false,
        fetchImpl,
      }
    );
  }

  if (!response.ok) {
    throw new DeleverError(
      `Delever API xatosi (${response.status})`,
      {
        status:
          response.status,

        code:
          "DELEVER_HTTP",

        response:
          data,
      }
    );
  }

  return data;
};

const getRestaurants = (
  options
) => {
  const config =
    assertConfigured();

  return deleverRequest(
    config.restaurantsPath,
    options
  );
};

const getMenuComposition = (
  restaurantId,
  options
) => {
  const config =
    assertConfigured({
      requireRestaurant:
        !restaurantId,
    });

  const id =
    restaurantId ||
    config.restaurantId;

  return deleverRequest(
    replacePathParams(
      config
        .menuCompositionPath,
      {
        restaurantId:
          id,
      }
    ),
    {
      ...options,
      headers: {
        Accept:
          MENU_COMPOSITION_V2,
        ...(options?.headers || {}),
      },
    }
  );
};

const getMenuAvailability = (
  restaurantId,
  options
) => {
  const config =
    assertConfigured({
      requireRestaurant:
        !restaurantId,
    });

  const id =
    restaurantId ||
    config.restaurantId;

  return deleverRequest(
    replacePathParams(
      config
        .menuAvailabilityPath,
      {
        restaurantId:
          id,
      }
    ),
    {
      ...options,
      headers: {
        Accept:
          MENU_AVAILABILITY_V2,
        ...(options?.headers || {}),
      },
    }
  );
};

const ORDER_V2_CONTENT_TYPE =
  "application/vnd.eats.order.v2+json";

const MENU_COMPOSITION_V2 =
  "application/vnd.eats.menu.composition.v2+json";

const MENU_AVAILABILITY_V2 =
  "application/vnd.eats.menu.availability.v2+json";

const createOrder = (
  payload,
  options = {}
) => {
  const config =
    assertConfigured({
      requireRestaurant:
        true,
    });

  return deleverRequest(
    config.orderPath,
    {
      ...options,

      method:
        "POST",

      headers: {
        "Content-Type":
          ORDER_V2_CONTENT_TYPE,
        Accept:
          "application/json",
        ...(options.headers || {}),
      },

      body:
        payload,
    }
  );
};

const getOrder = (
  orderId,
  options
) => {
  const config =
    assertConfigured();

  return deleverRequest(
    replacePathParams(
      config
        .orderDetailsPath,
      {
        orderId,
      }
    ),
    options
  );
};

const updateOrder = (
  orderId,
  payload,
  options = {}
) => {
  const config =
    assertConfigured();

  return deleverRequest(
    replacePathParams(
      config
        .orderDetailsPath,
      {
        orderId,
      }
    ),
    {
      ...options,
      method: "PUT",
      headers: {
        "Content-Type":
          ORDER_V2_CONTENT_TYPE,
        Accept:
          "application/json",
        ...(options.headers || {}),
      },
      body: payload,
    }
  );
};

const updateOrderStatus = (
  orderId,
  status,
  comment = "",
  options = {}
) => {
  const config =
    assertConfigured();

  const body = {
    status:
      String(status || "")
        .trim()
        .toUpperCase(),
  };

  if (String(comment || "").trim()) {
    body.comment =
      String(comment).trim();
  }

  return deleverRequest(
    replacePathParams(
      config
        .orderStatusPath,
      {
        orderId,
      }
    ),
    {
      ...options,
      method: "PUT",
      body,
    }
  );
};

const getOrderStatus = (
  orderId,
  options
) => {
  const config =
    assertConfigured();

  return deleverRequest(
    replacePathParams(
      config
        .orderStatusPath,
      {
        orderId,
      }
    ),
    options
  );
};

const cancelOrder = (
  orderId,
  body = {},
  options = {}
) => {
  const config =
    assertConfigured();

  return deleverRequest(
    replacePathParams(
      config
        .orderCancelPath,
      {
        orderId,
      }
    ),
    {
      ...options,

      method:
        "DELETE",

      body,
    }
  );
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
  ORDER_V2_CONTENT_TYPE,
  MENU_COMPOSITION_V2,
  MENU_AVAILABILITY_V2,
  createOrder,
  getOrder,
  updateOrder,
  getOrderStatus,
  updateOrderStatus,
  cancelOrder,
};
