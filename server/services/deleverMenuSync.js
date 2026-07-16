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

const getDeleverItemMarkup = () => {
  const value = Number(
    process.env.DELEVER_ITEM_MARKUP ?? 5000
  );

  if (!Number.isFinite(value) || value < 0) {
    return 5000;
  }

  return Math.round(value);
};

const cleanText = (value) =>
  String(value || "").trim();

const setState = async (restaurantId, update) =>
  IntegrationState.findOneAndUpdate(
    {
      provider: "delever",
      resource: "menu",
      restaurantId,
    },
    {
      $set: update,
      $setOnInsert: {
        provider: "delever",
        resource: "menu",
        restaurantId,
      },
    },
    {
      upsert: true,
      new: true,
    }
  );

const hasValidAvailabilityShape = (payload) => {
  const possibleArrays = [
    payload?.items,
    payload?.products,
    payload?.dishes,
    payload?.availability,
    payload?.data?.items,
    payload?.data?.products,
    payload?.data?.dishes,
    payload?.data?.availability,
    payload?.result?.items,
    payload?.result?.products,
    payload?.result?.dishes,
    payload?.result?.availability,
  ];

  return possibleArrays.some(Array.isArray);
};

/*
 * Incoming tarjima bo'lmasa:
 * - eski haqiqiy tarjima saqlanadi;
 * - eski qiymat ruscha fallback bo'lgan bo'lsa, yangi ruscha matn bilan yangilanadi;
 * - yangi itemda esa ruscha matn fallback bo'ladi.
 *
 * Incoming Delever tarjimasi bo'lsa, u doim ustun.
 */
const manualFlagName = (field, language) => {
  const suffix = language === "uz" ? "Uz" : "En";
  return `${field}${suffix}`;
};

const mergeLocalizedField = ({
  field,
  incoming,
  existing,
  translationManual,
}) => {
  const incomingValue = incoming || {};
  const existingValue = existing || {};
  const manual = translationManual || {};

  const source = cleanText(
    incomingValue.ru ||
      incomingValue.uz ||
      incomingValue.en ||
      existingValue.ru ||
      existingValue.uz ||
      existingValue.en
  );

  const previousSource = cleanText(
    existingValue.ru ||
      existingValue.uz ||
      existingValue.en
  );

  const resolveLanguage = (language) => {
    const old = cleanText(existingValue[language]);

    if (
      manual[manualFlagName(field, language)] === true &&
      old
    ) {
      return old;
    }

    const explicit = cleanText(incomingValue[language]);

    if (explicit) {
      return explicit;
    }

    if (old && old !== previousSource) {
      return old;
    }

    return source;
  };

  return {
    uz: resolveLanguage("uz"),
    ru: cleanText(incomingValue.ru) || source,
    en: resolveLanguage("en"),
  };
};

const countExplicitTranslations = (products) => {
  const counts = {
    titleUz: 0,
    titleEn: 0,
    categoryUz: 0,
    categoryEn: 0,
    descriptionUz: 0,
    descriptionEn: 0,
  };

  for (const product of products) {
    if (cleanText(product.title?.uz)) counts.titleUz += 1;
    if (cleanText(product.title?.en)) counts.titleEn += 1;
    if (cleanText(product.category?.uz)) counts.categoryUz += 1;
    if (cleanText(product.category?.en)) counts.categoryEn += 1;
    if (cleanText(product.description?.uz)) {
      counts.descriptionUz += 1;
    }
    if (cleanText(product.description?.en)) {
      counts.descriptionEn += 1;
    }
  }

  return counts;
};

const syncDeleverMenu = async ({
  restaurantId,
  force = false,
} = {}) => {
  const config = getConfig();
  const id = restaurantId || config.restaurantId;

  if (!config.enabled) {
    return {
      skipped: true,
      reason: "DELEVER_ENABLED=false",
    };
  }

  if (!id) {
    throw new Error("DELEVER_RESTAURANT_ID kiritilmagan");
  }

  await setState(id, {
    status: "running",
    lastStartedAt: new Date(),
    lastError: "",
  });

  try {
    const compositionRaw =
      await getMenuComposition(id);

    const normalized = normalizeComposition(
      compositionRaw,
      id
    );

    const previous = await IntegrationState.findOne({
      provider: "delever",
      resource: "menu",
      restaurantId: id,
    }).lean();

    const compositionChanged =
      force ||
      !normalized.lastChange ||
      normalized.lastChange !== previous?.lastSourceChange;

    let upserted = 0;
    let modified = 0;
    let hidden = 0;
    let productsWithImage = 0;
    let productsWithoutImage = 0;

    const explicitTranslations =
      countExplicitTranslations(normalized.products);

    if (compositionChanged) {
      if (!normalized.products.length) {
        throw new Error(
          "Delever menyu javobidan birorta ham yaroqli taom topilmadi."
        );
      }

      const now = new Date();
      const itemMarkup = getDeleverItemMarkup();

      productsWithImage = normalized.products.filter(
        (product) => cleanText(product.image)
      ).length;

      productsWithoutImage =
        normalized.products.length - productsWithImage;

      const incomingIds = normalized.products.map(
        (product) => product.deleverId
      );

      const existingFoods = await Food.find({
        source: "delever",
        deleverRestaurantId: id,
        deleverId: {
          $in: incomingIds,
        },
      })
        .select(
          "deleverId title category description translationManual"
        )
        .lean();

      const existingMap = new Map(
        existingFoods.map((food) => [
          String(food.deleverId),
          food,
        ])
      );

      const operations = normalized.products.map(
        (product) => {
          const existing = existingMap.get(
            String(product.deleverId)
          );

          const {
            isAvailable,
            price: incomingBasePrice,
            title,
            category,
            description,
            ...productFields
          } = product;

          const deleverBasePrice = Math.max(
            0,
            Number(incomingBasePrice) || 0
          );

          const setFields = {
            ...productFields,

            title: mergeLocalizedField({
              field: "title",
              incoming: title,
              existing: existing?.title,
              translationManual: existing?.translationManual,
            }),

            category: mergeLocalizedField({
              field: "category",
              incoming: category,
              existing: existing?.category,
              translationManual: existing?.translationManual,
            }),

            description: mergeLocalizedField({
              field: "description",
              incoming: description,
              existing: existing?.description,
              translationManual: existing?.translationManual,
            }),

            deleverBasePrice,
            packagingFee: itemMarkup,
            price: deleverBasePrice + itemMarkup,
            source: "delever",
            isDeletedInSource: false,
            lastSyncedAt: now,
            translationError: "",
          };

          if (typeof isAvailable === "boolean") {
            setFields.isAvailable = isAvailable;
          }

          return {
            updateOne: {
              filter: {
                deleverId: product.deleverId,
                deleverRestaurantId: id,
              },
              update: {
                $set: setFields,
                $setOnInsert: {
                  isAvailable:
                    typeof isAvailable === "boolean"
                      ? isAvailable
                      : true,
                },
              },
              upsert: true,
            },
          };
        }
      );

      const result = await Food.bulkWrite(
        operations,
        {
          ordered: false,
        }
      );

      upserted = result.upsertedCount || 0;
      modified = result.modifiedCount || 0;

      const activeIds = normalized.products.map(
        (product) => product.deleverId
      );

      const hiddenResult = await Food.updateMany(
        {
          source: "delever",
          deleverRestaurantId: id,
          deleverId: {
            $nin: activeIds,
          },
          isDeletedInSource: {
            $ne: true,
          },
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
    } else {
      productsWithImage = await Food.countDocuments({
        source: "delever",
        deleverRestaurantId: id,
        isDeletedInSource: {
          $ne: true,
        },
        image: {
          $type: "string",
          $regex: /\S/,
        },
      });

      productsWithoutImage = await Food.countDocuments({
        source: "delever",
        deleverRestaurantId: id,
        isDeletedInSource: {
          $ne: true,
        },
        $or: [
          {
            image: {
              $exists: false,
            },
          },
          {
            image: null,
          },
          {
            image: {
              $not: /\S/,
            },
          },
        ],
      });
    }

    let availabilityUpdated = 0;
    let availableProductsUpdated = 0;
    let stoppedProductsUpdated = 0;
    let stopListItemsReceived = 0;
    let modifierCount = 0;

    try {
      const availabilityRaw =
        await getMenuAvailability(id);

      if (!hasValidAvailabilityShape(availabilityRaw)) {
        throw new Error(
          "Delever availability javobi kutilgan formatda emas."
        );
      }

      const availability =
        availabilityCollections(availabilityRaw);

      const availabilitySyncedAt = new Date();

      const stopItemIds = [
        ...new Set(
          availability.items
            .map((entry) =>
              availabilityId(entry, "item")
            )
            .filter(Boolean)
        ),
      ];

      stopListItemsReceived = stopItemIds.length;

      const availableFilter = {
        source: "delever",
        deleverRestaurantId: id,
        isDeletedInSource: {
          $ne: true,
        },
      };

      if (stopItemIds.length) {
        availableFilter.deleverId = {
          $nin: stopItemIds,
        };
      }

      const availableResult = await Food.updateMany(
        availableFilter,
        {
          $set: {
            isAvailable: true,
            lastSyncedAt: availabilitySyncedAt,
          },
        }
      );

      availableProductsUpdated =
        availableResult.modifiedCount || 0;

      if (stopItemIds.length) {
        const stoppedResult = await Food.updateMany(
          {
            source: "delever",
            deleverRestaurantId: id,
            deleverId: {
              $in: stopItemIds,
            },
            isDeletedInSource: {
              $ne: true,
            },
          },
          {
            $set: {
              isAvailable: false,
              lastSyncedAt: availabilitySyncedAt,
            },
          }
        );

        stoppedProductsUpdated =
          stoppedResult.modifiedCount || 0;
      }

      availabilityUpdated =
        availableProductsUpdated +
        stoppedProductsUpdated;

      const modifierMap = {};

      for (const modifier of availability.modifiers) {
        const modifierId = availabilityId(
          modifier,
          "modifier"
        );

        if (!modifierId) continue;

        modifierMap[modifierId] =
          availabilityValue(modifier);
      }

      modifierCount = Object.keys(modifierMap).length;

      await Food.updateMany(
        {
          source: "delever",
          deleverRestaurantId: id,
          isDeletedInSource: {
            $ne: true,
          },
        },
        {
          $set: {
            deleverModifierAvailability: modifierMap,
          },
        }
      );
    } catch (availabilityError) {
      console.error(
        "Delever availability sync xato:",
        availabilityError.message
      );
    }

    const summary = {
      restaurantId: id,
      force: Boolean(force),
      compositionChanged,
      sourceTranslations: "delever",
      explicitTranslations,
      itemMarkup: getDeleverItemMarkup(),
      productsReceived: normalized.products.length,
      productsWithImage,
      productsWithoutImage,
      categoriesReceived: normalized.categories.length,
      skippedProducts: normalized.skipped.length,
      upserted,
      modified,
      hidden,
      stopListItemsReceived,
      availableProductsUpdated,
      stoppedProductsUpdated,
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
      summary: error.response
        ? {
            response: error.response,
          }
        : null,
    }).catch(() => {});

    throw error;
  }
};

module.exports = {
  syncDeleverMenu,
};
