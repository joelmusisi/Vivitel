# Marketing imagery

Primary marketing collages were generated as custom fleet-telematics artwork for VIVI Telematics (trucks, maps, dashcams, logistics, fuel, safety, and platform scenes). Optional regeneration can pull stock photos via `build-marketing-sprites.py` when network access to stock CDNs is available.

Regenerate sprite sheets (AI collages + resize):

```bash
cd frontend
python scripts/finalize-marketing-sprites.py
python scripts/optimize-marketing-images.py
```

Optional: download stock panels from the internet when available:

```bash
python scripts/build-marketing-sprites.py
```

Files:

- `pitch-deck.jpg` — 2×4 grid (1280×1600) for solution/feature crops
- `video-storyboard.jpg` — 3×4 grid (1920×1600) for video/marketing crops
- `hero-*.jpg` — standalone hero images
- `products/*.jpg` — Garmin-style white-background product shots (wearable, tracker, dashcam, radio, drone, etc.)

Install product photos:

```bash
python scripts/install-marketing-products.py
```
