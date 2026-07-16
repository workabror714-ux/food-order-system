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
    process.env
      .DELEVER_ITEM_MARKUP ?? 5000
  );

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 5000;
  }

  return Math.round(value);
};

const setState = async (
  restaurantId,
  update
) =>
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

const hasValidAvailabilityShape = (
  payload
) => {
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

  return possibleArrays.some(
    Array.isArray
  );
};

const syncDeleverMenu = async ({
  restaurantId,
  force = false,
} = {}) => {
  const config =
    getConfig();

  const id =
    restaurantId ||
    config.restaurantId;

  if (!config.enabled) {
    return {
      skipped: true,
      reason:
        "DELEVER_ENABLED=false",
    };
  }

  if (!id) {
    throw new Error(
      "DELEVER_RESTAURANT_ID kiritilmagan"
    );
  }

  const startedAt =
    new Date();

  await setState(id, {
    status: "running",
    lastStartedAt:
      startedAt,
    lastError: "",
  });

  try {
    /*
     * Delever menyusini olish
     */
    const compositionRaw =
      await getMenuComposition(
        id
      );

    const normalized =
      normalizeComposition(
        compositionRaw,
        id
      );

    const previous =
      await IntegrationState
        .findOne({
          provider:
            "delever",

          resource:
            "menu",

          restaurantId:
            id,
        })
        .lean();

    /*
     * Admin tugmasi force=true yuboradi.
     * Shunda lastChange o'zgarmagan bo'lsa ham
     * barcha nom, tarjima, rasm, narx va kategoriyalar
     * qaytadan yoziladi.
     */
    const compositionChanged =
      force ||
      !normalized.lastChange ||
      normalized.lastChange !==
        previous
          ?.lastSourceChange;

    let upserted = 0;
    let modified = 0;
    let hidden = 0;

    let productsWithImage = 0;
    let productsWithoutImage = 0;

    if (compositionChanged) {
      if (
        !normalized
          .products.length
      ) {
        throw new Error(
          "Delever menyu javobidan birorta ham yaroqli taom topilmadi."
        );
      }

      const now =
        new Date();

      const itemMarkup =
        getDeleverItemMarkup();

      productsWithImage =
        normalized.products.filter(
          (product) =>
            Boolean(
              String(
                product.image ||
                  ""
              ).trim()
            )
        ).length;

      productsWithoutImage =
        normalized
          .products.length -
        productsWithImage;

      /*
       * Avtomatik tarjima yo'q.
       * Delever'dan qaysi uz/ru/en qiymatlar kelsa,
       * MongoDBga aynan o'shalar yoziladi.
       */
      const operations =
        normalized.products.map(
          (product) => {
            const {
              isAvailable,

              price:
                incomingBasePrice,

              ...productFields
            } = product;

            const deleverBasePrice =
              Math.max(
                0,
                Number(
                  incomingBasePrice
                ) || 0
              );

            const setFields = {
              ...productFields,

              deleverBasePrice,

              packagingFee:
                itemMarkup,

              price:
                deleverBasePrice +
                itemMarkup,

              source:
                "delever",

              isDeletedInSource:
                false,

              lastSyncedAt:
                now,

              translationError:
                "",
            };

            if (
              typeof isAvailable ===
              "boolean"
            ) {
              setFields
                .isAvailable =
                isAvailable;
            }

            return {
              updateOne: {
                filter: {
                  deleverId:
                    product
                      .deleverId,

                  deleverRestaurantId:
                    id,
                },

                update: {
                  $set:
                    setFields,

                  $setOnInsert: {
                    isAvailable:
                      typeof isAvailable ===
                        "boolean"
                        ? isAvailable
                        : true,
                  },
                },

                upsert: true,
              },
            };
          }
        );

      const result =
        await Food.bulkWrite(
          operations,
          {
            ordered: false,
          }
        );

      upserted =
        result.upsertedCount ||
        0;

      modified =
        result.modifiedCount ||
        0;

      /*
       * Delever menyusidan yo'qolgan itemlar
       * bazadan o'chirilmaydi, menyudan yashiriladi.
       */
      const activeIds =
        normalized.products.map(
          (product) =>
            product.deleverId
        );

      const hiddenResult =
        await Food.updateMany(
          {
            source:
              "delever",

            deleverRestaurantId:
              id,

            deleverId: {
              $nin:
                activeIds,
            },

            isDeletedInSource: {
              $ne: true,
            },
          },
          {
            $set: {
              isDeletedInSource:
                true,

              isAvailable:
                false,

              lastSyncedAt:
                now,
            },
          }
        );

      hidden =
        hiddenResult
          .modifiedCount ||
        0;
    } else {
      productsWithImage =
        await Food.countDocuments(
          {
            source:
              "delever",

            deleverRestaurantId:
              id,

            isDeletedInSource: {
              $ne: true,
            },

            image: {
              $type:
                "string",

              $regex:
                /\S/,
            },
          }
        );

      productsWithoutImage =
        await Food.countDocuments(
          {
            source:
              "delever",

            deleverRestaurantId:
              id,

            isDeletedInSource: {
              $ne: true,
            },

            $or: [
              {
                image: {
                  $exists:
                    false,
                },
              },
              {
                image:
                  null,
              },
              {
                image: {
                  $not:
                    /\S/,
                },
              },
            ],
          }
        );
    }

    /*
     * Stop-listni har safar sync qilamiz.
     */
    let availabilityUpdated = 0;
    let availableProductsUpdated = 0;
    let stoppedProductsUpdated = 0;
    let stopListItemsReceived = 0;
    let modifierCount = 0;

    try {
      const availabilityRaw =
        await getMenuAvailability(
          id
        );

      if (
        !hasValidAvailabilityShape(
          availabilityRaw
        )
      ) {
        throw new Error(
          "Delever availability javobi kutilgan formatda emas."
        );
      }

      const availability =
        availabilityCollections(
          availabilityRaw
        );

      const availabilitySyncedAt =
        new Date();

      const stopItemIds = [
        ...new Set(
          availability.items
            .map((entry) =>
              availabilityId(
                entry,
                "item"
              )
            )
            .filter(Boolean)
        ),
      ];

      stopListItemsReceived =
        stopItemIds.length;

      const availableFilter = {
        source:
          "delever",

        deleverRestaurantId:
          id,

        isDeletedInSource: {
          $ne: true,
        },
      };

      if (
        stopItemIds.length
      ) {
        availableFilter
          .deleverId = {
          $nin:
            stopItemIds,
        };
      }

      const availableResult =
        await Food.updateMany(
          availableFilter,
          {
            $set: {
              isAvailable:
                true,

              lastSyncedAt:
                availabilitySyncedAt,
            },
          }
        );

      availableProductsUpdated =
        availableResult
          .modifiedCount ||
        0;

      if (
        stopItemIds.length
      ) {
        const stoppedResult =
          await Food.updateMany(
            {
              source:
                "delever",

              deleverRestaurantId:
                id,

              deleverId: {
                $in:
                  stopItemIds,
              },

              isDeletedInSource: {
                $ne: true,
              },
            },
            {
              $set: {
                isAvailable:
                  false,

                lastSyncedAt:
                  availabilitySyncedAt,
              },
            }
          );

        stoppedProductsUpdated =
          stoppedResult
            .modifiedCount ||
          0;
      }

      availabilityUpdated =
        availableProductsUpdated +
        stoppedProductsUpdated;

      const modifierMap = {};

      for (
        const modifier
        of availability.modifiers
      ) {
        const modifierId =
          availabilityId(
            modifier,
            "modifier"
          );

        if (!modifierId) {
          continue;
        }

        modifierMap[
          modifierId
        ] =
          availabilityValue(
            modifier
          );
      }

      modifierCount =
        Object.keys(
          modifierMap
        ).length;

      await Food.updateMany(
        {
          source:
            "delever",

          deleverRestaurantId:
            id,

          isDeletedInSource: {
            $ne: true,
          },
        },
        {
          $set: {
            deleverModifierAvailability:
              modifierMap,
          },
        }
      );
    } catch (
      availabilityError
    ) {
      console.error(
        "Delever availability sync xato:",
        availabilityError
          .message
      );
    }

    const summary = {
      restaurantId:
        id,

      force:
        Boolean(force),

      compositionChanged,

      sourceTranslations:
        "delever",

      itemMarkup:
        getDeleverItemMarkup(),

      productsReceived:
        normalized
          .products.length,

      productsWithImage,

      productsWithoutImage,

      categoriesReceived:
        normalized
          .categories.length,

      skippedProducts:
        normalized
          .skipped.length,

      upserted,
      modified,
      hidden,

      stopListItemsReceived,

      availableProductsUpdated,

      stoppedProductsUpdated,

      availabilityUpdated,

      modifierAvailabilityReceived:
        modifierCount,
    };

    await setState(id, {
      status:
        "success",

      lastSourceChange:
        normalized
          .lastChange,

      lastSyncedAt:
        new Date(),

      lastError:
        "",

      summary,
    });

    return summary;
  } catch (error) {
    await setState(id, {
      status:
        "failed",

      lastError:
        error.message,

      summary:
        error.response
          ? {
              response:
                error.response,
            }
          : null,
    }).catch(() => {});

    throw error;
  }
};

module.exports = {
  syncDeleverMenu,
};
