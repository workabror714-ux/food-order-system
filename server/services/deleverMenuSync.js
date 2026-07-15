const Food = require("../models/Food");
const IntegrationState = require("../models/IntegrationState");
const {
  getConfig,
  getMenuComposition,
  getMenuAvailability,
} = require("../integrations/delever");
const {
  normalizeComposition,
  availabilityCollections,
  availabilityValue,
  availabilityId,
} = require("../lib/deleverMenuMapper");

const setState = async (restaurantId, update) => IntegrationState.findOneAndUpdate(
  { provider: "delever", resource: "menu", restaurantId },
  { $set: update, $setOnInsert: { provider: "delever", resource: "menu", restaurantId } },
  { upsert: true, new: true }
);

const syncDeleverMenu = async ({ restaurantId, force = false } = {}) => {
  const config = getConfig();
  const id = restaurantId || config.restaurantId;
  if (!config.enabled) return { skipped: true, reason: "DELEVER_ENABLED=false" };
  if (!id) throw new Error("DELEVER_RESTAURANT_ID kiritilmagan");

  const startedAt = new Date();
  await setState(id, { status: "running", lastStartedAt: startedAt, lastError: "" });

  try {
    const compositionRaw = await getMenuComposition(id);
    const normalized = normalizeComposition(compositionRaw, id);
    const previous = await IntegrationState.findOne({ provider: "delever", resource: "menu", restaurantId: id }).lean();

    // lastChange o'zgarmagan bo'lsa ham availability tekshiriladi. `force` composition upsertni majburlaydi.
    const compositionChanged = force || !normalized.lastChange || normalized.lastChange !== previous?.lastSourceChange;
    let upserted = 0;
    let modified = 0;
    let hidden = 0;

    if (compositionChanged) {
      if (!normalized.products.length) {
        throw new Error("Delever menyu javobidan birorta ham yaroqli taom topilmadi. Raw formatni tekshirish kerak.");
      }

      const now = new Date();
      const operations = normalized.products.map(product => {
        const { isAvailable, ...productFields } = product;
        const setFields = {
          ...productFields,
          source: "delever",
          isDeletedInSource: false,
          lastSyncedAt: now,
        };
        if (typeof isAvailable === "boolean") setFields.isAvailable = isAvailable;
        return {
          updateOne: {
            filter: { deleverId: product.deleverId },
            update: {
              $set: setFields,
              $setOnInsert: { isAvailable: typeof isAvailable === "boolean" ? isAvailable : true },
            },
            upsert: true,
          },
        };
      });
      const result = await Food.bulkWrite(operations, { ordered: false });
      upserted = result.upsertedCount || 0;
      modified = result.modifiedCount || 0;

      const activeIds = normalized.products.map(p => p.deleverId);
      const hiddenResult = await Food.updateMany(
        {
          source: "delever",
          deleverRestaurantId: id,
          deleverId: { $nin: activeIds },
          isDeletedInSource: { $ne: true },
        },
        {
          $set: {
            isDeletedInSource: true,
            isAvailable: false,
            lastSyncedAt: now,
          },
        }
      );
      hidden = hiddenResult.modifiedCount || 0;
    }

    let availabilityUpdated = 0;
    let modifierCount = 0;
    try {
      const availabilityRaw = await getMenuAvailability(id);
      const availability = availabilityCollections(availabilityRaw);
      const itemOps = availability.items
        .map(entry => ({ id: availabilityId(entry, "item"), available: availabilityValue(entry) }))
        .filter(entry => entry.id)
        .map(entry => ({
          updateOne: {
            filter: { deleverId: entry.id, deleverRestaurantId: id },
            update: { $set: { isAvailable: entry.available, lastSyncedAt: new Date() } },
          },
        }));
      if (itemOps.length) {
        const result = await Food.bulkWrite(itemOps, { ordered: false });
        availabilityUpdated = result.modifiedCount || 0;
      }

      const modifierMap = {};
      for (const modifier of availability.modifiers) {
        const modifierId = availabilityId(modifier, "modifier");
        if (modifierId) modifierMap[modifierId] = availabilityValue(modifier);
      }
      modifierCount = Object.keys(modifierMap).length;
      if (modifierCount) {
        await Food.updateMany(
          { source: "delever", deleverRestaurantId: id, isDeletedInSource: { $ne: true } },
          { $set: { deleverModifierAvailability: modifierMap } }
        );
      }
    } catch (availabilityError) {
      // Composition muvaffaqiyatli bo'lsa menyuni butunlay yiqitmaymiz.
      console.error("Delever availability sync xato:", availabilityError.message);
    }

    const summary = {
      restaurantId: id,
      compositionChanged,
      productsReceived: normalized.products.length,
      categoriesReceived: normalized.categories.length,
      skippedProducts: normalized.skipped.length,
      upserted,
      modified,
      hidden,
      availabilityUpdated,
      modifierAvailabilityReceived: modifierCount,
    };
    await setState(id, {
      status: "success",
      lastSourceChange: normalized.lastChange,
      lastSyncedAt: new Date(),
      lastError: "",
      summary,
    });
    return summary;
  } catch (error) {
    await setState(id, {
      status: "failed",
      lastError: error.message,
      summary: error.response ? { response: error.response } : null,
    }).catch(() => {});
    throw error;
  }
};

module.exports = { syncDeleverMenu };
