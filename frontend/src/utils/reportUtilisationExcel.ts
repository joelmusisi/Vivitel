import type ExcelJS from "exceljs";

export type UtilisationBand = "zero" | "amber" | "yellow" | "green";

/** Fill colours taken from Daily Utilisation Report sample workbook */
export const UTILISATION_DISTANCE_FILLS: Record<UtilisationBand, string> = {
  zero: "FFF08080",
  amber: "FFFFA500",
  yellow: "FFFFFF73",
  green: "FF90EE90"
};

export const UTILISATION_DONUT_COLORS: Record<UtilisationBand, string> = {
  zero: "#F08080",
  amber: "#FFA500",
  yellow: "#FFFF73",
  green: "#90EE90"
};

const UTILISATION_TRACK_COLOR = "#EEEEEE";

/** Distance (km) thresholds aligned to sample cell colouring */
export const classifyDistanceBand = (distanceKm: number): UtilisationBand => {
  if (!Number.isFinite(distanceKm) || distanceKm < 0.15) return "zero";
  if (distanceKm < 10) return "amber";
  if (distanceKm < 113) return "yellow";
  return "green";
};

/** Overall utilisation % (days with trips / days in range) */
export const classifyUtilisationPercent = (percent: number): UtilisationBand => {
  if (!Number.isFinite(percent) || percent <= 0) return "zero";
  if (percent < 45) return "amber";
  if (percent < 75) return "yellow";
  return "green";
};

export const applyExcelCellFill = (cell: ExcelJS.Cell, argb: string) => {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb }
  };
};

export const applyDistanceCellStyle = (cell: ExcelJS.Cell, distanceKm: number) => {
  const band = classifyDistanceBand(distanceKm);
  applyExcelCellFill(cell, UTILISATION_DISTANCE_FILLS[band]);
  cell.alignment = { vertical: "middle", horizontal: "right" };
  cell.font = { name: "Arial", size: 10 };
};

export const applyUtilisationColumnStyle = (cell: ExcelJS.Cell, dataRowIndex: number) => {
  const stripe = dataRowIndex % 2 === 0 ? "FFEEEEEE" : "FFFFFFFF";
  applyExcelCellFill(cell, stripe);
  cell.alignment = { vertical: "middle", horizontal: "center" };
};

export const createUtilisationDonutBase64 = (percent: number, band: UtilisationBand, size = 56) => {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 2;
  const inner = outer * 0.58;
  const clamped = Math.max(0, Math.min(100, percent));
  const fillColor = UTILISATION_DONUT_COLORS[band];

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner, Math.PI * 2, 0, true);
  ctx.closePath();
  ctx.fillStyle = UTILISATION_TRACK_COLOR;
  ctx.fill();

  if (clamped > 0) {
    const start = -Math.PI / 2;
    const end = start + (Math.PI * 2 * clamped) / 100;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, start, end);
    ctx.arc(cx, cy, inner, end, start, true);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, Math.PI * 2, 0, true);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, inner - 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  return base64 || null;
};
