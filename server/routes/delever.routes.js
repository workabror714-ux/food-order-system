const router = require("express").Router();
const { auth, superAdmin } = require("../middleware/auth");
const Food = require("../models/Food");
const Order = require("../models/Order");
const IntegrationState = require("../models/IntegrationState");
const {
  getPublicConfig,
  getAccessToken,
  getRestaurants,
} = require("../integrations/delever");
const { syncDeleverMenu } = require("../services/deleverMenuSync");
const {
  syncOrderToDelever,
  retryPendingDeleverOrders,
  refreshDeleverOrderStatus,
} = require("../services/deleverOrderSync");

router.get("/api/admin/delever/status", auth, superAdmin, async (req, res) => {
  try {
    const config = getPublicConfig();
    const [menuState, syncedFoods, pendingOrders, failedOrders] = await Promise.all([
      IntegrationState.findOne({
        provider: "delever",
        resource: "menu",
        restaurantId: config.restaurantId,
      }).lean(),
      Food.countDocuments({ source: "delever", isDeletedInSource: { $ne: true } }),
      Order.countDocuments({ deleverSyncStatus: { $in: ["pending", "syncing"] } }),
      Order.countDocuments({ deleverSyncStatus: "failed" }),
    ]);

    res.json({
      config,
      menu: menuState || null,
      counts: { syncedFoods, pendingOrders, failedOrders },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/admin/delever/test-token", auth, superAdmin, async (req, res) => {
  try {
    const token = await getAccessToken({ force: true });
    res.json({ success: true, tokenReceived: Boolean(token) });
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
      code: error.code || "DELEVER_ERROR",
      response: error.response || null,
    });
  }
});

router.get("/api/admin/delever/restaurants", auth, superAdmin, async (req, res) => {
  try {
    res.json(await getRestaurants());
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
      code: error.code || "DELEVER_ERROR",
      response: error.response || null,
    });
  }
});

router.post("/api/admin/delever/sync-menu", auth, superAdmin, async (req, res) => {
  try {
    const result = await syncDeleverMenu({ force: req.body?.force !== false });
    res.json({ success: true, result });
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
      code: error.code || "DELEVER_ERROR",
      response: error.response || null,
    });
  }
});

router.post("/api/admin/delever/orders/retry", auth, superAdmin, async (req, res) => {
  try {
    const result = await retryPendingDeleverOrders({ limit: req.body?.limit });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/api/admin/delever/orders/:id/retry", auth, superAdmin, async (req, res) => {
  try {
    const result = await syncOrderToDelever(req.params.id, { force: true });
    res.status(result.success || result.skipped ? 200 : 502).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/api/admin/delever/orders/:id/refresh-status", auth, superAdmin, async (req, res) => {
  try {
    const result = await refreshDeleverOrderStatus(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
      response: error.response || null,
    });
  }
});

module.exports = router;
