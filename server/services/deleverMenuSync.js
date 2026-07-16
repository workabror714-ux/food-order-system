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

const cleanText = (value) =>
  String(value || "").trim();

/*
 * Oldingi uz/en qiymati ruscha qiymat bilan bir xil bo‘lsa,
 * u hali qo‘lda tarjima qilinmagan deb hisoblanadi.
 *
 * Qo‘lda o‘zgartirilgan tarjima esa sync paytida saqlanadi.
 */
const preserveTranslation = ({
  currentValue,
  currentRussian,
  incomingValue,
}) => {
  const current = cleanText(currentValue);
  const oldRussian = cleanText(currentRussian);
  const incoming = cleanText(incomingValue);

  if (!current) {
    return incoming;
  }

  if (oldRussian && current === oldRussian) {
    return incoming;
  }

  return current;
};

const mergeLocalizedText = (
  existingValue,
  incomingValue
) => {
  const current = existingValue || {};
  const incoming = incomingValue || {};

  const incomingRussian =
    cleanText(incoming.ru) ||
    cleanText(incoming.uz) ||
    cleanText(incoming.en);

  const incomingUzbek =
    cleanText(incoming.uz) ||
    incomingRussian;

  const incomingEnglish =
    cleanText(incoming.en) ||
    incomingRussian;

  return {
    ru: incomingRussian,

    uz: preserveTranslation({
      currentValue: current.uz,
      currentRussian: current.ru,
      incomingValue: incomingUzbek,
    }),

    en: preserveTranslation({
      currentValue: current.en,
      currentRussian: current.ru,
      incomingValue: incomingEnglish,
    }),
  };
};

const getDeleverItemMarkup = () => {
  const value = Number(
    process.env.DELEVER_ITEM_MARKUP ?? 5000
  );

  if (!Number.isFinite(value) || value < 0) {
    return 5000;
  }

  return Math.round(value);
};

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

  const startedAt = new Date();

  await setState(id, {
    status: "running",
    lastStartedAt: startedAt,
    lastError: "",
  });

  try {
    /*
     * 1. Delever menyusini olish
     */
    const compositionRaw = await getMenuComposition(id);

    const normalized = normalizeComposition(
      compositionRaw,
      id
    );

    const previous = await IntegrationState.findOne({
      provider: "delever",
      resource: "menu",
      restaurantId: id,
    }).lean();

    /*
     * lastChange o‘zgarmagan bo‘lsa ham stop-list
     * har safar alohida tekshiriladi.
     */
    const compositionChanged =
      force ||
      !normalized.lastChange ||
      normalized.lastChange !== previous?.lastSourceChange;

    let upserted = 0;
    let modified = 0;
    let hidden = 0;

    /*
     * 2. Menyu o‘zgargan bo‘lsa MongoDB bilan sinxronlash
     */
    if (compositionChanged) {
      if (!normalized.products.length) {
        throw new Error(
          "Delever menyu javobidan birorta ham yaroqli taom topilmadi."
        );
      }

      const now = new Date();

      /*
       * Har bir dona taom uchun qo‘shiladigan idish puli.
       */
      const itemMarkup =
        getDeleverItemMarkup();
      
      /*
       * Oldin bazada mavjud bo‘lgan tarjimalarni olamiz.
       *
       * Shu orqali Delever sync o‘zbekcha va inglizcha
       * tarjimalarni bosib yubormaydi.
       */
      const incomingDeleverIds =
        normalized.products.map(
          (product) => product.deleverId
        );
      
      const existingFoods = await Food.find({
        source: "delever",
      
        deleverRestaurantId: id,
      
        deleverId: {
          $in: incomingDeleverIds,
        },
      })
        .select(
          [
            "deleverId",
            "title",
            "category",
            "description",
          ].join(" ")
        )
        .lean();
      
      const existingFoodMap = new Map(
        existingFoods.map((food) => [
          String(food.deleverId),
          food,
        ])
      );
      
      const operations =
        normalized.products.map((product) => {
          const existingFood =
            existingFoodMap.get(
              String(product.deleverId)
            );
      
          const {
            isAvailable,
            price: rawDeleverPrice,
            ...productFields
          } = product;
      
          /*
           * Bu har doim Delever’dan kelgan asl narx.
           *
           * MongoDBdagi eski price qiymatiga 5000
           * qo‘shilmaydi. Shuning uchun narx qayta-qayta
           * oshib ketmaydi.
           */
          const deleverBasePrice = Math.max(
            0,
            Number(rawDeleverPrice) || 0
          );
      
          const finalPrice =
            deleverBasePrice + itemMarkup;
      
          const setFields = {
            ...productFields,
      
            /*
             * Ruscha matn Delever’dan yangilanadi.
             *
             * Qo‘lda kiritilgan uz/en tarjimalar
             * saqlab qolinadi.
             */
            title: mergeLocalizedText(
              existingFood?.title,
              product.title
            ),
      
            category: mergeLocalizedText(
              existingFood?.category,
              product.category
            ),
      
            description: mergeLocalizedText(
              existingFood?.description,
              product.description
            ),
      
            /*
             * Narxlar:
             * deleverBasePrice — asl narx
             * packagingFee — idish puli
             * price — mijoz ko‘radigan yakuniy narx
             */
            deleverBasePrice,
            packagingFee: itemMarkup,
            price: finalPrice,
      
            source: "delever",
      
            isDeletedInSource: false,
      
            lastSyncedAt: now,
          };
      
          /*
           * Composition ichida isAvailable aniq boolean
           * bo‘lib kelsagina saqlanadi.
           *
           * Aks holda stop-list qiymatini bosmaydi.
           */
          if (
            typeof isAvailable === "boolean"
          ) {
            setFields.isAvailable =
              isAvailable;
          }
      
          return {
            updateOne: {
              filter: {
                deleverId:
                  product.deleverId,
      
                deleverRestaurantId: id,
              },
      
              update: {
                $set: setFields,
      
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
        });

      const result = await Food.bulkWrite(
        operations,
        {
          ordered: false,
        }
      );

      upserted = result.upsertedCount || 0;
      modified = result.modifiedCount || 0;

      /*
       * Delever menyusidan butunlay yo‘qolgan taomlarni
       * o‘chirmaymiz, balki botdan yashiramiz.
       */
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
    }

    /*
     * 3. Stop-listni sinxronlash
     */
    let availabilityUpdated = 0;
    let availableProductsUpdated = 0;
    let stoppedProductsUpdated = 0;
    let stopListItemsReceived = 0;
    let modifierCount = 0;

    try {
      const availabilityRaw =
        await getMenuAvailability(id);

      /*
       * API noto‘g‘ri format qaytarsa barcha taomlarni
       * tasodifan mavjud qilib yubormaslik uchun himoya.
       */
      if (!hasValidAvailabilityShape(availabilityRaw)) {
        throw new Error(
          "Delever availability javobi kutilgan formatda emas."
        );
      }

      const availability =
        availabilityCollections(availabilityRaw);

      const availabilitySyncedAt = new Date();

      /*
       * Delever availability endpointidagi items ro‘yxati
       * stop-list hisoblanadi.
       */
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

      /*
       * Stop-listda mavjud bo‘lmagan barcha faol taomlarni
       * qayta ochamiz.
       *
       * Shu orqali avval stop-listda bo‘lib, keyin undan
       * chiqarilgan taom botda yana mavjud bo‘ladi.
       */
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

      /*
       * Stop-listdagi taomlarni mavjud emas qilamiz.
       */
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
              lastSyncedAt:
                availabilitySyncedAt,
            },
          }
        );

        stoppedProductsUpdated =
          stoppedResult.modifiedCount || 0;
      }

      availabilityUpdated =
        availableProductsUpdated +
        stoppedProductsUpdated;

      /*
       * Modifier stop-list
       */
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

      modifierCount =
        Object.keys(modifierMap).length;

      /*
       * Har safar mapni yangidan yozamiz.
       *
       * Agar modifiers bo‘sh kelsa ham eski modifier
       * stop-list ma’lumotlari bazadan tozalanadi.
       */
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
            deleverModifierAvailability:
              modifierMap,
          },
        }
      );
    } catch (availabilityError) {
      /*
       * Composition muvaffaqiyatli bo‘lsa availability
       * xatosi butun menyu sync jarayonini yiqitmaydi.
       */
      console.error(
        "Delever availability sync xato:",
        availabilityError.message
      );
    }

    const summary = {
      restaurantId: id,
      compositionChanged,

      itemMarkup:
        getDeleverItemMarkup(),

      productsReceived:
        normalized.products.length,

      categoriesReceived:
        normalized.categories.length,

      skippedProducts:
        normalized.skipped.length,

      upserted,
      modified,
      hidden,

      stopListItemsReceived,
      availableProductsUpdated,
      stoppedProductsUpdated,
      availabilityUpdated,

      modifierAvailabilityReceived:modifierCount,
    };

    await setState(id, {
      status: "success",
      lastSourceChange:
        normalized.lastChange,
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