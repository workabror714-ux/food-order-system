#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
CSS_PATH = ROOT / "client" / "src" / "App.css"
MARKER = "/* === YALPIZ BANNER RESPONSIVE WIDTH FIX === */"

PATCH = """
/* === YALPIZ BANNER RESPONSIVE WIDTH FIX === */
@media (max-width: 640px) {
  .g-hero-viewport {
    width: 100%;
    height: 138px;
    min-height: 138px;
    max-height: 138px;
    overflow: hidden;
  }

  .g-hero-track,
  .g-hero-slide {
    width: 100%;
    height: 138px;
    min-height: 138px;
    max-height: 138px;
  }

  .g-hero-media.is-image {
    position: absolute;
    inset: -1px;
    width: calc(100% + 2px);
    height: calc(100% + 2px);
    max-width: none;
    display: block;
    object-fit: cover !important;
    object-position: center center;
    background: transparent;
    animation: none;
  }
}
/* === /YALPIZ BANNER RESPONSIVE WIDTH FIX === */
"""

if not CSS_PATH.exists():
    print("XATO: client/src/App.css topilmadi.")
    sys.exit(1)

content = CSS_PATH.read_text(encoding="utf-8")
if MARKER in content:
    print("SKIP: patch oldin qo'shilgan.")
    sys.exit(0)

backup = CSS_PATH.with_suffix(".css.before_banner_width_fix.bak")
if not backup.exists():
    shutil.copy2(CSS_PATH, backup)

with CSS_PATH.open("a", encoding="utf-8") as f:
    f.write("\n\n" + PATCH.strip() + "\n")

print("OK: client/src/App.css yangilandi.")
print("Keyingi buyruq: npm run build --prefix client")
