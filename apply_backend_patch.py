#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
SCRIPT_DIR = Path(__file__).resolve().parent

def fail(message: str) -> None:
    print(f"\nXATO: {message}")
    sys.exit(1)

server_path = ROOT / "server" / "server.js"
routes_dir = ROOT / "server" / "routes"

if not server_path.exists() or not routes_dir.exists():
    fail("Skriptni food-order-system loyihasining root papkasida ishga tushiring.")

route_source = SCRIPT_DIR / "geocode.routes.js"
route_target = routes_dir / "geocode.routes.js"
shutil.copy2(route_source, route_target)
print("OK: server/routes/geocode.routes.js")

content = server_path.read_text(encoding="utf-8")
mount_line = 'app.use(require("./routes/geocode.routes"));\n'

if mount_line not in content:
    anchor = 'app.use(require("./routes/filials.routes"));\n'
    if anchor not in content:
        fail("server/server.js ichida filials route topilmadi.")
    backup = server_path.with_suffix(".js.before_geocode_fix.bak")
    if not backup.exists():
        shutil.copy2(server_path, backup)
    content = content.replace(anchor, anchor + mount_line, 1)
    server_path.write_text(content, encoding="utf-8")
    print("OK: server/server.js")
else:
    print("SKIP: geocode route oldin qo‘shilgan")

print("\nBACKEND PATCH TAYYOR ✅")
print("Tekshiruv:")
print("  node --check server/server.js")
print("  node --check server/routes/geocode.routes.js")
