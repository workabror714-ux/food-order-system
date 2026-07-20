const {
  getConfig,
} = require("../integrations/delever");

const boolEnv = (
  name,
  fallback = false
) => {
  const value =
    process.env[name];

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

const cleanText = (value) =>
  String(value ?? "").trim();

const finiteNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const positiveNumber = (
  value,
  fallback = 0
) => {
  const number =
    finiteNumber(
      value,
      fallback
    );

  return number >= 0
    ? number
    : fallback;
};

const positiveQuantity = (
  value,
  fallback = 1
) => {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return number;
};

const normalizePhone = (value) => {
  const raw = cleanText(value);
  const digits =
    raw.replace(/[^0-9]/g, "");

  if (!digits) {
    return raw;
  }

  return `+${digits}`;
};

/*
 * Custom Integration V2 faqat CASH yoki CARD qabul qiladi.
 * Click/Payme orqali to'langan order CARD hisoblanadi.
 */
const paymentTypeForDelever = (
  order
) => {
  const key = cleanText(
    order.paymentType ||
      order.paymentProvider ||
      "cash"
  ).toUpperCase();

  const override = cleanText(
    process.env[
      `DELEVER_PAYMENT_TYPE_${key}`
    ]
  ).toUpperCase();

  if (
    ["CASH", "CARD"].includes(
      override
    )
  ) {
    return override;
  }

  return key === "CASH"
    ? "CASH"
    : "CARD";
};

/*
 * pickup   -> takeaway
 * delivery -> delivery (restoran yetkazib beradi)
 * aggregator env orqali tanlanadi, masalan tashqi kuryer tizimi uchun.
 */
const discriminatorForDelever = (
  order
) => {
  const explicit = cleanText(
    order.deleverDiscriminator ||
      process.env
        .DELEVER_ORDER_DISCRIMINATOR
  ).toLowerCase();

  if (
    [
      "aggregator",
      "delivery",
      "takeaway",
    ].includes(explicit)
  ) {
    return explicit;
  }

  return cleanText(
    order.orderType
  ).toLowerCase() === "pickup"
    ? "takeaway"
    : "delivery";
};

const modifierId = (modifier) =>
  cleanText(
    modifier?.deleverModifierId ||
      modifier?.modifierId ||
      modifier?.id
  );

const mapModifiers = (
  modifiers = []
) =>
  modifiers
    .filter(Boolean)
    .map((modifier) => ({
      id:
        modifierId(modifier),

      name:
        cleanText(
          modifier.name ||
            modifier.title ||
            "Modifier"
        ),

      quantity:
        Math.max(
          1,
          Math.floor(
            Number(
              modifier.quantity
            ) || 1
          )
        ),

      price:
        positiveNumber(
          modifier.deleverBasePrice ??
            modifier.price,
          0
        ),
    }))
    .filter(
      (modifier) =>
        modifier.id
    );

/*
 * Custom Integration order uchun aynan
 * GET /v1/custom-integration/restaurants javobidagi Delever place ID ishlatiladi.
 * Neon Alisa ichidagi branch ID payloadga yuborilmaydi.
 */
const getRestaurantIdForOrder = () => {
  const config = getConfig();

  return cleanText(
    config.restaurantId
  );
};

const getItemBasePrice = (item) => {
  const explicit =
    positiveNumber(
      item.deleverBasePrice,
      0
    );

  if (explicit > 0) {
    return explicit;
  }

  const publicPrice =
    positiveNumber(
      item.price,
      0
    );

  const packagingFee =
    positiveNumber(
      item.packagingFee,
      0
    );

  return Math.max(
    0,
    publicPrice - packagingFee
  );
};

const itemCost = (item) => {
  const quantity =
    positiveQuantity(
      item.quantity,
      1
    );

  const base =
    positiveNumber(
      item.price,
      0
    );

  const modifiersCost =
    (item.modifications || [])
      .reduce(
        (sum, modifier) =>
          sum +
          positiveNumber(
            modifier.price,
            0
          ) *
            positiveQuantity(
              modifier.quantity,
              1
            ),
        0
      );

  return (
    (base + modifiersCost) *
    quantity
  );
};

const buildPackagingItems = (
  order
) => {
  const enabled =
    boolEnv(
      "DELEVER_SEND_PACKAGING_ITEM",
      false
    );

  if (!enabled) {
    return [];
  }

  const productId =
    cleanText(
      process.env
        .DELEVER_PACKAGING_PRODUCT_ID
    );

  if (!productId) {
    throw new Error(
      "DELEVER_SEND_PACKAGING_ITEM=true, lekin DELEVER_PACKAGING_PRODUCT_ID kiritilmagan"
    );
  }

  const productName =
    cleanText(
      process.env
        .DELEVER_PACKAGING_PRODUCT_NAME ||
        "Idish puli"
    );

  const grouped = new Map();

  for (
    const item
    of order.items || []
  ) {
    const fee =
      positiveNumber(
        item.packagingFee,
        0
      );

    if (fee <= 0) {
      continue;
    }

    const quantity =
      Math.max(
        1,
        Math.floor(
          Number(item.quantity) || 1
        )
      );

    grouped.set(
      fee,
      (grouped.get(fee) || 0) +
        quantity
    );
  }

  return [
    ...grouped.entries(),
  ].map(
    ([price, quantity]) => ({
      id: productId,
      name: productName,
      price,
      quantity,
      modifications: [],
      promos: [],
    })
  );
};

const firstFinite = (...values) => {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
};

const buildDeliveryAddress = (
  order
) => {
  const isPickup =
    cleanText(order.orderType)
      .toLowerCase() ===
    "pickup";

  const full = cleanText(
    order.address ||
      (
        isPickup
          ? `${order.filialName || "Yalpiz"} — olib ketish`
          : "Manzil ko'rsatilmagan"
      )
  );

  const latitude = firstFinite(
    order.location?.lat,
    order.location?.latitude,
    order.latitude
  );

  const longitude = firstFinite(
    order.location?.lng,
    order.location?.long,
    order.location?.longitude,
    order.longitude
  );

  const deliveryAddress = {
    full,
  };

  if (latitude !== null) {
    deliveryAddress.latitude =
      String(latitude);
  }

  if (longitude !== null) {
    deliveryAddress.longitude =
      String(longitude);
  }

  return deliveryAddress;
};

const buildItemPromos = (item) =>
  Array.isArray(item.promos)
    ? item.promos
    : [];

const buildOrderPromos = (order) =>
  Array.isArray(order.promos)
    ? order.promos
    : [];

const buildDeleverOrderPayload = (
  order,
  options = {}
) => {
  const restaurantId =
    getRestaurantIdForOrder();

  if (!restaurantId) {
    throw new Error(
      "DELEVER_RESTAURANT_ID topilmadi"
    );
  }

  const externalId = cleanText(
    order.deleverExternalId ||
      order._id
  );

  if (!externalId) {
    throw new Error(
      "Delever eatsId uchun lokal order ID topilmadi"
    );
  }

  const requireExternalItems =
    boolEnv(
      "DELEVER_REQUIRE_EXTERNAL_ITEMS",
      true
    );

  const missing =
    (order.items || [])
      .filter(
        (item) =>
          !cleanText(
            item.deleverProductId
          )
      );

  if (
    requireExternalItems &&
    missing.length
  ) {
    const names =
      missing
        .map(
          (item) =>
            item.title ||
            item.foodId
        )
        .join(", ");

    throw new Error(
      `Delever ID biriktirilmagan taomlar: ${names}. Avval menyuni sinxronlashtiring.`
    );
  }

  const menuItems =
    (order.items || [])
      .map((item) => {
        const id = cleanText(
          item.deleverProductId ||
            item.foodId
        );

        const price =
          getItemBasePrice(item);

        if (!id) {
          return null;
        }

        if (price <= 0) {
          throw new Error(
            `${item.title || "Taom"} uchun Delever asl narxi topilmadi`
          );
        }

        const mapped = {
          id,

          name:
            cleanText(
              item.deleverTitle ||
                item.title ||
                "Taom"
            ),

          quantity:
            positiveQuantity(
              item.quantity,
              1
            ),

          price,

          modifications:
            mapModifiers(
              item.modifiers ||
                item.modifications ||
                []
            ),

          promos:
            buildItemPromos(item),
        };

        if (
          item.comboInfo &&
          typeof item.comboInfo ===
            "object"
        ) {
          mapped.comboInfo = {
            id: cleanText(
              item.comboInfo.id
            ),
            componentId: cleanText(
              item.comboInfo
                .componentId
            ),
          };
        }

        return mapped;
      })
      .filter(Boolean);

  if (!menuItems.length) {
    throw new Error(
      "Deleverga yuboriladigan taomlar topilmadi"
    );
  }

  const includePackaging =
    options.includePackagingItem ===
    undefined
      ? true
      : Boolean(
          options
            .includePackagingItem
        );

  const items = [
    ...menuItems,
    ...(
      includePackaging
        ? buildPackagingItems(order)
        : []
    ),
  ];

  const itemsCost =
    items.reduce(
      (sum, item) =>
        sum + itemCost(item),
      0
    );

  const phoneNumber =
    normalizePhone(
      order.customerPhone
    );

  if (!phoneNumber) {
    throw new Error(
      "Delever order uchun telefon raqami topilmadi"
    );
  }

  const deliveryInfo = {
    clientName:
      cleanText(
        order.customerName
      ),

    phoneNumber,

    /*
     * V2 schema bo'yicha deliveryAddress majburiy.
     * Takeaway orderda ham obyekt yuboriladi.
     */
    deliveryAddress:
      buildDeliveryAddress(order),
  };

  const arrivalMinutes =
    Math.max(
      0,
      Number(
        process.env
          .DELEVER_ARRIVAL_MINUTES
      ) || 0
    );

  if (arrivalMinutes > 0) {
    deliveryInfo
      .courierArrivementDate =
      new Date(
        Date.now() +
          arrivalMinutes *
            60 *
            1000
      ).toISOString();
  }

  const commentPrefix =
    cleanText(
      options.commentPrefix
    );

  const defaultComment =
    `Telegram Web App buyurtmasi #${externalId}`;

  const comment = [
    commentPrefix,
    defaultComment,
  ]
    .filter(Boolean)
    .join(" — ");

  const paymentInfo = {
    itemsCost,
    paymentType:
      paymentTypeForDelever(
        order
      ),
  };

  const sendDeliveryCost =
    boolEnv(
      "DELEVER_SEND_DELIVERY_COST",
      false
    );

  if (sendDeliveryCost) {
    paymentInfo.deliveryFee =
      positiveNumber(
        order.deliveryPrice,
        0
      );
  }

  const payload = {
    platform:
      cleanText(
        process.env
          .DELEVER_PLATFORM ||
          "BOT"
      ),

    discriminator:
      discriminatorForDelever(
        order
      ),

    eatsId:
      externalId,

    restaurantId,

    deliveryInfo,

    paymentInfo,

    items,

    persons:
      Math.max(
        1,
        Math.floor(
          Number(order.persons) ||
            1
        )
      ),

    comment,

    promos:
      buildOrderPromos(order),
  };

  if (
    cleanText(order.preOrderTime)
  ) {
    payload.preOrderTime =
      cleanText(
        order.preOrderTime
      );
  }

  if (
    cleanText(order.kitchenSentTime)
  ) {
    payload.kitchenSentTime =
      cleanText(
        order.kitchenSentTime
      );
  }

  return payload;
};

const extractDeleverOrderId = (
  response
) => {
  const candidates = [
    response?.orderId,
    response?.order_id,
    response?.id,

    response?.data?.orderId,
    response?.data?.order_id,
    response?.data?.id,

    response?.result?.orderId,
    response?.result?.order_id,
    response?.result?.id,
  ];

  const value =
    candidates.find(
      (item) =>
        item !== undefined &&
        item !== null &&
        item !== ""
    );

  return value === undefined
    ? ""
    : String(value);
};

const mapDeleverStatus = (
  rawStatus
) => {
  const value = cleanText(
    rawStatus
  ).toUpperCase();

  if (!value) {
    return null;
  }

  if (
    [
      "CANCELLED",
      "CANCELED",
      "REJECTED",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "cancelled";
  }

  if (
    [
      "DELIVERED",
      "COMPLETED",
      "COMPLETE",
      "DONE",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "delivered";
  }

  if (
    [
      "TAKEN_BY_COURIER",
      "ON_WAY",
      "ONWAY",
      "COURIER",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "on_way";
  }

  if (
    [
      "PREPARING",
      "COOKING",
      "ACCEPTED",
      "READY",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "preparing";
  }

  if (
    [
      "NEW",
      "CREATED",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "new";
  }

  return null;
};

module.exports = {
  buildDeleverOrderPayload,
  extractDeleverOrderId,
  mapDeleverStatus,
};
