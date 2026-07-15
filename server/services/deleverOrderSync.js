const Order = require("../models/Order");
const { getConfig, createOrder, getOrderStatus } = require("../integrations/delever");
const {
  buildDeleverOrderPayload,
  extractDeleverOrderId,
  mapDeleverStatus,
} = require("../lib/deleverOrderMapper");

const orderIsEligible = (order) => {
  if (!order || ["cancelled", "delivered"].includes(order.status)) return false;
  if (order.paymentType === "cash") return order.orderType === "pickup";
  return order.paymentStatus === "paid";
};

const syncOrderToDelever = async (orderOrId, { force = false } = {}) => {
  const config = getConfig();
  if (!config.orderEnabled) {
    return {
      skipped: true,
      reason: "DELEVER_ORDER_ENABLED=false",
    };
  }

  const orderId = String(orderOrId?._id || orderOrId || "");
  if (!orderId) throw new Error("Buyurtma ID berilmagan");

  const existing = await Order.findById(orderId);
  if (!existing) throw new Error("Buyurtma topilmadi");
  if (existing.deleverOrderId) {
    return { skipped: true, reason: "already_synced", deleverOrderId: existing.deleverOrderId };
  }
  if (!orderIsEligible(existing)) {
    return { skipped: true, reason: "order_not_eligible" };
  }

  const now = new Date();
  const claimFilter = {
    _id: existing._id,
    $or: [
      { deleverOrderId: { $exists: false } },
      { deleverOrderId: null },
      { deleverOrderId: "" },
    ],
  };
  if (!force) {
    claimFilter.deleverSyncStatus = { $in: ["pending", "failed"] };
    claimFilter.$and = [{
      $or: [
        { deleverNextRetryAt: null },
        { deleverNextRetryAt: { $exists: false } },
        { deleverNextRetryAt: { $lte: now } },
      ],
    }];
  } else {
    claimFilter.deleverSyncStatus = { $in: ["pending", "failed", "syncing", "not_required"] };
  }

  const claimed = await Order.findOneAndUpdate(
    claimFilter,
    {
      $set: {
        deleverSyncStatus: "syncing",
        deleverSyncError: "",
        deleverLastAttemptAt: now,
        deleverExternalId: orderId,
      },
      $inc: { deleverAttempts: 1 },
    },
    { new: true }
  );

  if (!claimed) {
    const current = await Order.findById(orderId).select("deleverOrderId deleverSyncStatus deleverNextRetryAt");
    return {
      skipped: true,
      reason: current?.deleverOrderId ? "already_synced" : "sync_in_progress_or_waiting",
      deleverOrderId: current?.deleverOrderId || "",
      syncStatus: current?.deleverSyncStatus || "",
    };
  }

  try {
    const payload = buildDeleverOrderPayload(claimed);
    const response = await createOrder(payload);
    const deleverOrderId = extractDeleverOrderId(response);
    if (!deleverOrderId) {
      throw new Error("Delever javobida orderId topilmadi");
    }

    await Order.updateOne(
      { _id: claimed._id },
      {
        $set: {
          deleverOrderId,
          deleverSyncStatus: "success",
          deleverSyncError: "",
          deleverNextRetryAt: null,
          deleverSyncedAt: new Date(),
          deleverRawResponse: response,
        },
      }
    );
    return { success: true, deleverOrderId, response };
  } catch (error) {
    const attempts = Math.max(1, Number(claimed.deleverAttempts) || 1);
    const retryMinutes = Math.min(60, Math.pow(2, Math.min(attempts - 1, 5)));
    const nextRetryAt = new Date(Date.now() + retryMinutes * 60 * 1000);
    await Order.updateOne(
      { _id: claimed._id },
      {
        $set: {
          deleverSyncStatus: "failed",
          deleverSyncError: String(error.message || "Delever xatosi").slice(0, 1000),
          deleverNextRetryAt: nextRetryAt,
          deleverRawResponse: error.response || null,
        },
      }
    );
    console.error(`Delever order sync xato (${claimed._id}):`, error.message);
    return { success: false, error: error.message, nextRetryAt };
  }
};

const retryPendingDeleverOrders = async ({ limit } = {}) => {
  const config = getConfig();
  if (!config.orderEnabled) {
    return {
      skipped: true,
      reason: "DELEVER_ORDER_ENABLED=false",
    };
  };

  const now = new Date();
  const max = Math.max(1, Math.min(100, Number(limit) || Number(process.env.DELEVER_RETRY_BATCH_SIZE) || 20));
  const orders = await Order.find({
    status: { $nin: ["cancelled", "delivered"] },
    deleverSyncStatus: { $in: ["pending", "failed"] },
    $and: [
      {
        $or: [
          { paymentType: "cash", orderType: "pickup" },
          { paymentStatus: "paid" },
        ],
      },
      {
        $or: [
          { deleverNextRetryAt: null },
          { deleverNextRetryAt: { $exists: false } },
          { deleverNextRetryAt: { $lte: now } },
        ],
      },
    ],
  }).sort({ createdAt: 1 }).limit(max).select("_id");

  let success = 0;
  let failed = 0;
  let skipped = 0;
  for (const order of orders) {
    const result = await syncOrderToDelever(order._id);
    if (result.success) success += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;
  }
  return { found: orders.length, success, failed, skipped };
};

const refreshDeleverOrderStatus = async (orderOrId) => {
  const orderId = String(orderOrId?._id || orderOrId || "");
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Buyurtma topilmadi");
  if (!order.deleverOrderId) return { skipped: true, reason: "delever_order_id_missing" };

  const response = await getOrderStatus(order.deleverOrderId);
  const rawStatus = response?.status || response?.data?.status || response?.result?.status || "";
  const localStatus = mapDeleverStatus(rawStatus);
  const update = { deleverStatus: String(rawStatus || ""), deleverRawResponse: response };
  if (localStatus && order.status !== "cancelled") update.status = localStatus;
  await Order.updateOne({ _id: order._id }, { $set: update });
  return { success: true, rawStatus, localStatus, response };
};

module.exports = {
  buildDeleverOrderPayload,
  extractDeleverOrderId,
  orderIsEligible,
  syncOrderToDelever,
  retryPendingDeleverOrders,
  mapDeleverStatus,
  refreshDeleverOrderStatus,
};
