const { tryLock } = require("../lib/redis");
const { getPublicConfig } = require("../integrations/delever");
const { syncDeleverMenu } = require("./deleverMenuSync");
const { retryPendingDeleverOrders } = require("./deleverOrderSync");

const MENU_INTERVAL_MS = Math.max(60_000, Number(process.env.DELEVER_MENU_SYNC_INTERVAL_MS) || 5 * 60_000);
const ORDER_RETRY_INTERVAL_MS = Math.max(60_000, Number(process.env.DELEVER_ORDER_RETRY_INTERVAL_MS) || 60_000);

const canRun = () => {
  const config = getPublicConfig();
  return config.enabled && config.configured;
};

const runDeleverMenuJob = async () => {
  if (!canRun()) return { skipped: true, reason: "disabled_or_not_configured" };
  const lockTtl = Math.max(30, Math.floor(MENU_INTERVAL_MS / 1000) - 5);
  if (!await tryLock("lock:delever:menu-sync", lockTtl)) return { skipped: true, reason: "locked" };
  try {
    const result = await syncDeleverMenu();
    console.log("✅ Delever menu sync:", JSON.stringify(result));
    return result;
  } catch (error) {
    console.error("Delever menu job xato:", error.message);
    return { success: false, error: error.message };
  }
};

const runDeleverOrderRetryJob = async () => {
  if (!canRun()) return { skipped: true, reason: "disabled_or_not_configured" };
  const lockTtl = Math.max(30, Math.floor(ORDER_RETRY_INTERVAL_MS / 1000) - 5);
  if (!await tryLock("lock:delever:order-retry", lockTtl)) return { skipped: true, reason: "locked" };
  try {
    const result = await retryPendingDeleverOrders();
    if (result.found) console.log("✅ Delever order retry:", JSON.stringify(result));
    return result;
  } catch (error) {
    console.error("Delever order retry job xato:", error.message);
    return { success: false, error: error.message };
  }
};

const startDeleverJobs = () => {
  if (!canRun()) {
    const config = getPublicConfig();
    if (config.enabled) console.warn("⚠️ Delever yoqilgan, lekin barcha env sozlamalari to'liq emas.");
    return [];
  }

  console.log(`⚙️ Delever jobs: menu ${Math.round(MENU_INTERVAL_MS / 1000)}s, order retry ${Math.round(ORDER_RETRY_INTERVAL_MS / 1000)}s`);
  const timers = [
    setInterval(runDeleverMenuJob, MENU_INTERVAL_MS),
    setInterval(runDeleverOrderRetryJob, ORDER_RETRY_INTERVAL_MS),
  ];
  timers.forEach(timer => timer.unref?.());

  // Server ishga tushgach bir oz kutib, birinchi syncni bajaradi.
  const initial = setTimeout(() => {
    runDeleverMenuJob();
    runDeleverOrderRetryJob();
  }, 5000);
  initial.unref?.();
  timers.push(initial);
  return timers;
};

module.exports = {
  MENU_INTERVAL_MS,
  ORDER_RETRY_INTERVAL_MS,
  runDeleverMenuJob,
  runDeleverOrderRetryJob,
  startDeleverJobs,
};
