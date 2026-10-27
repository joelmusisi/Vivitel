"""Compress marketing PNG sprites for production (keeps dimensions)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "public" / "marketing"
MAX_PNG_BYTES = 900_000


def optimize_png(path: Path) -> None:
    img = Image.open(path).convert("RGB")
    jpg = path.with_suffix(".jpg")
    img.save(jpg, "JPEG", quality=84, optimize=True, progressive=True)
    if path.exists():
        path.unlink()
    print(f"Wrote {jpg.name} ({jpg.stat().st_size // 1024} KB)")


def optimize_jpg(path: Path) -> None:
    img = Image.open(path).convert("RGB")
    img.save(path, "JPEG", quality=84, optimize=True, progressive=True)
    print(f"Optimized {path.name} ({path.stat().st_size // 1024} KB)")


def main() -> None:
    for name in ("pitch-deck.png", "video-storyboard.png"):
        p = OUT / name
        if p.exists():
            optimize_png(p)
    for hero in OUT.glob("hero-*.jpg"):
        optimize_jpg(hero)


if __name__ == "__main__":
    main()
