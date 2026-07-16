const router = require("express").Router();

const { auth, superAdmin } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");

const Order = require("../models/Order");
const Food = require("../models/Food");

const { getFilial } = require("../services/filials");
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
  getConfig: getDeleverConfig,
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

/*
|--------------------------------------------------------------------------
| MILLENIUM DELIVERY PRICE
|--------------------------------------------------------------------------
*/

router.post(
  "/api/millenium/calc-price",
  async (req, res) => {
    try {
      const {
        filialId,
        location,
      } = req.body || {};

      const cpFilial = getFilial(filialId);

      if (!filialId || !cpFilial) {
        return res.status(400).json({
          success: false,
          message:
            "Filial noto'g'ri yoki tanlanmagan",
        });
      }

      if (cpFilial.isActive === false) {
        return res.status(400).json({
          success: false,
          message:
            "Bu filial vaqtincha yopiq",
        });
      }

      if (!location?.lat || !location?.lng) {
        return res.status(400).json({
          success: false,
          message: "Lokatsiya kerak",
        });
      }

      const result =
        await calcMilleniumDeliveryPrice({
          filialId,
          location,
        });

      return res.json({
        success: true,
        price: result.price,
        source: result.source,

        filial: {
          id: filialId,
          name: result.restaurant.name,
        },

        raw: result.raw?.data || null,
      });
    } catch (error) {
      console.error(
        "Millenium calc-price xato:",
        error.message
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Millenium narxini hisoblab bo'lmadi",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CREATE ORDER
|--------------------------------------------------------------------------
*/

router.post("/api/orders", async (req, res) => {
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
    } = req.body || {};

    /*
     * Asosiy maydonlarni tekshirish
     */
    if (
      !customerName ||
      !customerPhone ||
      !Array.isArray(items) ||
      !items.length
    ) {
      return res.status(400).json({
        message:
          "Ism, telefon va taomlar shart!",
      });
    }

    const normalizedOrderType =
      orderType || "delivery";

    const normalizedPaymentType =
      paymentType || "click";

    /*
     * Buyurtma turi
     */
    if (
      !["delivery", "pickup"].includes(
        normalizedOrderType
      )
    ) {
      return res.status(400).json({
        message: "Buyurtma turi noto'g'ri.",
      });
    }

    /*
     * To‘lov turi
     */
    if (
      !["click", "payme", "cash"].includes(
        normalizedPaymentType
      )
    ) {
      return res.status(400).json({
        message: "To'lov turi noto'g'ri.",
      });
    }

    /*
     * Naqd to‘lov faqat olib ketish uchun
     */
    if (
      normalizedPaymentType === "cash" &&
      normalizedOrderType !== "pickup"
    ) {
      return res.status(400).json({
        message:
          "Naqd to'lov faqat olib ketishda mumkin. " +
          "Yetkazib berishda online to'lov shart.",
      });
    }

    /*
     * Filialni tekshirish
     */
    const orderFilial = getFilial(filialId);

    if (filialId && !orderFilial) {
      return res.status(400).json({
        message:
          "Tanlangan filial topilmadi.",
      });
    }

    if (
      filialId &&
      orderFilial?.isActive === false
    ) {
      return res.status(400).json({
        message:
          "Tanlangan filial vaqtincha yopiq. " +
          "Boshqa filialni tanlang.",
      });
    }

    /*
     * Savat elementlarini tozalash
     */
    const cartItems = items.filter(Boolean);

    if (!cartItems.length) {
      return res.status(400).json({
        message: "Savat bo'sh.",
      });
    }

    /*
     * Taom ID va miqdorni tekshirish
     */
    for (const item of cartItems) {
      const foodId = String(
        item.foodId || ""
      );

      if (
        !/^[a-f0-9]{24}$/i.test(foodId)
      ) {
        return res.status(400).json({
          message:
            "Taom ID noto'g'ri. " +
            "Savatni yangilang.",
        });
      }

      const quantity = Number(
        item.quantity
      );

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        return res.status(400).json({
          message:
            "Taom miqdori 1 dan 99 gacha " +
            "bo'lgan butun son bo'lishi kerak.",
        });
      }
    }

    /*
     * Takroriy IDlarni olib tashlash
     */
    const wantedIds = [
      ...new Set(
        cartItems.map((item) =>
          String(item.foodId)
        )
      ),
    ];

    /*
     * Taomlarni bazadan olish
     *
     * Frontend yuborgan narxga ishonilmaydi.
     */
    const dbFoods = await Food.find({
      _id: {
        $in: wantedIds,
      },
    }).select(
      [
        "title",
        "price",
        "isAvailable",
        "isDeletedInSource",
        "deleverId",
        "deleverRestaurantId",
        "source",
      ].join(" ")
    );

    /*
     * Savatdagi barcha taomlar topildimi
     */
    if (
      dbFoods.length !== wantedIds.length
    ) {
      return res.status(400).json({
        message:
          "Savatdagi ayrim taomlar topilmadi. " +
          "Savatni yangilang.",
      });
    }

    /*
     * Stop-list yoki o‘chirilgan taomni bloklash
     */
    const unavailableFood = dbFoods.find(
      (food) =>
        food.isAvailable === false ||
        food.isDeletedInSource === true
    );

    if (unavailableFood) {
      const title =
        unavailableFood.title?.uz ||
        unavailableFood.title?.ru ||
        "Tanlangan taom";

      return res.status(400).json({
        message:
          `${title} hozircha mavjud emas. ` +
          "Iltimos, savatdan olib tashlang.",
      });
    }

    const foodMap = new Map(
      dbFoods.map((food) => [
        String(food._id),
        food,
      ])
    );

    /*
     * Delever sozlamalari
     */
    const deleverConfig =
      getDeleverConfig();

    /*
     * Buyurtma Deleverga yuboriladigan bo‘lsa,
     * barcha taomlar Delever menyusiga tegishli
     * bo‘lishi kerak.
     */
    const requireExternalItems =
      String(
        process.env
          .DELEVER_REQUIRE_EXTERNAL_ITEMS ||
          "true"
      ).toLowerCase() !== "false";

    if (
      deleverConfig.orderEnabled &&
      requireExternalItems
    ) {
      const invalidDeleverFood =
        dbFoods.find((food) => {
          /*
           * Local yoki Delever ID yo‘q
           */
          if (
            food.source !== "delever" ||
            !food.deleverId
          ) {
            return true;
          }

          /*
           * Boshqa restoranga tegishli taom
           */
          if (
            food.deleverRestaurantId &&
            deleverConfig.restaurantId &&
            String(
              food.deleverRestaurantId
            ) !==
              String(
                deleverConfig.restaurantId
              )
          ) {
            return true;
          }

          return false;
        });

      if (invalidDeleverFood) {
        const title =
          invalidDeleverFood.title?.uz ||
          invalidDeleverFood.title?.ru ||
          "Tanlangan taom";

        return res.status(409).json({
          message:
            `${title} amaldagi Delever ` +
            "menyusi bilan mos emas. " +
            "Savatni yangilang.",
        });
      }
    }

    /*
     * Buyurtma taomlarini serverda yaratish
     *
     * Narx faqat MongoDBdan olinadi.
     */
    const serverItems = cartItems.map(
      (cartItem) => {
        const food = foodMap.get(
          String(cartItem.foodId)
        );

        return {
          foodId: String(cartItem.foodId),

          deleverProductId: String(
            food.deleverId || ""
          ),

          title: String(
            food.title?.uz ||
              food.title?.ru ||
              cartItem.title ||
              "Taom"
          ),

          price:
            Number(food.price) || 0,

          quantity: Number(
            cartItem.quantity
          ),

          modifiers: [],
        };
      }
    );

    /*
     * Jami narxni server hisoblaydi
     */
    const serverTotal =
      serverItems.reduce(
        (sum, item) =>
          sum +
          item.price * item.quantity,
        0
      );

    if (
      !Number.isFinite(serverTotal) ||
      serverTotal <= 0
    ) {
      return res.status(400).json({
        message:
          "Buyurtma summasi noto'g'ri. " +
          "Savatni yangilang.",
      });
    }

    /*
     * Yetkazib berish narxini Milleniumdan olish
     */
    let deliveryCalc = null;

    if (
      normalizedOrderType === "delivery"
    ) {
      if (
        !location?.lat ||
        !location?.lng
      ) {
        return res.status(400).json({
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
      } catch (calcError) {
        return res.status(400).json({
          message:
            "Taxi narxini Milleniumdan " +
            `hisoblab bo'lmadi: ${calcError.message}`,
        });
      }
    }

    /*
     * Online to‘lov summasi faqat taomlar uchun.
     *
     * Taxi puli mijoz tomonidan haydovchiga
     * alohida to‘lanadi.
     */
    const paymentAmount = serverTotal;

    /*
     * Buyurtmani bazaga saqlash
     */
    const order = await new Order({
      customerName:
        String(customerName).trim(),

      customerPhone:
        String(customerPhone).trim(),

      items: serverItems,

      totalPrice: serverTotal,

      address: address || "",

      location: location || null,

      orderType:
        normalizedOrderType,

      paymentType:
        normalizedPaymentType,

      paymentProvider:
        normalizedPaymentType,

      paymentStatus:
        normalizedPaymentType === "cash"
          ? "unpaid"
          : "pending",

      filialId: filialId || null,

      filialName:
        filialName ||
        orderFilial?.name ||
        null,

      deliveryPrice:
        deliveryCalc?.price || 0,

      deliveryPriceSource:
        deliveryCalc?.source || "",

      deliveryPriceCalculatedAt:
        deliveryCalc
          ? new Date()
          : null,

      deliveryPriceRaw:
        deliveryCalc?.raw || null,

      paymentAmount,

      status: "new",

      /*
       * Delever order integratsiyasi o‘chiq bo‘lsa,
       * bu buyurtma keyinchalik tasodifan yuborilmaydi.
       */
      deleverSyncStatus:
        deleverConfig.orderEnabled
          ? "pending"
          : "not_required",
    }).save();

    /*
     * Payme to‘lov URL
     */
    if (
      normalizedPaymentType === "payme"
    ) {
      order.paymentUrl =
        makePaymePaymentUrl(order);

      await order.save();
    }

    /*
     * Click to‘lov URL
     */
    if (
      normalizedPaymentType === "click"
    ) {
      order.paymentUrl =
        makeClickPaymentUrl(order);

      await order.save();
    }

    /*
     * Naqd pickup buyurtma:
     *
     * to‘lovni kutmasdan oshxonaga yuboriladi.
     */
    if (
      normalizedPaymentType === "cash"
    ) {
      const fulfillment =
        await fulfillAcceptedOrder(order);

      return res.status(201).json({
        message:
          "Buyurtma qabul qilindi! ✅",

        order:
          fulfillment.order || order,

        paymentUrl: "",
      });
    }

    /*
     * Click va Payme:
     *
     * taxi va oshxona xabari to‘lov
     * tasdiqlangandan keyin yuboriladi.
     */
    return res.status(201).json({
      message:
        "Buyurtma qabul qilindi! ✅",

      order,

      paymentUrl:
        order.paymentUrl || "",
    });
  } catch (error) {
    console.error(
      "Order yaratish xato:",
      error.message
    );

    return res.status(500).json({
      message: "Xato",
      error: error.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| ADMIN: ORDERS LIST
|--------------------------------------------------------------------------
*/

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

      const orders = await Order.find(
        filter
      ).sort({
        createdAt: -1,
      });

      return res.json(orders);
    } catch (error) {
      console.error(
        "Orders list xato:",
        error.message
      );

      return res.status(500).json({
        message: "Xato",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CUSTOMER: OWN ORDERS
|--------------------------------------------------------------------------
*/

const ordersMyMax =
  Number(
    process.env.ORDERS_MY_MAX
  ) || 30;

const ordersMyWindow =
  Number(
    process.env.ORDERS_MY_WINDOW_MS
  ) ||
  5 * 60 * 1000;

router.get(
  "/api/orders/my/:phone",

  rateLimit({
    windowMs: ordersMyWindow,
    max: ordersMyMax,
  }),

  async (req, res) => {
    try {
      const phone =
        decodeURIComponent(
          req.params.phone
        );

      /*
       * Faqat to‘liq telefon raqami
       */
      if (
        !/^\+?\d{9,15}$/.test(phone)
      ) {
        return res.status(400).json({
          message:
            "Telefon raqami noto'g'ri.",
        });
      }

      const orders = await Order.find({
        customerPhone: phone,
      })
        .sort({
          createdAt: -1,
        })
        .limit(20);

      return res.json(orders);
    } catch (error) {
      console.error(
        "Customer orders xato:",
        error.message
      );

      return res.status(500).json({
        message: "Xato",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| UPDATE ORDER STATUS
|--------------------------------------------------------------------------
*/

router.put(
  "/api/orders/:id/status",
  auth,
  async (req, res) => {
    try {
      const {
        status,
      } = req.body || {};

      if (
        !ORDER_STATUSES.includes(status)
      ) {
        return res.status(400).json({
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
        return res.status(404).json({
          message: "Topilmadi",
        });
      }

      /*
       * Xodimlar guruhidagi Telegram xabarini
       * yangi status bilan yangilash
       */
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
          `${STATUS_LABELS[status]}\n` +
            `👤 ${order.customerName} | ` +
            `📞 ${order.customerPhone}`
        );
      }

      return res.json(order);
    } catch (error) {
      console.error(
        "Order status update xato:",
        error.message
      );

      return res.status(500).json({
        message: "Xato",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE ORDER
|--------------------------------------------------------------------------
*/

router.delete(
  "/api/orders/:id",
  auth,
  async (req, res) => {
    try {
      const order =
        await Order.findByIdAndDelete(
          req.params.id
        );

      if (!order) {
        return res.status(404).json({
          message: "Topilmadi",
        });
      }

      return res.json({
        message: "O'chirildi",
      });
    } catch (error) {
      console.error(
        "Order delete xato:",
        error.message
      );

      return res.status(500).json({
        message: "Xato",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN: AUTO CANCEL
|--------------------------------------------------------------------------
*/

router.post(
  "/api/admin/auto-cancel-run",
  auth,
  superAdmin,
  async (req, res) => {
    try {
      const cancelled =
        await autoCancelUnpaidOrders();

      return res.json({
        ok: true,
        cancelled,
      });
    } catch (error) {
      console.error(
        "Auto cancel xato:",
        error.message
      );

      return res.status(500).json({
        ok: false,
        message: error.message,
      });
    }
  }
);

module.exports = router;