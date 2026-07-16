const { getConfig } = require("../integrations/delever");

const boolEnv = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const normalizePhone = (value) => {
  const digits = String(value || "")
    .replace(/[^0-9]/g, "");

  if (!digits) return "";

  // 90 123 45 67 kabi 9 xonali raqam
  if (digits.length === 9) {
    return `+998${digits}`;
  }

  // 998901234567
  if (digits.startsWith("998")) {
    return `+${digits}`;
  }

  return `+${digits}`;
};

const paymentTypeForDelever = (order) => {
  const key = String(order.paymentType || order.paymentProvider || "cash").toUpperCase();
  return String(process.env[`DELEVER_PAYMENT_TYPE_${key}`] || (key === "CASH" ? "cash" : "card"));
};

const orderTypeForDelever = (order) => String(
  order.orderType === "pickup"
    ? (process.env.DELEVER_ORDER_TYPE_PICKUP || "pickup")
    : (process.env.DELEVER_ORDER_TYPE_DELIVERY || "delivery")
);

const modifierId = (modifier) => String(
  modifier?.deleverModifierId || modifier?.modifierId || modifier?.id || ""
).trim();

const mapModifiers = (modifiers = []) =>
  modifiers
    .filter(Boolean)
    .map((modifier) => {
      const crmId = modifierId(modifier);

      return {
        // Delever/CRM uchun asosiy identifikator
        crmId,
        // Eski format bilan moslik uchun qoldiramiz
        id: crmId,

        name: String(
          modifier.name ||
          modifier.title ||
          ""
        ),

        price:
          Number(modifier.price) || 0,

        quantity: Math.max(
          1,
          Math.floor(
            Number(modifier.quantity) || 1
          )
        ),
      };
    })
    .filter((modifier) => modifier.crmId);

const getRestaurantIdForOrder = (order) => String(
  order.deleverRestaurantId || process.env.DELEVER_RESTAURANT_ID || ""
).trim();

const buildDeleverOrderPayload = (order) => {
  const config = getConfig();
  const restaurantId = getRestaurantIdForOrder(order) || config.restaurantId;
  if (!restaurantId) throw new Error("Delever Restaurant ID topilmadi");

  const requireExternalItems = boolEnv("DELEVER_REQUIRE_EXTERNAL_ITEMS", true);
  const missing = (order.items || []).filter(item => !String(item.deleverProductId || "").trim());
  if (requireExternalItems && missing.length) {
    const names = missing.map(item => item.title || item.foodId).join(", ");
    throw new Error(`Delever ID biriktirilmagan taomlar: ${names}. Avval menyuni sinxronlashtiring.`);
  }

  const items = (order.items || []).map(
    (item) => {
      const crmId = String(
        item.deleverProductId ||
        item.foodId ||
        ""
      ).trim();
  
      if (!crmId) {
        throw new Error(
          `${item.title || "Taom"} uchun crmId topilmadi`
        );
      }
  
      return {
        // Delever aynan crmId yoki crmField talab qilmoqda
        crmId,
  
        // Eski format bilan moslik uchun qoldiramiz
        id: crmId,
  
        name: String(
          item.title || "Taom"
        ),
  
        price:
          Number(item.price) || 0,
  
        quantity: Math.max(
          1,
          Math.floor(
            Number(item.quantity) || 1
          )
        ),
  
        modifications: mapModifiers(
          item.modifiers || []
        ),
      };
    }
  );

  const externalId = String(order._id);
  const arrivalMinutes = Math.max(0, Number(process.env.DELEVER_ARRIVAL_MINUTES) || 0);
  const arrivalDate = arrivalMinutes ? new Date(Date.now() + arrivalMinutes * 60 * 1000).toISOString() : undefined;

  const deliveryInfo = {
    clientName: String(order.customerName || ""),
    phoneNumber: normalizePhone(order.customerPhone),
    orderType: orderTypeForDelever(order),
  };
  if (order.address) deliveryInfo.address = String(order.address);
  if (order.location?.lat !== undefined && order.location?.lng !== undefined) {
    deliveryInfo.latitude = Number(order.location.lat);
    deliveryInfo.longitude = Number(order.location.lng);
  }
  if (arrivalDate) deliveryInfo.courierArrivementDate = arrivalDate;

  const payload = {
    externalOrderId: externalId,
    comment: `Telegram Web App buyurtmasi #${externalId}`,
    deliveryInfo,
    items,
    paymentInfo: {
      itemsCost: Number(order.totalPrice) || 0,
      deliveryCost: boolEnv(
        "DELEVER_SEND_DELIVERY_COST",
        false
      )
        ? Number(order.deliveryPrice) || 0
        : 0,
      paymentType: paymentTypeForDelever(order),
      isPaid: order.paymentType === "cash" ? false : order.paymentStatus === "paid",
    },
    persons: Math.max(1, Number(order.persons) || 1),
    platform: config.platform || "BOT",
    restaurantId,
  };

  if (!boolEnv("DELEVER_INCLUDE_EXTERNAL_ID", true)) delete payload.externalOrderId;
  return payload;
};

const extractDeleverOrderId = (response) => {
  const candidates = [
    response?.orderId, response?.order_id, response?.id,
    response?.data?.orderId, response?.data?.order_id, response?.data?.id,
    response?.result?.orderId, response?.result?.order_id, response?.result?.id,
  ];
  const value = candidates.find(item => item !== undefined && item !== null && item !== "");
  return value === undefined ? "" : String(value);
};

const mapDeleverStatus = (rawStatus) => {
  const value = String(rawStatus || "").trim().toLowerCase();
  if (!value) return null;
  if (["cancelled", "canceled", "rejected", "отменен", "отменён"].some(x => value.includes(x))) return "cancelled";
  if (["delivered", "completed", "complete", "done", "доставлен", "завершен", "завершён"].some(x => value.includes(x))) return "delivered";
  if (["on_way", "onway", "courier", "delivery", "в пути", "курьер"].some(x => value.includes(x))) return "on_way";
  if (["preparing", "cooking", "accepted", "готов", "принят"].some(x => value.includes(x))) return "preparing";
  if (["new", "created", "новый"].some(x => value.includes(x))) return "new";
  return null;
};

module.exports = {
  buildDeleverOrderPayload,
  extractDeleverOrderId,
  mapDeleverStatus,
};
