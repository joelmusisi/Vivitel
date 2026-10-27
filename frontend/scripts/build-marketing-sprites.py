"""
Build marketing sprite sheets from royalty-free Unsplash photos (Unsplash License).
Run: python scripts/build-marketing-sprites.py
Output: public/marketing/pitch-deck.png, public/marketing/video-storyboard.png
"""

from __future__ import annotations

import sys
import urllib.request
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Installing Pillow...", file=sys.stderr)
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "-q"])
    from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "marketing"
CELL_W, CELL_H = 640, 400

# Curated Pexels images (Pexels License) — fleet, logistics, safety, fuel, video
def pexels(photo_id: int) -> str:
    return (
        f"https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg"
        "?auto=compress&cs=tinysrgb&w=800&h=500&fit=crop"
    )


IMAGES = [
    pexels(4484078),   # truck on road
    pexels(4489740),   # aerial logistics / port
    pexels(669996),    # laptop analytics
    pexels(2330114),   # driving / road
    pexels(4489125),   # warehouse boxes
    pexels(257736),    # fuel pump
    pexels(12165859),  # construction site
    pexels(3184292),   # business team
    pexels(147411),    # drone
    pexels(2670898),   # map on table
    pexels(1092644),   # smartphone
    pexels(1547148),   # bus / passenger
    pexels(4483612),   # shipping containers
    pexels(3807277),   # mechanic / workshop
    pexels(7688336),   # planning at desk
    pexels(2440924),   # car interior / tech
    pexels(1118448),   # night highway lights
    pexels(4481253),   # factory / industrial
    pexels(442150),    # security camera
    pexels(2367050),   # GPS / navigation screen
]


def download(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": "ViviTelematicsMarketing/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    img = Image.open(BytesIO(data)).convert("RGB")
    return img.resize((CELL_W, CELL_H), Image.Resampling.LANCZOS)


def build_sheet(indices: list[int], cols: int, rows: int, out_path: Path) -> None:
    sheet = Image.new("RGB", (cols * CELL_W, rows * CELL_H), (30, 41, 59))
    for i, idx in enumerate(indices):
        row, col = divmod(i, cols)
        url = IMAGES[idx % len(IMAGES)]
        print(f"  [{row},{col}] <- image {idx}")
        cell = download(url)
        sheet.paste(cell, (col * CELL_W, row * CELL_H))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path} ({sheet.size[0]}x{sheet.size[1]})")


def main() -> None:
    print("Downloading pitch-deck panels (2x4)...")
    pitch_indices = list(range(8))
    build_sheet(pitch_indices, cols=2, rows=4, out_path=OUT_DIR / "pitch-deck.png")

    print("Downloading video-storyboard panels (3x4)...")
    story_indices = [8, 9, 10, 1, 11, 12, 3, 13, 14, 5, 15, 16]
    while len(story_indices) < 12:
        story_indices.append(len(story_indices))
    build_sheet(story_indices[:12], cols=3, rows=4, out_path=OUT_DIR / "video-storyboard.png")

    # Standalone hero JPGs for direct use / social
    print("Writing standalone hero JPEGs...")
    heroes = [
        ("hero-fleet-tracking.jpg", 0),
        ("hero-ai-safety.jpg", 3),
        ("hero-analytics.jpg", 2),
        ("hero-video-telematics.jpg", 19),
    ]
    for name, idx in heroes:
        path = OUT_DIR / name
        download(IMAGES[idx]).save(path, "JPEG", quality=88, optimize=True)
        print(f"Wrote {path}")

    print("Done.")


if __name__ == "__main__":
    main()
