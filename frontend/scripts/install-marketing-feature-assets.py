"""Install VIVI feature marketing graphics (01–06 + hardware) into public/marketing/features/."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "marketing" / "features"
ASSETS = Path.home() / ".cursor" / "projects" / "c-Projects-Vivitel" / "assets"

# User-provided feature slides (numbered 01–06 + hardware lineup)
SOURCES: list[tuple[str, str]] = [
    (
        "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-38475d8a-ca62-477d-a700-f54e461c2489.png",
        "live-gps-tracking.jpg",
    ),
    (
        "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-bd243d6d-2b05-4fae-b071-6771706e2731.png",
        "ai-driver-safety.jpg",
    ),
    (
        "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-3e3bd255-c544-4a91-86ea-5b87c7f70f4e.png",
        "fleet-analytics.jpg",
    ),
    (
        "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-6de4e159-b1a4-48aa-8482-6dfab8fecc03.png",
        "cloud-fleet-visibility.jpg",
    ),
    (
        "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-9b366e6b-d5b7-4635-b927-3212ea4d29ad.png",
        "vehicle-live-tracked.jpg",
    ),
    (
        "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-13ace2ad-3297-47e0-95e1-f55552930d79.png",
        "driver-dashcam.jpg",
    ),
    (
        "c__Users_kizza_AppData_Roaming_Cursor_User_workspaceStorage_96691da0885a90d4bd842d4f43cf3631_images_image-125e42d0-8020-4dfa-99d5-1d6e59fa3943.png",
        "hardware-devices.jpg",
    ),
]

# Legacy panel filenames still referenced in older paths — mirror for compatibility
PANEL_ALIASES: dict[str, str] = {
    "intro.jpg": "cloud-fleet-visibility.jpg",
    "fleet-visibility.jpg": "cloud-fleet-visibility.jpg",
    "gps-tracking.jpg": "live-gps-tracking.jpg",
    "harsh-braking.jpg": "ai-driver-safety.jpg",
    "route-history.jpg": "vehicle-live-tracked.jpg",
    "driver-fatigue.jpg": "ai-driver-safety.jpg",
    "fuel-monitoring.jpg": "fleet-analytics.jpg",
    "hardware-devices.jpg": "hardware-devices.jpg",
    "powerful-insights.jpg": "fleet-analytics.jpg",
}


def save_jpg(src: Path, dest: Path, max_w: int = 1920) -> None:
    rgb = Image.open(src).convert("RGB")
    if rgb.width > max_w:
        ratio = max_w / rgb.width
        rgb = rgb.resize((max_w, int(rgb.height * ratio)), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgb.save(dest, "JPEG", quality=90, optimize=True, progressive=True)
    print(f"  {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")


def main() -> None:
    panels_out = ROOT / "public" / "marketing" / "panels"
    for src_name, dest_name in SOURCES:
        src = ASSETS / src_name
        if not src.exists():
            raise SystemExit(f"Missing asset: {src}")
        save_jpg(src, OUT / dest_name)

    for panel_name, feature_name in PANEL_ALIASES.items():
        feature_path = OUT / feature_name
        if feature_path.exists():
            save_jpg(feature_path, panels_out / panel_name, max_w=1920)

    print("Done.")


if __name__ == "__main__":
    main()
