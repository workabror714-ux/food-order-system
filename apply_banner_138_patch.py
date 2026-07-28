#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
CSS_PATH = ROOT / "client" / "src" / "App.css"
MARKER = "/* === YALPIZ MOBILE BANNER 138PX FIX === */"

PATCH = r'''
/* === YALPIZ MOBILE BANNER 138PX FIX === */
@media (max-width: 640px) {
  .g-hero-viewport {
    width: 100%;
    height: 138px;
    min-height: 138px;
    max-height: 138px;
    aspect-ratio: auto;
    margin-bottom: 10px;
    overflow: hidden;
    background: linear-gradient(135deg, #143a22 0%, #1a5c30 60%, #2d7a42 100%);
  }

  .g-hero-track,
  .g-hero-slide {
    height: 138px;
    min-height: 138px;
    max-height: 138px;
  }

  .g-hero-slide {
    padding: 9px 12px;
    align-items: center;
  }

  .g-hero-media.is-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center center;
    animation: none;
    background: transparent;
  }

  .g-hero-media:not(.is-image) {
    object-fit: cover;
    object-position: center center;
  }

  .g-hero-content {
    min-width: 0;
    max-height: 120px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .g-hero-logo {
    height: 18px;
    width: auto;
    max-width: 78px;
    margin-bottom: 3px;
  }

  .g-hero-title {
    font-size: 0.82rem;
    line-height: 1.08;
    margin-bottom: 2px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .g-hero-desc {
    font-size: 0.64rem;
    line-height: 1.15;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .g-hero-events {
    gap: 4px;
    margin-top: 4px;
    max-height: 21px;
    overflow: hidden;
  }

  .g-hero-event {
    padding: 2px 6px;
    font-size: 0.6rem;
    line-height: 1.15;
  }

  .g-hero-btn {
    margin-top: 4px;
    padding: 4px 10px;
    font-size: 0.64rem;
    line-height: 1.1;
  }

  .g-hero-progress {
    margin-top: 6px;
  }

  .sk-banner {
    height: 138px;
    min-height: 138px;
    max-height: 138px;
  }
}
/* === /YALPIZ MOBILE BANNER 138PX FIX === */
'''

if not CSS_PATH.exists():
    print("XATO: client/src/App.css topilmadi.")
    sys.exit(1)

content = CSS_PATH.read_text(encoding="utf-8")
if MARKER in content:
    print("SKIP: patch oldin qo'shilgan.")
    sys.exit(0)

backup = CSS_PATH.with_suffix(".css.before_banner_138.bak")
if not backup.exists():
    shutil.copy2(CSS_PATH, backup)

with CSS_PATH.open("a", encoding="utf-8") as f:
    f.write("\n\n" + PATCH.strip() + "\n")

print("OK: client/src/App.css yangilandi.")
print("Keyingi buyruq: npm run build --prefix client")
