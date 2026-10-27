"""Copy welcome/category/story/banner assets into public/marketing/."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "marketing"
SOURCE_DIRS = [
    ROOT / "assets",
    ROOT.parents[1] / "assets",
    Path.home() / ".cursor" / "projects" / "c-Projects-Vivitel" / "assets",
]

COPY_MAP = {
    "welcome": [
        ("welcome-marine-hero", "marine-hero.jpg"),
        ("welcome-auto-hero", "auto-hero.jpg"),
        ("welcome-home-hero", "home-hero.jpg"),
        ("welcome-wearable-hero", "wearable-hero.jpg"),
        ("banner-fleet-performance", "fleet-performance.jpg"),
    ],
    "categories": [
        ("category-marine", "marine.jpg"),
        ("category-auto-home", "auto-home.jpg"),
        ("category-fleet-tracking", "fleet-tracking.jpg"),
    ],
    "stories": [
        ("story-branded-tshirts", "branded-tshirts.jpg"),
        ("story-branded-merch", "branded-merch.jpg"),
    ],
    "banners": [
        ("banner-fleet-performance", "fleet-performance.jpg"),
    ],
}


def find_source(stem: str) -> Path | None:
    for directory in SOURCE_DIRS:
        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            path = directory / f"{stem}{ext}"
            if path.exists():
                return path
    return None


def save_jpg(src: Path, dest: Path, max_w: int = 1600) -> None:
    img = Image.open(src).convert("RGB")
    if img.width > max_w:
        ratio = max_w / img.width
        img = img.resize((max_w, int(img.height * ratio)), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"  {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")


def main() -> None:
    for folder, items in COPY_MAP.items():
        print(folder)
        for stem, name in items:
            src = find_source(stem)
            if not src:
                print(f"  SKIP {stem}")
                continue
            save_jpg(src, PUBLIC / folder / name)


if __name__ == "__main__":
    main()
