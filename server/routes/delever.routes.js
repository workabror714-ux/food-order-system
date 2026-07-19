const router = require("express").Router();

const {
  auth,
  superAdmin,
} = require("../middleware/auth");

const Food = require("../models/Food");
const Order = require("../models/Order");

const IntegrationState =
  require("../models/IntegrationState");

const {
  getPublicConfig,
  getAccessToken,
  getRestaurants,
  getMenuComposition,
  getMenuAvailability,
  createOrder,
} = require("../integrations/delever");

const {
  syncDeleverMenu,
} = require("../services/deleverMenuSync");

const {
  syncOrderToDelever,
  retryPendingDeleverOrders,
  refreshDeleverOrderStatus,
} = require("../services/deleverOrderSync");

const {
  buildDeleverOrderPayload,
  extractDeleverOrderId,
} = require("../lib/deleverOrderMapper");

const envTrue = (name) =>
  String(
    process.env[name] ||
      ""
  )
    .trim()
    .toLowerCase() ===
  "true";

router.get(
  "/api/admin/delever/status",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const config =
        getPublicConfig();

      const [
        menuState,
        syncedFoods,
        pendingOrders,
        failedOrders,
      ] =
        await Promise.all([
          IntegrationState
            .findOne({
              provider:
                "delever",

              resource:
                "menu",

              restaurantId:
                config
                  .restaurantId,
            })
            .lean(),

          Food.countDocuments({
            source: "delever",

            isDeletedInSource: {
              $ne: true,
            },
          }),

          Order.countDocuments({
            deleverSyncStatus: {
              $in: [
                "pending",
                "syncing",
              ],
            },
          }),

          Order.countDocuments({
            deleverSyncStatus:
              "failed",
          }),
        ]);

      return res.json({
        config,

        menu:
          menuState ||
          null,

        counts: {
          syncedFoods,
          pendingOrders,
          failedOrders,
        },
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            error.message,
        });
    }
  }
);

router.post(
  "/api/admin/delever/test-token",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const token =
        await getAccessToken({
          force: true,
        });

      return res.json({
        success: true,

        tokenReceived:
          Boolean(token),
      });
    } catch (error) {
      return res
        .status(
          error.status ||
            400
        )
        .json({
          success: false,

          message:
            error.message,

          code:
            error.code ||
            "DELEVER_ERROR",

          response:
            error.response ||
            null,
        });
    }
  }
);

router.get(
  "/api/admin/delever/restaurants",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      return res.json(
        await getRestaurants()
      );
    } catch (error) {
      return res
        .status(
          error.status ||
            400
        )
        .json({
          success: false,

          message:
            error.message,

          code:
            error.code ||
            "DELEVER_ERROR",

          response:
            error.response ||
            null,
        });
    }
  }
);

router.get(
  "/api/admin/delever/synced-foods",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const config =
        getPublicConfig();

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number(
              req.query.limit
            ) || 20
          )
        );

      const filter = {
        source: "delever",

        deleverRestaurantId:
          config.restaurantId,

        isDeletedInSource: {
          $ne: true,
        },
      };

      const [
        total,
        available,
        unavailable,
        foods,
      ] =
        await Promise.all([
          Food.countDocuments(
            filter
          ),

          Food.countDocuments({
            ...filter,
            isAvailable: true,
          }),

          Food.countDocuments({
            ...filter,
            isAvailable: false,
          }),

          Food.find(filter)
            .select(
              [
                "title",
                "category",
                "price",
                "deleverBasePrice",
                "packagingFee",
                "image",
                "isAvailable",
                "deleverId",
                "deleverCategoryId",
                "sortOrder",
              ].join(" ")
            )
            .sort({
              sortOrder: 1,
              createdAt: -1,
            })
            .limit(limit)
            .lean(),
        ]);

      return res.json({
        success: true,

        restaurantId:
          config.restaurantId,

        counts: {
          total,
          available,
          unavailable,
        },

        foods,
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          success: false,
          message:
            error.message,
        });
    }
  }
);

router.get(
  "/api/admin/delever/menu-preview",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const config =
        getPublicConfig();

      if (
        !config.restaurantId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "DELEVER_RESTAURANT_ID kiritilmagan",
          });
      }

      const menu =
        await getMenuComposition(
          config.restaurantId
        );

      return res.json({
        success: true,

        restaurantId:
          config.restaurantId,

        menu,
      });
    } catch (error) {
      return res
        .status(
          error.status ||
            400
        )
        .json({
          success: false,

          message:
            error.message,

          code:
            error.code ||
            "DELEVER_ERROR",

          response:
            error.response ||
            null,
        });
    }
  }
);

router.get(
  "/api/admin/delever/availability-preview",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const config =
        getPublicConfig();

      if (
        !config.restaurantId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "DELEVER_RESTAURANT_ID kiritilmagan",
          });
      }

      const availability =
        await getMenuAvailability(
          config.restaurantId
        );

      return res.json({
        success: true,

        restaurantId:
          config.restaurantId,

        availability,
      });
    } catch (error) {
      return res
        .status(
          error.status ||
            400
        )
        .json({
          success: false,

          message:
            error.message,

          code:
            error.code ||
            "DELEVER_ERROR",

          response:
            error.response ||
            null,
        });
    }
  }
);

router.post(
  "/api/admin/delever/sync-menu",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const result =
        await syncDeleverMenu({
          force:
            req.body?.force !==
            false,
        });

      return res.json({
        success: true,
        result,
      });
    } catch (error) {
      return res
        .status(
          error.status ||
            400
        )
        .json({
          success: false,

          message:
            error.message,

          code:
            error.code ||
            "DELEVER_ERROR",

          response:
            error.response ||
            null,
        });
    }
  }
);

/*
 * Minimal test:
 * - bitta real Delever Food
 * - cash
 * - pickup
 * - packaging item yuborilmaydi
 * - Telegram va Millenium chaqirilmaydi
 */
router.post(
  "/api/admin/delever/test-order",
  auth,
  superAdmin,
  async (req, res) => {
    let testOrder = null;

    let requestPayload =
      null;

    try {
      if (
        !envTrue(
          "DELEVER_TEST_ORDER_ENABLED"
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Test buyurtma yuborish o'chirilgan. DELEVER_TEST_ORDER_ENABLED=true qiling.",
          });
      }

      const {
        confirm,
        foodId,
        quantity = 1,
        customerName =
          "Anvar",
        customerPhone,
      } = req.body || {};

      if (
        confirm !==
        "SEND_TEST_ORDER"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              'confirm maydoni "SEND_TEST_ORDER" bo‘lishi kerak.',
          });
      }

      if (
        !/^[a-f0-9]{24}$/i.test(
          String(
            foodId ||
              ""
          )
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "foodId noto'g'ri.",
          });
      }

      const parsedQuantity =
        Number(quantity);

      if (
        !Number.isInteger(
          parsedQuantity
        ) ||
        parsedQuantity < 1 ||
        parsedQuantity > 5
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Test uchun quantity 1 dan 5 gacha bo'lishi kerak.",
          });
      }

      const phone =
        String(
          customerPhone ||
            process.env
              .DELEVER_TEST_PHONE ||
            ""
        ).trim();

      if (!phone) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "customerPhone yuboring yoki DELEVER_TEST_PHONE kiriting.",
          });
      }

      const config =
        getPublicConfig();

      if (
        !config.restaurantId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "DELEVER_RESTAURANT_ID kiritilmagan.",
          });
      }

      const food =
        await Food.findOne({
          _id: foodId,

          source: "delever",

          deleverRestaurantId:
            config.restaurantId,

          deleverId: {
            $exists: true,
            $ne: "",
          },

          isAvailable: true,

          isDeletedInSource: {
            $ne: true,
          },
        });

      if (!food) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Mavjud Delever taomi topilmadi. Stop-listda bo'lmagan taom ID sini kiriting.",
          });
      }

      const title =
        String(
          food.title?.uz ||
            food.title?.ru ||
            "Test taom"
        );

      const deleverTitle =
        String(
          food.title?.ru ||
            food.title?.uz ||
            "Test taom"
        );

      const publicPrice =
        Math.max(
          0,
          Number(
            food.price
          ) || 0
        );

      const packagingFee =
        Math.max(
          0,
          Number(
            food.packagingFee
          ) || 0
        );

      const explicitBase =
        Math.max(
          0,
          Number(
            food
              .deleverBasePrice
          ) || 0
        );

      const basePrice =
        explicitBase > 0
          ? explicitBase
          : Math.max(
              0,
              publicPrice -
                packagingFee
            );

      if (
        publicPrice <= 0 ||
        basePrice <= 0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Tanlangan taom narxi noto'g'ri.",
          });
      }

      const totalPrice =
        publicPrice *
        parsedQuantity;

      const packagingTotal =
        packagingFee *
        parsedQuantity;

      const deleverItemsCost =
        basePrice *
        parsedQuantity;

      testOrder =
        await Order.create({
          customerName:
            `[TEST] ${String(
              customerName
            ).trim()}`,

          customerPhone:
            phone,

          persons: 1,

          items: [
            {
              foodId:
                String(
                  food._id
                ),

              deleverProductId:
                String(
                  food.deleverId
                ),

              title,

              deleverTitle,

              price:
                publicPrice,

              deleverBasePrice:
                basePrice,

              packagingFee,

              quantity:
                parsedQuantity,

              modifiers: [],
            },
          ],

          totalPrice,

          packagingTotal,

          deleverItemsCost,

          address:
            "TEST ORDER — TAYYORLAMANG",

          orderType:
            "pickup",

          paymentType:
            "cash",

          paymentProvider:
            "cash",

          paymentStatus:
            "unpaid",

          deliveryPrice: 0,

          paymentAmount:
            totalPrice,

          status: "new",

          deleverSyncStatus:
            "syncing",

          deleverAttempts: 1,

          deleverLastAttemptAt:
            new Date(),

          deleverRestaurantId:
            config.restaurantId,
        });

      testOrder
        .deleverExternalId =
        String(
          testOrder._id
        );

      await testOrder.save();

      /*
       * Birinchi testda packaging item
       * ataylab yuborilmaydi.
       */
      requestPayload =
        buildDeleverOrderPayload(
          testOrder,
          {
            includePackagingItem:
              false,

            commentPrefix:
              "TEST ORDER — TAYYORLAMANG!",
          }
        );

      await Order.updateOne(
        {
          _id:
            testOrder._id,
        },
        {
          $set: {
            deleverRequestPayload:
              requestPayload,

            deleverItemsCost:
              Number(
                requestPayload
                  ?.paymentInfo
                  ?.itemsCost
              ) || 0,
          },
        }
      );

      const response =
        await createOrder(
          requestPayload
        );

      const deleverOrderId =
        extractDeleverOrderId(
          response
        );

      if (!deleverOrderId) {
        throw new Error(
          "Delever javobida orderId topilmadi"
        );
      }

      await Order.updateOne(
        {
          _id:
            testOrder._id,
        },
        {
          $set: {
            deleverOrderId,

            deleverSyncStatus:
              "success",

            deleverSyncError:
              "",

            deleverNextRetryAt:
              null,

            deleverSyncedAt:
              new Date(),

            deleverRequestPayload:
              requestPayload,

            deleverRawResponse:
              response,
          },
        }
      );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Test buyurtma Deleverga yuborildi.",

          localOrderId:
            String(
              testOrder._id
            ),

          deleverOrderId,

          requestPayload,

          food: {
            id:
              String(
                food._id
              ),

            deleverId:
              String(
                food.deleverId
              ),

            title,

            publicPrice,

            deleverBasePrice:
              basePrice,

            packagingFee,

            quantity:
              parsedQuantity,
          },

          response,
        });
    } catch (error) {
      console.error(
        "Delever test-order xato:",
        error.message
      );

      if (
        testOrder?._id
      ) {
        await Order.updateOne(
          {
            _id:
              testOrder._id,
          },
          {
            $set: {
              deleverSyncStatus:
                "failed",

              deleverSyncError:
                String(
                  error.message ||
                    "Delever test xatosi"
                ).slice(
                  0,
                  1000
                ),

              deleverRequestPayload:
                requestPayload,

              deleverRawResponse:
                error.response ||
                null,
            },
          }
        ).catch(() => {});
      }

      return res
        .status(
          error.status ||
            502
        )
        .json({
          success: false,

          message:
            error.message,

          response:
            error.response ||
            null,

          requestPayload,

          localOrderId:
            testOrder?._id
              ? String(
                  testOrder._id
                )
              : null,
        });
    }
  }
);

router.post(
  "/api/admin/delever/orders/retry",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const result =
        await retryPendingDeleverOrders({
          limit:
            req.body?.limit,
        });

      return res.json({
        success: true,
        result,
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          success: false,
          message:
            error.message,
        });
    }
  }
);

router.post(
  "/api/admin/delever/orders/:id/retry",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const result =
        await syncOrderToDelever(
          req.params.id,
          {
            force: true,
          }
        );

      return res
        .status(
          result.success ||
            result.skipped
            ? 200
            : 502
        )
        .json(result);
    } catch (error) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message,
        });
    }
  }
);

router.post(
  "/api/admin/delever/orders/:id/refresh-status",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const result =
        await refreshDeleverOrderStatus(
          req.params.id
        );

      return res.json(
        result
      );
    } catch (error) {
      return res
        .status(
          error.status ||
            400
        )
        .json({
          success: false,

          message:
            error.message,

          response:
            error.response ||
            null,
        });
    }
  }
);

/*
 * Bitta translation endpoint.
 * Admin uz/en qiymatni o'zgartirsa,
 * keyingi avtomatik sync uni bosmaydi.
 */
router.patch(
  "/api/admin/delever/foods/:id/translations",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const config =
        getPublicConfig();

      const {
        title,
        category,
        description,
      } = req.body || {};

      const update = {};

      const addTranslation = (
        field,
        value
      ) => {
        if (
          value &&
          typeof value.uz ===
            "string"
        ) {
          update[
            `${field}.uz`
          ] =
            value.uz.trim();

          update[
            `translationManual.${field}Uz`
          ] = true;
        }

        if (
          value &&
          typeof value.en ===
            "string"
        ) {
          update[
            `${field}.en`
          ] =
            value.en.trim();

          update[
            `translationManual.${field}En`
          ] = true;
        }
      };

      addTranslation(
        "title",
        title
      );

      addTranslation(
        "category",
        category
      );

      addTranslation(
        "description",
        description
      );

      if (
        !Object.keys(
          update
        ).length
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Hech qanday tarjima yuborilmadi.",
          });
      }

      update
        .manualTranslationUpdatedAt =
        new Date();

      const food =
        await Food
          .findOneAndUpdate(
            {
              _id:
                req.params.id,

              source:
                "delever",

              deleverRestaurantId:
                config
                  .restaurantId,

              isDeletedInSource: {
                $ne: true,
              },
            },
            {
              $set: update,
            },
            {
              new: true,
            }
          )
          .select(
            [
              "title",
              "category",
              "description",
              "price",
              "deleverBasePrice",
              "packagingFee",
              "image",
              "isAvailable",
              "deleverId",
              "translationManual",
              "manualTranslationUpdatedAt",
            ].join(" ")
          );

      if (!food) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Delever taomi topilmadi.",
          });
      }

      return res.json({
        success: true,

        message:
          "Tarjimalar saqlandi.",

        food,
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message,
        });
    }
  }
);

module.exports = router;
