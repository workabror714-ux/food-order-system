const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const {
  clearTokenCache,
  getAccessToken,
  getMenuComposition,
  getConfig,
} = require("../integrations/delever");
const { normalizeComposition, availabilityValue } = require("../lib/deleverMenuMapper");
const { buildDeleverOrderPayload, extractDeleverOrderId, mapDeleverStatus } = require("../lib/deleverOrderMapper");

const ENV_KEYS = [
  "DELEVER_ENABLED",
  "DELEVER_ORDER_ENABLED",
  "DELEVER_BASE_URL",
  "DELEVER_CLIENT_ID",
  "DELEVER_CLIENT_SECRET",
  "DELEVER_RESTAURANT_ID",
  "DELEVER_TOKEN_AUTH_MODE",
  "DELEVER_AUTH_SCHEME",
  "DELEVER_GRANT_TYPE",
  "DELEVER_SCOPE",
  "DELEVER_INCLUDE_EXTERNAL_ID",
  "DELEVER_REQUIRE_EXTERNAL_ITEMS",
  "DELEVER_PLATFORM",
];
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

const resetEnv = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  clearTokenCache();
};
afterEach(resetEnv);

const response = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => data === null ? "" : JSON.stringify(data),
});

const configure = () => {
  process.env.DELEVER_BASE_URL = "https://api.example.test";
  process.env.DELEVER_CLIENT_ID = "client-id";
  process.env.DELEVER_CLIENT_SECRET = Buffer.from("login:password").toString("base64");
  process.env.DELEVER_RESTAURANT_ID = "restaurant-1";
  process.env.DELEVER_TOKEN_AUTH_MODE = "auto";
  process.env.DELEVER_AUTH_SCHEME = "Bearer";
};

test("Delever token: Base64 Client Secret auto rejimda Basic header bo'ladi", async () => {
  configure();
  let request;
  const token = await getAccessToken({
    force: true,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, { access_token: "test-token", expires_in: 3600 });
    },
  });

  assert.strictEqual(token, "test-token");
  assert.strictEqual(request.url, "https://api.example.test/v1/security/oauth/token");
  assert.strictEqual(request.options.headers.Authorization, `Basic ${process.env.DELEVER_CLIENT_SECRET}`);
  assert.match(request.options.body, /client_id=client-id/);
  assert.doesNotMatch(request.options.body, /client_secret/);
});

test("Delever API tokenni Bearer formatida yuboradi", async () => {
  configure();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/oauth/token")) return response(200, { access_token: "abc", expires_in: 3600 });
    return response(200, { products: [] });
  };

  await getMenuComposition("restaurant-2", { fetchImpl });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].url, "https://api.example.test/v1/menu/restaurant-2/composition");
  assert.strictEqual(calls[1].options.headers.Authorization, "Bearer abc");
});

test("Delever menyu javobi Food formatiga normallashtiriladi", () => {
  const result = normalizeComposition({
    lastChange: "2026-07-15T10:00:00Z",
    categories: [{ id: "cat-1", name: { uz: "Issiq taomlar", ru: "Горячие блюда" } }],
    products: [{
      id: "food-1",
      categoryId: "cat-1",
      name: { uz: "Osh", ru: "Плов" },
      description: "Mazali osh",
      price: 45000,
      images: [{ url: "https://img.test/osh.jpg" }],
      modifierGroups: [{ id: "group-1" }],
    }],
  }, "restaurant-1");

  assert.strictEqual(result.products.length, 1);
  assert.strictEqual(result.products[0].deleverId, "food-1");
  assert.strictEqual(result.products[0].title.uz, "Osh");
  assert.strictEqual(result.products[0].category.ru, "Горячие блюда");
  assert.strictEqual(result.products[0].price, 45000);
  assert.strictEqual(result.products[0].image, "https://img.test/osh.jpg");
  assert.strictEqual(result.products[0].modifierGroups.length, 1);
});

test("Delever stop-list qiymati to'g'ri aniqlanadi", () => {
  assert.strictEqual(
    availabilityValue({ stock: 0 }),
    false
  );

  assert.strictEqual(
    availabilityValue({ stock: 4 }),
    true
  );

  assert.strictEqual(
    availabilityValue({ isAvailable: false }),
    false
  );

  assert.strictEqual(
    availabilityValue({
      itemId: "stop-list-item",
    }),
    false
  );
});

test(
  "Delever menyu yoqilib, buyurtma yuborish alohida o'chiriladi",
  () => {
    process.env.DELEVER_ENABLED = "true";
    process.env.DELEVER_ORDER_ENABLED = "false";

    const config = getConfig();

    assert.strictEqual(
      config.enabled,
      true
    );

    assert.strictEqual(
      config.orderEnabled,
      false
    );
  }
);

test("Bot order Delever payloadiga xavfsiz map qilinadi", () => {
  configure();
  process.env.DELEVER_PLATFORM = "BOT";
  const payload = buildDeleverOrderPayload({
    _id: "66abc123",
    customerName: "Anvar",
    customerPhone: "+998 90 123 45 67",
    orderType: "pickup",
    paymentType: "cash",
    paymentStatus: "unpaid",
    totalPrice: 90000,
    deliveryPrice: 0,
    items: [{
      foodId: "mongo-food-id",
      deleverProductId: "delever-food-id",
      title: "Osh",
      price: 45000,
      quantity: 2,
      modifiers: [],
    }],
  });

  assert.strictEqual(payload.restaurantId, "restaurant-1");
  assert.strictEqual(payload.externalOrderId, "66abc123");
  assert.strictEqual(payload.items[0].id, "delever-food-id");
  assert.strictEqual(payload.items[0].quantity, 2);
  assert.strictEqual(payload.paymentInfo.itemsCost, 90000);
  assert.strictEqual(payload.paymentInfo.isPaid, false);
  assert.strictEqual(payload.deliveryInfo.phoneNumber, "+998901234567");
});

test("Delever order ID va status variantlari aniqlanadi", () => {
  assert.strictEqual(extractDeleverOrderId({ data: { orderId: "D-123" } }), "D-123");
  assert.strictEqual(mapDeleverStatus("courier on way"), "on_way");
  assert.strictEqual(mapDeleverStatus("completed"), "delivered");
  assert.strictEqual(mapDeleverStatus("cancelled"), "cancelled");
});
