"""Install VIVI pitch-deck / storyboard from workspace assets into public/marketing."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "marketing"
PANELS = OUT / "panels"

SOURCE_CANDIDATES = [
    Path.home()
    / ".cursor"
    / "projects"
    / "c-Projects-Vivitel"
    / "assets"
    / "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_WhatsApp_Image_2026-06-01_at_17.26.37-50f0b5e3-5ef6-4122-aba1-d73e951325e4.png",
    Path.home()
    / ".cursor"
    / "projects"
    / "c-Projects-Vivitel"
    / "assets"
    / "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_WhatsApp_Image_2026-06-01_at_17.26.37-bada42ba-4434-4852-aa0e-d3f1899641cc.png",
    ROOT.parents[1] / "assets" / "pitch-deck-source.png",
]

PANEL_NAMES = [
    ("intro", 0, 0),
    ("fleet-visibility", 0, 1),
    ("gps-tracking", 0, 2),
    ("harsh-braking", 1, 0),
    ("route-history", 1, 1),
    ("driver-fatigue", 1, 2),
    ("fuel-monitoring", 2, 0),
    ("hardware-devices", 2, 1),
    ("powerful-insights", 2, 2),
]


def find_source() -> Path:
    for path in SOURCE_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError("No pitch-deck source image found in assets")


def main() -> None:
    src = find_source()
    img = Image.open(src).convert("RGB")
    w, h = img.size

    # Storyboard grid is top ~88% (exclude video chrome / footer bar when present)
    grid_h = int(h * 0.88)
    grid = img.crop((0, 0, w, grid_h))

    OUT.mkdir(parents=True, exist_ok=True)
    PANELS.mkdir(parents=True, exist_ok=True)

    grid.save(OUT / "pitch-deck.jpg", "JPEG", quality=90, optimize=True)
    grid.save(OUT / "video-storyboard.jpg", "JPEG", quality=90, optimize=True)
    print(f"Saved storyboard {grid.size[0]}x{grid.size[1]}")

    rows, cols = 3, 3
    cell_w = grid.size[0] // cols
    cell_h = grid.size[1] // rows

    for name, row, col in PANEL_NAMES:
        left = col * cell_w
        top = row * cell_h
        cell = grid.crop((left, top, left + cell_w, top + cell_h))
        dest = PANELS / f"{name}.jpg"
        cell.save(dest, "JPEG", quality=88, optimize=True)
        print(f"  panel {name}.jpg")

    # Footer / brand strip if present
    footer = img.crop((0, grid_h, w, h))
    if footer.height > 40:
        footer.save(OUT / "brand-footer.jpg", "JPEG", quality=88, optimize=True)
        print("  brand-footer.jpg")


if __name__ == "__main__":
    main()
