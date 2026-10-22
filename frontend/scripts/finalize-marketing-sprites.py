"""Resize generated collage sources into marketing sprite sheets + hero JPEGs."""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "-q"])
    from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "marketing"
SOURCE_DIRS = [
    ROOT / "assets",
    ROOT.parents[1] / "assets",
    Path.home() / ".cursor" / "projects" / "c-Projects-Vivitel" / "assets",
]


def find_source(name: str) -> Path | None:
    for directory in SOURCE_DIRS:
        candidate = directory / name
        if candidate.exists():
            return candidate
    return None


PITCH_SRC = find_source("pitch-deck-source.png")
STORY_SRC = find_source("video-storyboard-source.png")
PITCH_SIZE = (1280, 1600)  # 2 x 640, 4 x 400
STORY_SIZE = (1920, 1600)  # 3 x 640, 4 x 400
CELL = (640, 400)


def resize_cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / img.width, target_h / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    if PITCH_SRC and PITCH_SRC.exists():
        pitch = Image.open(PITCH_SRC).convert("RGB")
        pitch = resize_cover(pitch, PITCH_SIZE)
        pitch.save(OUT / "pitch-deck.png", "PNG", optimize=True)
        print(f"Wrote pitch-deck.png {PITCH_SIZE}")

        heroes = [
            ("hero-fleet-tracking.jpg", 0, 0),
            ("hero-analytics.jpg", 1, 0),
            ("hero-ai-safety.jpg", 0, 1),
            ("hero-video-telematics.jpg", 1, 1),
        ]
        for name, col, row in heroes:
            box = (col * CELL[0], row * CELL[1], (col + 1) * CELL[0], (row + 1) * CELL[1])
            pitch.crop(box).save(OUT / name, "JPEG", quality=88, optimize=True)
            print(f"Wrote {name}")
    else:
        print("Missing pitch-deck-source.png", file=sys.stderr)

    if STORY_SRC and STORY_SRC.exists():
        story = Image.open(STORY_SRC).convert("RGB")
        story = resize_cover(story, STORY_SIZE)
        story.save(OUT / "video-storyboard.png", "PNG", optimize=True)
        print(f"Wrote video-storyboard.png {STORY_SIZE}")
        story.crop((CELL[0], CELL[1], CELL[0] * 2, CELL[1] * 2)).save(
            OUT / "hero-platform.jpg", "JPEG", quality=88, optimize=True
        )
        print("Wrote hero-platform.jpg")
    else:
        print("Missing video-storyboard-source.png", file=sys.stderr)


if __name__ == "__main__":
    main()
