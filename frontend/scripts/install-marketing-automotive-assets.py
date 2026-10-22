"""Install Auto & Home (automotive) hero + 6 category tiles from reference screenshots."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "marketing" / "automotive"
ASSETS = Path.home() / ".cursor" / "projects" / "c-Projects-Vivitel" / "assets"

HERO_SRC = (
    ASSETS
    / "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-3835ae43-9640-4d3f-83f8-43efe95f634f.png"
)
GRID_SRC = (
    ASSETS
    / "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-793c7e80-ec17-4ccf-81bf-923403061b26.png"
)

TILE_NAMES = [
    "cars-rv-cameras",
    "motorcycles",
    "trucks",
    "off-road-motorsports",
    "car-audio",
    "home-audio",
]


def save_jpg(img: Image.Image, dest: Path, max_w: int | None = 1600) -> None:
    rgb = img.convert("RGB")
    if max_w and rgb.width > max_w:
        ratio = max_w / rgb.width
        rgb = rgb.resize((max_w, int(rgb.height * ratio)), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(dest, "JPEG", quality=90, optimize=True, progressive=True)
    print(f"  {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")


def crop_grid_tiles(grid: Image.Image) -> list[Image.Image]:
    """Crop 3x2 grid; trim outer margins from screenshot."""
    w, h = grid.size
    # Drop browser chrome / title area at top (~8%)
    top = int(h * 0.08)
    body = grid.crop((0, top, w, h))
    bw, bh = body.size
    cols, rows = 3, 2
    tiles: list[Image.Image] = []
    for row in range(rows):
        for col in range(cols):
            x0 = col * bw // cols
            x1 = (col + 1) * bw // cols
            y0 = row * bh // rows
            y1 = (row + 1) * bh // rows
            tiles.append(body.crop((x0, y0, x1, y1)))
    return tiles


def main() -> None:
    if not HERO_SRC.exists():
        raise SystemExit(f"Missing hero reference: {HERO_SRC}")
    if not GRID_SRC.exists():
        raise SystemExit(f"Missing grid reference: {GRID_SRC}")

    hero = Image.open(HERO_SRC)
    # Hero screenshot includes title band — keep photo area (~top 85%)
    hw, hh = hero.size
    photo_h = int(hh * 0.82)
    hero_photo = hero.crop((0, 0, hw, photo_h))
    save_jpg(hero_photo, OUT / "hero.jpg", max_w=1920)

    grid = Image.open(GRID_SRC)
    tiles = crop_grid_tiles(grid)
    for name, tile in zip(TILE_NAMES, tiles, strict=True):
        save_jpg(tile, OUT / f"{name}.jpg", max_w=900)

    print("Done.")


if __name__ == "__main__":
    main()
