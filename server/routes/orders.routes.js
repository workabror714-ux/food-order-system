const router = require("express").Router();

const {
  auth,
  superAdmin,
} = require("../middleware/auth");

const {
  rateLimit,
} = require("../middleware/rateLimit");

const Order = require("../models/Order");
const Food = require("../models/Food");

const {
  getFilial,
} = require("../services/filials");

const {
  calcMilleniumDeliveryPrice,
} = require("../integrations/millenium");

const {
  makePaymePaymentUrl,
} = require("../integrations/payme");

const {
  makeClickPaymentUrl,
} = require("../integrations/click");

const {
  editStaffOrderMessage,
} = require("../services/orderMessaging");

const {
  fulfillAcceptedOrder,
} = require("../services/orderFulfillment");

const {
  getConfig:
    getDeleverConfig,
} = require("../integrations/delever");

const {
  sendTelegram,
} = require("../integrations/telegram");

const {
  ORDER_STATUSES,
  STATUS_LABELS,
} = require("../config/constants");

const {
  autoCancelUnpaidOrders,
} = require("../services/orderJobs");

router.post(
  "/api/millenium/calc-price",
  async (req, res) => {
    try {
      const {
        filialId,
        location,
      } = req.body || {};

      const cpFilial =
        getFilial(filialId);

      if (
        !filialId ||
        !cpFilial
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Filial noto'g'ri yoki tanlanmagan",
          });
      }

      if (
        cpFilial.isActive ===
        false
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Bu filial vaqtincha yopiq",
          });
      }

      if (
        !location?.lat ||
        !location?.lng
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Lokatsiya kerak",
          });
      }

      const result =
        await calcMilleniumDeliveryPrice({
          filialId,
          location,
        });

      return res.json({
        success: true,

        price:
          result.price,

        source:
          result.source,

        filial: {
          id: filialId,
          name:
            result.restaurant
              .name,
        },

        raw:
          result.raw?.data ||
          null,
      });
    } catch (error) {
      console.error(
        "Millenium calc-price xato:",
        error.message
      );

      return res
        .status(400)
        .json({
          success: false,

          message:
            error.message ||
            "Millenium narxini hisoblab bo'lmadi",
        });
    }
  }
);

// ORDERS
router.post(
  "/api/orders",
  async (req, res) => {
    try {
      const {
        customerName,
        customerPhone,
        items,
        address,
        location,
        orderType,
        paymentType,
        filialId,
        filialName,
        persons,
      } = req.body || {};

      if (
        !customerName ||
        !customerPhone ||
        !items?.length
      ) {
        return res
          .status(400)
          .json({
            message:
              "Ism, telefon va taomlar shart!",
          });
      }

      const normalizedOrderType =
        orderType ||
        "delivery";

      const normalizedPaymentType =
        paymentType ||
        "click";

      if (
        ![
          "delivery",
          "pickup",
        ].includes(
          normalizedOrderType
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Buyurtma turi noto'g'ri.",
          });
      }

      if (
        ![
          "click",
          "payme",
          "cash",
        ].includes(
          normalizedPaymentType
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "To'lov turi noto'g'ri.",
          });
      }

      if (
        normalizedPaymentType ===
          "cash" &&
        normalizedOrderType !==
          "pickup"
      ) {
        return res
          .status(400)
          .json({
            message:
              "Naqd to'lov faqat olib ketishda mumkin. Yetkazib berishda online to'lov shart.",
          });
      }

      const orderFilial =
        getFilial(filialId);

      if (
        filialId &&
        !orderFilial
      ) {
        return res
          .status(400)
          .json({
            message:
              "Tanlangan filial topilmadi.",
          });
      }

      if (
        filialId &&
        orderFilial
          ?.isActive === false
      ) {
        return res
          .status(400)
          .json({
            message:
              "Tanlangan filial vaqtincha yopiq. Boshqa filialni tanlang.",
          });
      }

      /*
       * Narx faqat server tomonidan
       * MongoDB'dagi Food asosida hisoblanadi.
       */
      const cartItems =
        (items || [])
          .filter(Boolean);

      for (
        const item
        of cartItems
      ) {
        if (
          !/^[a-f0-9]{24}$/i.test(
            String(
              item.foodId ||
                ""
            )
          )
        ) {
          return res
            .status(400)
            .json({
              message:
                "Taom ID noto'g'ri. Savatni yangilang.",
            });
        }

        const quantity =
          Number(
            item.quantity
          );

        if (
          !Number.isInteger(
            quantity
          ) ||
          quantity < 1 ||
          quantity > 99
        ) {
          return res
            .status(400)
            .json({
              message:
                "Taom miqdori 1 dan 99 gacha bo'lgan butun son bo'lishi kerak.",
            });
        }
      }

      const wantedIds = [
        ...new Set(
          cartItems.map(
            (item) =>
              String(
                item.foodId
              )
          )
        ),
      ];

      const dbFoods =
        await Food.find({
          _id: {
            $in: wantedIds,
          },
        }).select(
          [
            "title",
            "price",
            "deleverBasePrice",
            "packagingFee",
            "isAvailable",
            "isDeletedInSource",
            "deleverId",
            "deleverRestaurantId",
            "source",
          ].join(" ")
        );

      if (
        dbFoods.length !==
        wantedIds.length
      ) {
        return res
          .status(400)
          .json({
            message:
              "Savatdagi ayrim taomlar topilmadi. Savatni yangilang.",
          });
      }

      const unavailable =
        dbFoods.find(
          (food) =>
            food.isAvailable ===
              false ||
            food
              .isDeletedInSource ===
              true
        );

      if (unavailable) {
        const title =
          unavailable
            .title?.uz ||
          "Tanlangan taom";

        return res
          .status(400)
          .json({
            message:
              `${title} hozircha mavjud emas. Iltimos, savatdan olib tashlang.`,
          });
      }

      const foodMap =
        new Map(
          dbFoods.map(
            (food) => [
              String(
                food._id
              ),
              food,
            ]
          )
        );

      const deleverConfig =
        getDeleverConfig();

      if (
        deleverConfig
          .orderEnabled &&
        String(
          process.env
            .DELEVER_REQUIRE_EXTERNAL_ITEMS ||
            "true"
        )
          .trim()
          .toLowerCase() !==
          "false"
      ) {
        const invalidDeleverFood =
          dbFoods.find(
            (food) => {
              if (
                food.source !==
                  "delever" ||
                !food.deleverId
              ) {
                return true;
              }

              if (
                food
                  .deleverRestaurantId &&
                deleverConfig
                  .restaurantId &&
                String(
                  food
                    .deleverRestaurantId
                ) !==
                  String(
                    deleverConfig
                      .restaurantId
                  )
              ) {
                return true;
              }

              return false;
            }
          );

        if (
          invalidDeleverFood
        ) {
          const title =
            invalidDeleverFood
              .title?.uz ||
            "Tanlangan taom";

          return res
            .status(409)
            .json({
              message:
                `${title} amaldagi Delever menyusi bilan mos emas. Savatni yangilang.`,
            });
        }
      }

      const serverItems =
        cartItems.map(
          (item) => {
            const food =
              foodMap.get(
                String(
                  item.foodId
                )
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

            return {
              foodId:
                String(
                  item.foodId
                ),

              deleverProductId:
                String(
                  food.deleverId ||
                    ""
                ),

              title:
                String(
                  food.title?.uz ||
                    item.title ||
                    "Taom"
                ),

              deleverTitle:
                String(
                  food.title?.ru ||
                    food.title?.uz ||
                    item.title ||
                    "Taom"
                ),

              price:
                publicPrice,

              deleverBasePrice:
                basePrice,

              packagingFee,

              quantity:
                Number(
                  item.quantity
                ),

              modifiers: [],
            };
          }
        );

      const serverTotal =
        serverItems.reduce(
          (
            sum,
            item
          ) =>
            sum +
            item.price *
              item.quantity,
          0
        );

      const packagingTotal =
        serverItems.reduce(
          (
            sum,
            item
          ) =>
            sum +
            item.packagingFee *
              item.quantity,
          0
        );

      const deleverItemsCost =
        serverItems.reduce(
          (
            sum,
            item
          ) =>
            sum +
            item
              .deleverBasePrice *
              item.quantity,
          0
        );

      if (serverTotal <= 0) {
        return res
          .status(400)
          .json({
            message:
              "Buyurtma summasi noto'g'ri. Savatni yangilang.",
          });
      }

      if (
        deleverConfig
          .orderEnabled &&
        deleverItemsCost <= 0
      ) {
        return res
          .status(400)
          .json({
            message:
              "Delever uchun taomlarning asl narxi topilmadi. Menyuni qayta sinxronlang.",
          });
      }

      let deliveryCalc =
        null;

      if (
        normalizedOrderType ===
        "delivery"
      ) {
        if (
          !location?.lat ||
          !location?.lng
        ) {
          return res
            .status(400)
            .json({
              message:
                "Yetkazish uchun lokatsiya shart.",
            });
        }

        try {
          deliveryCalc =
            await calcMilleniumDeliveryPrice({
              filialId,
              location,
            });
        } catch (
          calcError
        ) {
          return res
            .status(400)
            .json({
              message:
                `Taxi narxini Milleniumdan hisoblab bo'lmadi: ${calcError.message}`,
            });
        }
      }

      /*
       * Online to'lov faqat taomlar uchun.
       * Taxi pulini mijoz haydovchiga beradi.
       */
      const paymentAmount =
        serverTotal;

      const parsedPersons =
        Math.max(
          1,
          Math.min(
            30,
            Math.floor(
              Number(persons) ||
                1
            )
          )
        );

      const order =
        await new Order({
          customerName,
          customerPhone,

          persons:
            parsedPersons,

          items:
            serverItems,

          totalPrice:
            serverTotal,

          packagingTotal,

          deleverItemsCost,

          address,
          location,

          orderType:
            normalizedOrderType,

          paymentType:
            normalizedPaymentType,

          paymentProvider:
            normalizedPaymentType,

          paymentStatus:
            normalizedPaymentType ===
            "cash"
              ? "unpaid"
              : "pending",

          filialId:
            filialId ||
            null,

          filialName:
            orderFilial?.name ||
            filialName ||
            null,

          deliveryPrice:
            deliveryCalc
              ?.price ||
            0,

          deliveryPriceSource:
            deliveryCalc
              ?.source ||
            "",

          deliveryPriceCalculatedAt:
            deliveryCalc
              ? new Date()
              : null,

          deliveryPriceRaw:
            deliveryCalc
              ?.raw ||
            null,

          paymentAmount,

          status: "new",

          deleverRestaurantId:
            deleverConfig
              .restaurantId ||
            "",

          deleverSyncStatus:
            deleverConfig
              .orderEnabled
              ? "pending"
              : "not_required",
        }).save();

      if (
        normalizedPaymentType ===
        "payme"
      ) {
        order.paymentUrl =
          makePaymePaymentUrl(
            order
          );

        await order.save();
      }

      if (
        normalizedPaymentType ===
        "click"
      ) {
        order.paymentUrl =
          makeClickPaymentUrl(
            order
          );

        await order.save();
      }

      /*
       * Naqd pickup buyurtma darhol
       * fulfillment jarayoniga o'tadi.
       */
      if (
        normalizedPaymentType ===
        "cash"
      ) {
        const fulfillment =
          await fulfillAcceptedOrder(
            order
          );

        return res
          .status(201)
          .json({
            message:
              "Buyurtma qabul qilindi! ✅",

            order:
              fulfillment.order ||
              order,

            paymentUrl: "",
          });
      }

      return res
        .status(201)
        .json({
          message:
            "Buyurtma qabul qilindi! ✅",

          order,

          paymentUrl:
            order.paymentUrl ||
            "",
        });
    } catch (error) {
      return res
        .status(500)
        .json({
          message: "Xato",
          error:
            error.message,
        });
    }
  }
);

router.get(
  "/api/orders",
  auth,
  async (req, res) => {
    try {
      const filter =
        req.query.status
          ? {
              status:
                req.query.status,
            }
          : {};

      return res.json(
        await Order.find(
          filter
        ).sort({
          createdAt: -1,
        })
      );
    } catch {
      return res
        .status(500)
        .json({
          message: "Xato",
        });
    }
  }
);

const ordersMyMax =
  Number(
    process.env
      .ORDERS_MY_MAX
  ) || 30;

const ordersMyWindow =
  Number(
    process.env
      .ORDERS_MY_WINDOW_MS
  ) ||
  5 * 60 * 1000;

router.get(
  "/api/orders/my/:phone",

  rateLimit({
    windowMs:
      ordersMyWindow,

    max:
      ordersMyMax,
  }),

  async (req, res) => {
    try {
      const phone =
        decodeURIComponent(
          req.params.phone
        );

      if (
        !/^\+?\d{9,15}$/.test(
          phone
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Telefon raqami noto'g'ri.",
          });
      }

      return res.json(
        await Order.find({
          customerPhone:
            phone,
        })
          .sort({
            createdAt: -1,
          })
          .limit(20)
      );
    } catch {
      return res
        .status(500)
        .json({
          message: "Xato",
        });
    }
  }
);

router.put(
  "/api/orders/:id/status",
  auth,
  async (req, res) => {
    try {
      const {
        status,
      } = req.body;

      if (
        !ORDER_STATUSES.includes(
          status
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              "Noto'g'ri status!",
          });
      }

      const order =
        await Order.findByIdAndUpdate(
          req.params.id,
          {
            status,

            statusUpdatedBy:
              "Admin panel",
          },
          {
            new: true,
          }
        );

      if (!order) {
        return res
          .status(404)
          .json({
            message:
              "Topilmadi",
          });
      }

      if (
        order.tgChatId &&
        order.tgMessageId
      ) {
        await editStaffOrderMessage(
          order
        );
      } else if (
        STATUS_LABELS[status] &&
        status !== "new"
      ) {
        await sendTelegram(
          `${STATUS_LABELS[status]}\n👤 ${order.customerName} | 📞 ${order.customerPhone}`
        );
      }

      return res.json(order);
    } catch {
      return res
        .status(500)
        .json({
          message: "Xato",
        });
    }
  }
);

router.delete(
  "/api/orders/:id",
  auth,
  async (req, res) => {
    try {
      await Order
        .findByIdAndDelete(
          req.params.id
        );

      return res.json({
        message:
          "O'chirildi",
      });
    } catch {
      return res
        .status(500)
        .json({
          message: "Xato",
        });
    }
  }
);

router.post(
  "/api/admin/auto-cancel-run",
  auth,
  superAdmin,
  async (req, res) => {
    const cancelled =
      await autoCancelUnpaidOrders();

    return res.json({
      ok: true,
      cancelled,
    });
  }
);

module.exports = router;
