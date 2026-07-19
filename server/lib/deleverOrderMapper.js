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
  String(value || "").trim();

const positiveNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return fallback;
  }

  return number;
};

const normalizePhone = (value) => {
  const raw =
    cleanText(value);

  const digits =
    raw.replace(/[^0-9]/g, "");

  if (!digits) {
    return raw;
  }

  return `+${digits}`;
};

const paymentTypeForDelever = (
  order
) => {
  const key = String(
    order.paymentType ||
      order.paymentProvider ||
      "cash"
  )
    .trim()
    .toUpperCase();

  return cleanText(
    process.env[
      `DELEVER_PAYMENT_TYPE_${key}`
    ] ||
      (
        key === "CASH"
          ? "cash"
          : "card"
      )
  );
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

      price:
        positiveNumber(
          modifier.deleverBasePrice ??
            modifier.price,
          0
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
    }))
    .filter(
      (modifier) =>
        modifier.id
    );

const getRestaurantIdForOrder = (
  order
) =>
  cleanText(
    process.env.DELEVER_ORDER_RESTAURANT_ID ||
      order.deleverOrderRestaurantId ||
      order.deleverRestaurantId ||
      process.env.DELEVER_RESTAURANT_ID
  );

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

  /*
   * Eski orderlarda deleverBasePrice bo'lmasa,
   * public price'dan packagingFee ayriladi.
   */
  return Math.max(
    0,
    publicPrice -
      packagingFee
  );
};

const itemCost = (item) => {
  const quantity =
    Math.max(
      1,
      Math.floor(
        Number(item.quantity) || 1
      )
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
            Math.max(
              1,
              Math.floor(
                Number(
                  modifier.quantity
                ) || 1
              )
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

  /*
   * Turli packagingFee bo'lsa, har bir narx
   * bo'yicha alohida item hosil qilinadi.
   */
  const grouped =
    new Map();

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
          Number(
            item.quantity
          ) || 1
        )
      );

    grouped.set(
      fee,
      (
        grouped.get(fee) ||
        0
      ) + quantity
    );
  }

  return [
    ...grouped.entries(),
  ].map(
    ([
      price,
      quantity,
    ]) => ({
      id: productId,
      name: productName,
      price,
      quantity,
      modifications: [],
    })
  );
};

/*
 * Delever rasmiy hujjatidagi minimal order modeli:
 *
 * comment
 * deliveryInfo.clientName
 * deliveryInfo.courierArrivementDate (optional)
 * deliveryInfo.phoneNumber
 * items[].id/name/price/quantity/modifications
 * paymentInfo.itemsCost/paymentType
 * persons
 * restaurantId
 *
 * Bu payloadga externalOrderId, platform, orderType,
 * address, coordinates, deliveryCost, isPaid, crmId
 * yoki crmField qo'shilmaydi.
 */
const buildDeleverOrderPayload = (
  order,
  options = {}
) => {
  const config =
    getConfig();

  const restaurantId =
    getRestaurantIdForOrder(
      order
    ) ||
    config.restaurantId;

  if (!restaurantId) {
    throw new Error(
      "Delever Restaurant ID topilmadi"
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
        const id =
          cleanText(
            item.deleverProductId ||
              item.foodId
          );

        const price =
          getItemBasePrice(
            item
          );

        if (!id) {
          return null;
        }

        if (price <= 0) {
          throw new Error(
            `${item.title || "Taom"} uchun Delever asl narxi topilmadi`
          );
        }

        return {
          id,

          name:
            cleanText(
              item.deleverTitle ||
                item.title ||
                "Taom"
            ),

          price,

          quantity:
            Math.max(
              1,
              Math.floor(
                Number(
                  item.quantity
                ) || 1
              )
            ),

          modifications:
            mapModifiers(
              item.modifiers ||
                []
            ),
        };
      })
      .filter(Boolean);

  if (!menuItems.length) {
    throw new Error(
      "Deleverga yuboriladigan taomlar topilmadi"
    );
  }

  const includePackaging =
    options
      .includePackagingItem ===
    undefined
      ? true
      : Boolean(
          options
            .includePackagingItem
        );

  const packagingItems =
    includePackaging
      ? buildPackagingItems(
          order
        )
      : [];

  const items = [
    ...menuItems,
    ...packagingItems,
  ];

  const itemsCost =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        itemCost(item),
      0
    );

  const externalId =
    cleanText(
      order._id ||
        order.deleverExternalId
    );

  const deliveryInfo = {
    clientName:
      cleanText(
        order.customerName
      ),

    phoneNumber:
      normalizePhone(
        order.customerPhone
      ),
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
    externalId
      ? `Telegram Web App buyurtmasi #${externalId}`
      : "Telegram Web App buyurtmasi";

  const comment = [
    commentPrefix,
    defaultComment,
  ]
    .filter(Boolean)
    .join(" — ");

  return {
    comment,

    deliveryInfo,

    items,

    paymentInfo: {
      itemsCost,

      paymentType:
        paymentTypeForDelever(
          order
        ),
    },

    persons:
      Math.max(
        1,
        Math.floor(
          Number(
            order.persons
          ) || 1
        )
      ),

    restaurantId,
  };
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
  const value =
    cleanText(
      rawStatus
    ).toLowerCase();

  if (!value) {
    return null;
  }

  if (
    [
      "cancelled",
      "canceled",
      "rejected",
      "отменен",
      "отменён",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "cancelled";
  }

  if (
    [
      "delivered",
      "completed",
      "complete",
      "done",
      "доставлен",
      "завершен",
      "завершён",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "delivered";
  }

  if (
    [
      "on_way",
      "onway",
      "courier",
      "delivery",
      "в пути",
      "курьер",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "on_way";
  }

  if (
    [
      "preparing",
      "cooking",
      "accepted",
      "готов",
      "принят",
    ].some(
      (item) =>
        value.includes(item)
    )
  ) {
    return "preparing";
  }

  if (
    [
      "new",
      "created",
      "новый",
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
