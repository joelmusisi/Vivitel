import { decode, encode } from "fast-png";

export const ALERT_MAP_CID = "vivi-alert-map";
export type AlertMapAttachment = { filename: string; content: string; content_id: string; content_type: string };

const TILE = 256;
const OUT_W = 640;
const OUT_H = 320;
const ZOOM = 16;

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

function worldPixel(lat: number, lng: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  };
}

async function fetchTileRgba(x: number, y: number, z: number): Promise<Uint8Array | null> {
  const max = 2 ** z;
  const wrappedX = ((x % max) + max) % max;
  if (y < 0 || y >= max) return null;
  const url = `https://mt${(wrappedX + y) % 4}.google.com/vt/lyrs=m&x=${wrappedX}&y=${y}&z=${z}`;
  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 ViviTelematics" } });
    if (!response.ok) return null;
    const png = decode(new Uint8Array(await response.arrayBuffer()));
    if (png.width !== TILE || png.height !== TILE || png.depth !== 8) return null;
    const out = new Uint8Array(TILE * TILE * 4);
    const palette = png.palette as number[][] | undefined;
    for (let i = 0; i < TILE * TILE; i++) {
      const o = i * 4;
      if (palette && png.channels === 1) {
        const color = palette[png.data[i]] ?? [255, 255, 255];
        out[o] = color[0];
        out[o + 1] = color[1];
        out[o + 2] = color[2];
        out[o + 3] = 255;
      } else if (png.channels === 1) {
        out[o] = out[o + 1] = out[o + 2] = png.data[i];
        out[o + 3] = 255;
      } else {
        const s = i * png.channels;
        out[o] = png.data[s];
        out[o + 1] = png.data[s + 1];
        out[o + 2] = png.data[s + 2];
        out[o + 3] = png.channels === 4 ? png.data[s + 3] : 255;
      }
    }
    return out;
  } catch {
    return null;
  }
}

const inTriangle = (px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

function drawPin(rgba: Uint8Array, tipX: number, tipY: number) {
  const headY = tipY - 32;
  const sample = (px: number, py: number, grow: number) => {
    const head = Math.hypot(px - tipX, py - headY) <= 14 + grow;
    const tail = inTriangle(px, py, tipX - 12 - grow, headY + 6, tipX + 12 + grow, headY + 6, tipX, tipY + grow * 1.5);
    return head || tail;
  };
  const blend = (index: number, r: number, g: number, b: number, a: number) => {
    rgba[index] = rgba[index] * (1 - a) + r * a;
    rgba[index + 1] = rgba[index + 1] * (1 - a) + g * a;
    rgba[index + 2] = rgba[index + 2] * (1 - a) + b * a;
  };
  const x0 = Math.max(0, Math.floor(tipX - 24));
  const x1 = Math.min(OUT_W - 1, Math.ceil(tipX + 24));
  const y0 = Math.max(0, Math.floor(headY - 24));
  const y1 = Math.min(OUT_H - 1, Math.ceil(tipY + 8));
  const SS = 3;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let outline = 0;
      let fill = 0;
      let dot = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (sample(px, py, 2)) outline++;
          if (sample(px, py, 0)) fill++;
          if (Math.hypot(px - tipX, py - headY) <= 5) dot++;
        }
      }
      const n = SS * SS;
      const index = (y * OUT_W + x) * 4;
      if (outline) blend(index, 255, 255, 255, outline / n);
      if (fill) blend(index, 229, 62, 62, fill / n);
      if (dot) blend(index, 255, 255, 255, dot / n);
    }
  }
}

export async function renderAlertMapPng(latitude?: number, longitude?: number): Promise<Uint8Array | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const center = worldPixel(latitude as number, longitude as number, ZOOM);
  const left = center.x - OUT_W / 2;
  const top = center.y - OUT_H / 2;
  const tx0 = Math.floor(left / TILE);
  const tx1 = Math.floor((left + OUT_W - 1) / TILE);
  const ty0 = Math.floor(top / TILE);
  const ty1 = Math.floor((top + OUT_H - 1) / TILE);

  const jobs: Array<Promise<{ tx: number; ty: number; data: Uint8Array | null }>> = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(fetchTileRgba(tx, ty, ZOOM).then((data) => ({ tx, ty, data })));
    }
  }
  const tiles = await Promise.all(jobs);
  if (!tiles.some((tile) => tile.data)) return null;

  const rgba = new Uint8Array(OUT_W * OUT_H * 4).fill(234);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  for (const { tx, ty, data } of tiles) {
    if (!data) continue;
    const ox = Math.round(tx * TILE - left);
    const oy = Math.round(ty * TILE - top);
    for (let row = 0; row < TILE; row++) {
      const y = oy + row;
      if (y < 0 || y >= OUT_H) continue;
      for (let col = 0; col < TILE; col++) {
        const x = ox + col;
        if (x < 0 || x >= OUT_W) continue;
        const s = (row * TILE + col) * 4;
        const d = (y * OUT_W + x) * 4;
        rgba[d] = data[s];
        rgba[d + 1] = data[s + 1];
        rgba[d + 2] = data[s + 2];
      }
    }
  }
  drawPin(rgba, OUT_W / 2, OUT_H / 2);
  return encode({ width: OUT_W, height: OUT_H, data: rgba, channels: 4, depth: 8 });
}

export async function buildAlertMapAttachment(
  latitude?: number,
  longitude?: number
): Promise<AlertMapAttachment | null> {
  try {
    const png = await renderAlertMapPng(latitude, longitude);
    if (!png) return null;
    return {
      filename: "location-map.png",
      content: toBase64(png),
      content_id: ALERT_MAP_CID,
      content_type: "image/png"
    };
  } catch {
    return null;
  }
}
