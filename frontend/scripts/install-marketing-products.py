"""Copy generated product PNGs into public/marketing/products/ as optimized JPEGs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "marketing" / "products"
NAMES = [
    "product-vivi-track-wearable",
    "product-gps-tracker",
    "product-dashcam-ai",
    "product-handheld-gps",
    "product-fuel-module",
    "product-delivery-drone",
    "product-in-cab-display",
    "product-fleet-radio",
    "product-cold-chain",
    "product-mobile-fleet",
]
SOURCE_DIRS = [
    ROOT / "assets",
    ROOT.parents[1] / "assets",
    Path.home() / ".cursor" / "projects" / "c-Projects-Vivitel" / "assets",
]


def find_png(stem: str) -> Path | None:
    for directory in SOURCE_DIRS:
        for ext in (".png", ".jpg", ".jpeg"):
            candidate = directory / f"{stem}{ext}"
            if candidate.exists():
                return candidate
    return None


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for stem in NAMES:
        src = find_png(stem)
        if not src:
            print(f"SKIP missing {stem}")
            continue
        img = Image.open(src).convert("RGB")
        w, h = img.size
        if w > 900:
            ratio = 900 / w
            img = img.resize((900, int(h * ratio)), Image.Resampling.LANCZOS)
        dest = OUT / f"{stem}.jpg"
        img.save(dest, "JPEG", quality=88, optimize=True, progressive=True)
        print(f"OK {dest.name} ({dest.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
