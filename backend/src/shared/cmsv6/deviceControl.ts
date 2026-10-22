// Remote device actions for CMSV6/808 devices (MR700 and similar MDVRs).
// Control codes come from the platform web API reference ("Other Vehicle Control").

export type Cmsv6ControlAction = {
  id: string;
  label: string;
  ctrlType: number;
  /** High two bytes carry a channel (or disk) number: value = (index << 16) + ctrlType. */
  indexed?: "channel" | "disk";
  /** Needs an explicit confirm flag from the caller. */
  destructive?: boolean;
};

export const CMSV6_CONTROL_ACTIONS: Cmsv6ControlAction[] = [
  { id: "oil-cut", label: "Disconnect oil", ctrlType: 1, destructive: true },
  { id: "oil-restore", label: "Restore oil", ctrlType: 2 },
  { id: "power-off", label: "Turn off power", ctrlType: 3, destructive: true },
  { id: "power-on", label: "Turn on power", ctrlType: 4 },
  { id: "restart", label: "Restart device", ctrlType: 5, destructive: true },
  { id: "factory-reset", label: "Restore factory settings", ctrlType: 6, destructive: true },
  { id: "sleep", label: "Sleep", ctrlType: 7, destructive: true },
  { id: "wake", label: "Wake", ctrlType: 8 },
  { id: "record-start", label: "Start recording", ctrlType: 9, indexed: "channel" },
  { id: "record-stop", label: "Stop recording", ctrlType: 10, indexed: "channel" },
  { id: "format-disk", label: "Format disk", ctrlType: 14, indexed: "disk", destructive: true },
  { id: "clear-mileage", label: "Clear mileage", ctrlType: 15, destructive: true },
  { id: "mirror", label: "Mirror channel", ctrlType: 16, indexed: "channel" },
  { id: "flip", label: "Flip channel", ctrlType: 17, indexed: "channel" },
  { id: "clear-alarm", label: "Clear alarm", ctrlType: 18 }
];

export function findCmsv6ControlAction(id: string) {
  const key = String(id ?? "").trim().toLowerCase();
  return CMSV6_CONTROL_ACTIONS.find((action) => action.id === key);
}

export function encodeCmsv6CtrlType(action: Cmsv6ControlAction, index: number) {
  if (!action.indexed) return action.ctrlType;
  const safeIndex = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return safeIndex * 65536 + action.ctrlType;
}

/** The 808 platform expects the login password as a lower-case MD5 hex digest. */
export function md5Hex(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  const words: number[] = [];
  for (let i = 0; i < utf8.length; i += 1) words[i >> 2] = (words[i >> 2] ?? 0) | (utf8[i] << ((i % 4) * 8));
  const bitLength = utf8.length * 8;
  words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (bitLength % 32));
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;
  for (let i = 0; i < words.length; i += 1) words[i] = words[i] ?? 0;

  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;

  for (let offset = 0; offset < words.length; offset += 16) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (a + f + K[i] + (words[offset + g] ?? 0)) | 0;
      const shift = S[(i >> 4) * 4 + (i % 4)];
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  return [a0, b0, c0, d0]
    .map((word) => Array.from({ length: 4 }, (_, i) => ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, "0")).join(""))
    .join("");
}
