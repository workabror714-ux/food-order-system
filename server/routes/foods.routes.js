const router =
  require("express")
    .Router();

const {
  auth,
} = require(
  "../middleware/auth"
);

const Food =
  require("../models/Food");

const getMenuSourceMode =
  () => {
    const mode =
      String(
        process.env
          .MENU_SOURCE_MODE ||
          "local"
      )
        .trim()
        .toLowerCase();

    if (
      [
        "local",
        "delever",
        "mixed",
      ].includes(mode)
    ) {
      return mode;
    }

    return "local";
  };

const syncedMenuLocked =
  () =>
    String(
      process.env
        .DELEVER_LOCK_SYNCED_MENU ||
        "true"
    ).toLowerCase() !==
    "false";

const rejectSyncedFoodEdit =
  async (id, res) => {
    if (
      !syncedMenuLocked()
    ) {
      return false;
    }

    const food =
      await Food
        .findById(id)
        .select(
          "source title"
        );

    if (
      food?.source !==
      "delever"
    ) {
      return false;
    }

    res
      .status(409)
      .json({
        message:
          "Bu taom Neon Alisa/Delever menyusidan kelgan. Uni Delever ichida o'zgartiring va Sinxronlash tugmasini bosing.",
      });

    return true;
  };

/*
 * Public menyuda faqat rasmi bor itemlar ko'rinadi.
 *
 * Delever'da keyin rasm qo'shilsa va admin sync qilsa,
 * item avtomatik ravishda menyuda paydo bo'ladi.
 */
const publicMenuFilter =
  () => ({
    isDeletedInSource: {
      $ne: true,
    },

    isAvailable:
      true,

    image: {
      $type:
        "string",

      $regex:
        /\S/,
    },
  });

router.get(
  "/api/admin/foods",
  auth,
  async (req, res) => {
    try {
      const limit = Math.min(
        1000,
        Math.max(1, Number(req.query.limit) || 500)
      );

      const foods = await Food.find({
        isDeletedInSource: { $ne: true },
      })
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
            "source",
            "deleverId",
            "deleverCategoryId",
            "deleverRestaurantId",
            "modifierGroups",
            "translatedModifierGroups",
            "sortOrder",
            "translationManual",
            "manualTranslationUpdatedAt",
            "lastSyncedAt",
          ].join(" ")
        )
        .sort({
          sortOrder: 1,
          createdAt: -1,
        })
        .limit(limit)
        .lean();

      return res.json({
        success: true,
        total: foods.length,
        foods,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

router.get(
  "/api/foods",
  async (req, res) => {
    try {
      const mode =
        getMenuSourceMode();

      const filter =
        publicMenuFilter();

      if (
        mode === "local"
      ) {
        filter.$or = [
          {
            source:
              "local",
          },
          {
            source: {
              $exists:
                false,
            },
          },
          {
            source:
              null,
          },
        ];
      }

      if (
        mode ===
        "delever"
      ) {
        filter.source =
          "delever";
      }

      if (
        req.query.category
      ) {
        filter[
          "category.uz"
        ] =
          req.query
            .category;
      }

      const foods =
        await Food
          .find(filter)
          .select(
            [
              "title",
              "category",
              "description",
              "price",
              "image",
              "isAvailable",
              "modifierGroups",
              "translatedModifierGroups",
              "deleverBasePrice",
              "packagingFee",
              "deleverId",
              "deleverCategoryId",
              "source",
              "sortOrder",
              "lastSyncedAt",
            ].join(" ")
          )
          .sort({
            sortOrder: 1,
            createdAt: -1,
          })
          .lean();

      res.set(
        "X-Menu-Source",
        mode
      );

      return res.json(
        foods
      );
    } catch (error) {
      console.error(
        "Foods list xato:",
        error.message
      );

      return res
        .status(500)
        .json({
          message:
            "Xato",
        });
    }
  }
);

router.get(
  "/api/foods/:id",
  async (req, res) => {
    try {
      const food =
        await Food.findOne({
          _id:
            req.params.id,

          ...publicMenuFilter(),
        });

      if (!food) {
        return res
          .status(404)
          .json({
            message:
              "Topilmadi",
          });
      }

      return res.json(
        food
      );
    } catch {
      return res
        .status(500)
        .json({
          message:
            "Xato",
        });
    }
  }
);

router.post(
  "/api/foods",
  auth,
  async (req, res) => {
    try {
      const {
        title_uz,
        title_ru,
        title_en,
        price,
        category_uz,
        category_ru,
        category_en,
        desc_uz,
        desc_ru,
        desc_en,
        imageUrl,
        isAvailable = true,
      } = req.body;

      if (!imageUrl) {
        return res
          .status(400)
          .json({
            message:
              "Rasm shart! Avval yuklang.",
          });
      }

      if (!title_uz) {
        return res
          .status(400)
          .json({
            message:
              "O'zbek tili nomi shart!",
          });
      }

      const food =
        await new Food({
          title: {
            uz:
              title_uz,

            ru:
              title_ru ||
              title_uz,

            en:
              title_en ||
              title_uz,
          },

          price:
            parseFloat(
              String(price)
                .replace(
                  /[^0-9.]/g,
                  ""
                )
            ) || 0,

          category: {
            uz:
              category_uz,

            ru:
              category_ru ||
              category_uz,

            en:
              category_en ||
              category_uz,
          },

          description: {
            uz:
              desc_uz ||
              "",

            ru:
              desc_ru ||
              "",

            en:
              desc_en ||
              "",
          },

          image:
            imageUrl,

          isAvailable:
            isAvailable !==
              false &&
            isAvailable !==
              "false",
        }).save();

      return res
        .status(201)
        .json(food);
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            "Xato: " +
            error.message,
        });
    }
  }
);

router.put(
  "/api/foods/:id",
  auth,
  async (req, res) => {
    try {
      if (
        await rejectSyncedFoodEdit(
          req.params.id,
          res
        )
      ) {
        return;
      }

      const {
        title_uz,
        title_ru,
        title_en,
        price,
        category_uz,
        category_ru,
        category_en,
        desc_uz,
        desc_ru,
        desc_en,
        imageUrl,
        isAvailable,
      } = req.body;

      const update = {
        price:
          parseFloat(
            String(price)
              .replace(
                /[^0-9.]/g,
                ""
              )
          ) || 0,

        title: {
          uz:
            title_uz,

          ru:
            title_ru ||
            title_uz,

          en:
            title_en ||
            title_uz,
        },

        category: {
          uz:
            category_uz,

          ru:
            category_ru ||
            category_uz,

          en:
            category_en ||
            category_uz,
        },

        description: {
          uz:
            desc_uz ||
            "",

          ru:
            desc_ru ||
            "",

          en:
            desc_en ||
            "",
        },
      };

      if (
        isAvailable !==
        undefined
      ) {
        update.isAvailable =
          isAvailable !==
            false &&
          isAvailable !==
            "false";
      }

      if (imageUrl) {
        update.image =
          imageUrl;
      }

      const updated =
        await Food
          .findByIdAndUpdate(
            req.params.id,
            update,
            {
              new: true,
            }
          );

      if (!updated) {
        return res
          .status(404)
          .json({
            message:
              "Topilmadi",
          });
      }

      return res.json(
        updated
      );
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            "Xato: " +
            error.message,
        });
    }
  }
);

router.patch(
  "/api/foods/:id/availability",
  auth,
  async (req, res) => {
    try {
      if (
        await rejectSyncedFoodEdit(
          req.params.id,
          res
        )
      ) {
        return;
      }

      const {
        isAvailable,
      } = req.body;

      const food =
        await Food
          .findByIdAndUpdate(
            req.params.id,
            {
              isAvailable:
                isAvailable !==
                  false &&
                isAvailable !==
                  "false",
            },
            {
              new: true,
            }
          );

      if (!food) {
        return res
          .status(404)
          .json({
            message:
              "Topilmadi",
          });
      }

      return res.json(
        food
      );
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            "Xato",
        });
    }
  }
);

router.delete(
  "/api/foods/:id",
  auth,
  async (req, res) => {
    try {
      if (
        await rejectSyncedFoodEdit(
          req.params.id,
          res
        )
      ) {
        return;
      }

      await Food
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
          message:
            "Xato",
        });
    }
  }
);

module.exports =
  router;
