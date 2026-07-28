#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()


def fail(message: str) -> None:
    print(f"\nXATO: {message}")
    sys.exit(1)


def read(rel: str) -> tuple[Path, str]:
    path = ROOT / rel
    if not path.exists():
        fail(f"{rel} topilmadi. Skriptni food-order-system loyihasining root papkasida ishga tushiring.")
    return path, path.read_text(encoding="utf-8")


def save(path: Path, content: str) -> None:
    backup = path.with_suffix(path.suffix + ".before_delivery_only.bak")
    if not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(content, encoding="utf-8")
    print(f"OK: {path.relative_to(ROOT)}")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        fail(f"{label}: kutilgan blok {count} marta topildi (1 marta bo‘lishi kerak). GitHubdagi eng oxirgi versiyani tekshiring.")
    return content.replace(old, new, 1)


# 1) Telegram website confirmation route'ini serverdan uzish
path, content = read("server/server.js")
content = replace_once(
    content,
    """// Website naqd orderini Telegram orqali tasdiqlash.
// Bu route /webhook/telegram ni mavjud webhook route'dan oldin ushlashi kerak.
app.use(require("./routes/websiteConfirmation.routes"));
""",
    "",
    "website confirmation route mount",
)
save(path, content)

# 2) Website buyurtmasini backendda ham faqat delivery + Click/Payme qilish
path, content = read("server/routes/orders.routes.js")
content = replace_once(
    content,
    """        filialName,
        persons,
      } = req.body || {};""",
    """        filialName,
        persons,
        source,
      } = req.body || {};""",
    "source destructuring",
)
content = replace_once(
    content,
    """      const normalizedPaymentType =
        paymentType ||
        "click";
""",
    """      const normalizedPaymentType =
        paymentType ||
        "click";

      const normalizedSource =
        String(source || "")
          .trim()
          .toLowerCase();

      // Sayt buyurtmasi: faqat yetkazib berish va oldindan onlayn to'lov.
      // Botning mavjud pickup/cash oqimiga tegilmaydi.
      if (normalizedSource === "website") {
        if (normalizedOrderType !== "delivery") {
          return res
            .status(400)
            .json({
              message:
                "Sayt orqali faqat yetkazib berish buyurtmasi qabul qilinadi.",
            });
        }

        if (!["click", "payme"].includes(normalizedPaymentType)) {
          return res
            .status(400)
            .json({
              message:
                "Sayt orqali faqat Click yoki Payme bilan onlayn to'lov qilish mumkin.",
            });
        }
      }
""",
    "website delivery/payment guard",
)
save(path, content)

print("\nBACKEND PATCH TAYYOR ✅")
print("Keyingi tekshiruv: node --check server/server.js && node --check server/routes/orders.routes.js")
