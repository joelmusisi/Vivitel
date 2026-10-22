import type ExcelJS from "exceljs";
import { getHierarchy } from "./api";
import { brandLogoToDataUrl } from "./brandLogo";
import { stripEmptyCellBorders } from "./reportExcelStyles";

export type ExportScope = { database: string; site: string; account: string };

/** Looks up the database and account that own the given site, using the user's hierarchy. */
export async function resolveExportScope(siteName?: string): Promise<ExportScope> {
  const site = String(siteName ?? "").trim();
  const fallback: ExportScope = { database: "—", site: site || "All Sites", account: "—" };
  try {
    const hierarchy: any = await getHierarchy();
    const dealers = Array.isArray(hierarchy?.dealers) ? hierarchy.dealers : [];
    let first: ExportScope | null = null;
    for (const dealer of dealers) {
      for (const organisation of Array.isArray(dealer?.organisations) ? dealer.organisations : []) {
        for (const database of Array.isArray(organisation?.databases) ? organisation.databases : []) {
          const scope: ExportScope = {
            database: String(database?.name ?? "").trim() || "—",
            site: site || "All Sites",
            account: String(organisation?.name ?? "").trim() || "—"
          };
          first = first ?? scope;
          const sites = Array.isArray(database?.sites) ? database.sites : [];
          if (site && sites.some((entry: any) => String(entry?.name ?? "").trim() === site)) return scope;
        }
      }
    }
    return first ?? fallback;
  } catch {
    return fallback;
  }
}

export async function loadExportLogo(): Promise<string | null> {
  try {
    return (await brandLogoToDataUrl("raster")) ?? (await brandLogoToDataUrl("light"));
  } catch {
    return null;
  }
}

/**
 * Writes the standard export header on an empty sheet: title, date and time, database,
 * site and account name on the left, VIVI Telematics logo top right. Returns the next free row.
 */
export function addBrandedSheetHeader(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  params: { title: string; scope: ExportScope; logoDataUrl: string | null; columnCount: number }
): number {
  const { title, scope, logoDataUrl } = params;
  const columnCount = Math.max(params.columnCount, 4);
  const now = new Date();
  const lines: Array<[string, boolean]> = [
    [title, true],
    [`Date and time: ${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB")}`, false],
    [`Database: ${scope.database}`, false],
    [`Site: ${scope.site}`, false],
    [`Account name: ${scope.account}`, false]
  ];
  const leftSpan = Math.max(1, columnCount - 2);
  lines.forEach(([text, isTitle], index) => {
    const rowNumber = index + 1;
    sheet.mergeCells(rowNumber, 1, rowNumber, leftSpan);
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = text;
    cell.font = { name: "Arial", size: isTitle ? 16 : 10, bold: true };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(rowNumber).height = isTitle ? 26 : 18;
  });
  if (logoDataUrl) {
    const imageId = workbook.addImage({
      base64: logoDataUrl,
      extension: logoDataUrl.includes("image/png") ? "png" : "jpeg"
    });
    sheet.addImage(imageId, { tl: { col: leftSpan + 0.1, row: 0.15 }, ext: { width: 168, height: 42 } });
  }
  return lines.length + 2;
}

export async function writeExportWorkbookBuffer(workbook: ExcelJS.Workbook) {
  stripEmptyCellBorders(workbook);
  return workbook.xlsx.writeBuffer();
}
