import ExcelJS from "exceljs";
import { reportLogoSize } from "./brandLogo";

const BORDER_COLOR = { argb: "FFD1D5DB" };
const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: BORDER_COLOR };

export const REPORT_BRAND_LABEL = "VIVI Telematics";
export const REPORT_HEADER_FILL = "FFD8ECE2";
export const REPORT_SECTION_FILL = "FFE6F2EB";
export const REPORT_SUBSECTION_FILL = "FFEEF7F1";
/** Every other data row, as in the MiX sample. */
export const REPORT_BAND_FILL = "FFEDEDED";

const fillRow = (row: ExcelJS.Row, columnCount: number, argb: string) => {
  for (let col = 1; col <= columnCount; col += 1) {
    row.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }
};

export const applyWorksheetTableBorders = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
) => {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.border = {
        top: THIN_BORDER,
        left: THIN_BORDER,
        bottom: THIN_BORDER,
        right: THIN_BORDER
      };
    }
  }
};

export const applyRowBoundaryBorders = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  startCol: number,
  endCol: number,
  options?: { bold?: boolean; fill?: string }
) => {
  for (let col = startCol; col <= endCol; col += 1) {
    const cell = worksheet.getCell(rowNumber, col);
    cell.border = {
      top: THIN_BORDER,
      left: THIN_BORDER,
      bottom: THIN_BORDER,
      right: THIN_BORDER
    };
    if (options?.fill) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: options.fill }
      };
    }
    if (options?.bold) {
      cell.font = { name: "Arial", size: 10, bold: true };
    }
  }
};

export const getPopulatedColumnCount = (worksheet: ExcelJS.Worksheet, rowNumber: number) => {
  const row = worksheet.getRow(rowNumber);
  let maxCol = 0;
  row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
    maxCol = Math.max(maxCol, colNumber);
  });
  return Math.max(maxCol, 1);
};

export const styleTemplateRow = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  options?: { bold?: boolean; fill?: string; size?: number; columnCount?: number }
) => {
  const colCount = options?.columnCount ?? getPopulatedColumnCount(worksheet, rowNumber);
  applyRowBoundaryBorders(worksheet, rowNumber, 1, colCount, {
    bold: options?.bold,
    fill: options?.fill
  });
  for (let col = 1; col <= colCount; col += 1) {
    const cell = worksheet.getRow(rowNumber).getCell(col);
    cell.font = {
      name: "Arial",
      size: options?.size ?? 10,
      bold: options?.bold ?? false
    };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  }
};

export const styleHeaderRowCells = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnCount: number,
  fill = REPORT_HEADER_FILL
) => {
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = worksheet.getRow(rowNumber).getCell(col);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill }
    };
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = {
      top: THIN_BORDER,
      left: THIN_BORDER,
      bottom: THIN_BORDER,
      right: THIN_BORDER
    };
  }
};

export const styleSummaryRowCells = (
  row: ExcelJS.Row,
  columnCount: number,
  fill: string
) => {
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = row.getCell(col);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill }
    };
    cell.font = { name: "Arial", size: 10, bold: true };
  }
};

type ReportBrandBlockOptions = {
  anchorCol?: number;
  labelStartCol?: number;
  labelEndCol?: number;
  labelStartRow?: number;
  labelEndRow?: number;
  logoWidth?: number;
  logoHeight?: number;
  /** Preview shows the logo image only. Sample sheets can still print the wordmark. */
  showLabel?: boolean;
};

export const addReportBrandBlock = (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  logoDataUrl: string | null,
  options: ReportBrandBlockOptions = {}
) => {
  const anchorCol = options.anchorCol ?? 6.5;
  const labelStartCol = options.labelStartCol ?? Math.floor(anchorCol) + 1;
  const labelEndCol = options.labelEndCol ?? labelStartCol + 2;
  const labelStartRow = options.labelStartRow ?? 3;
  const labelEndRow = options.labelEndRow ?? 4;
  const logoHeight = options.logoHeight ?? 64;
  const logoWidth = options.logoWidth ?? reportLogoSize(logoHeight).width;
  const showLabel = options.showLabel !== false;

  if (logoDataUrl) {
    const extension = logoDataUrl.includes("image/png") ? "png" : "jpeg";
    const imageId = workbook.addImage({ base64: logoDataUrl, extension });
    worksheet.addImage(imageId, {
      tl: { col: anchorCol, row: 0.15 },
      ext: { width: logoWidth, height: logoHeight }
    });
  }

  if (!showLabel) return;

  worksheet.mergeCells(labelStartRow, labelStartCol, labelEndRow, labelEndCol);
  const brandCell = worksheet.getCell(labelStartRow, labelStartCol);
  brandCell.value = REPORT_BRAND_LABEL;
  brandCell.font = { name: "Arial", size: 12, bold: true };
  brandCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
};

const isEmptyCellValue = (value: ExcelJS.CellValue): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
};

/** Hides gridlines on every sheet and keeps borders only on cells that hold data. */
export const stripEmptyCellBorders = (workbook: ExcelJS.Workbook) => {
  workbook.eachSheet((worksheet) => {
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (isEmptyCellValue(cell.value) && cell.border && Object.keys(cell.border).length > 0) {
          cell.border = {};
        }
      });
    });
    const views = worksheet.views?.length ? worksheet.views : [{}];
    worksheet.views = views.map((view) => ({ ...view, showGridLines: false }));
  });
};

/** Common exit point for generated workbooks. */
export const writeBrandedWorkbookBuffer = async (workbook: ExcelJS.Workbook) => {
  stripEmptyCellBorders(workbook);
  return workbook.xlsx.writeBuffer();
};

export type DetailReportExportHeader = {
  title: string;
  dateRangeLabel: string;
  statusLabel: string;
  organisation: string;
  dealer: string;
  database: string;
  site: string;
};

/** One asset block: labelled info rows (Asset Description, Registration Number, ...) above its own table. */
export type DetailReportExportSection = {
  info: Array<[string, string]>;
  rows: string[][];
};

const writeSectionedBody = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  headers: string[],
  sections: DetailReportExportSection[]
) => {
  const colCount = headers.length;
  let rowNumber = startRow;
  sections.forEach((section) => {
    section.info.forEach(([label, value]) => {
      worksheet.mergeCells(rowNumber, 1, rowNumber, Math.min(2, colCount));
      if (colCount > 3) worksheet.mergeCells(rowNumber, 3, rowNumber, colCount);
      const labelCell = worksheet.getCell(rowNumber, 1);
      labelCell.value = label;
      labelCell.font = { name: "Arial", size: 10, bold: true };
      const valueCell = worksheet.getCell(rowNumber, Math.min(3, colCount));
      valueCell.value = value || "—";
      valueCell.font = { name: "Arial", size: 10, bold: true };
      for (let col = 1; col <= colCount; col += 1) {
        worksheet.getCell(rowNumber, col).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: REPORT_SECTION_FILL }
        };
      }
      rowNumber += 1;
    });

    const headerRow = rowNumber;
    worksheet.getRow(headerRow).values = headers;
    styleHeaderRowCells(worksheet, headerRow, colCount);
    rowNumber += 1;

    section.rows.forEach((row, rowIndex) => {
      const worksheetRow = worksheet.getRow(rowNumber);
      worksheetRow.values = row;
      worksheetRow.font = { name: "Arial", size: 10 };
      worksheetRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      if (row[0] === "Totals" || row[0] === "Averages") {
        styleSummaryRowCells(worksheetRow, colCount, REPORT_SUBSECTION_FILL);
      } else if (rowIndex % 2 === 1) {
        fillRow(worksheetRow, colCount, REPORT_BAND_FILL);
      }
      rowNumber += 1;
    });
    if (section.rows.length > 0) {
      applyWorksheetTableBorders(worksheet, headerRow, rowNumber - 1, 1, colCount);
    }
    rowNumber += 1;
  });
};

export const buildDetailReportExcelWorkbook = async (params: {
  header: DetailReportExportHeader;
  headers: string[];
  body: string[][];
  /** When set, the body is written per asset (info rows + header + rows) instead of one flat table. */
  sections?: DetailReportExportSection[];
  sheetName: string;
  logoDataUrl: string | null;
}) => {
  const { header, headers, body, sections, sheetName, logoDataUrl } = params;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Report", {
    views: [{ showGridLines: false }]
  });
  const colCount = Math.max(headers.length, 4);
  worksheet.properties.defaultRowHeight = 20;
  worksheet.columns = Array.from({ length: colCount }, (_, index) => ({
    width: /location|departed from|arrived at/i.test(headers[index] ?? "")
      ? 34
      : index === 0 ? 22 : index < 4 ? 18 : 14
  }));

  const titleSpan = Math.max(1, colCount - 2);
  worksheet.mergeCells(1, 1, 1, titleSpan);
  worksheet.getCell(1, 1).value = header.title;
  worksheet.getCell(1, 1).font = { name: "Arial", size: 16, bold: true };
  worksheet.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };

  worksheet.getCell(2, 1).value = `${header.dateRangeLabel}  ·  ${header.statusLabel}`;
  worksheet.getCell(2, 1).font = { name: "Arial", size: 10, color: { argb: "FF64748B" } };
  worksheet.getCell(2, 1).alignment = { vertical: "middle", horizontal: "left" };

  const generatedAt = new Date();
  const generatedLabel = `${generatedAt.toLocaleDateString("en-GB")} ${generatedAt.toLocaleTimeString("en-GB")}`;
  const leftLines: Array<[string, string]> = [
    ["Date and time", generatedLabel],
    ["Database", header.database],
    ["Site", header.site],
    ["Account name", header.organisation]
  ];
  leftLines.forEach(([label, value], index) => {
    const rowNumber = 3 + index;
    worksheet.mergeCells(rowNumber, 1, rowNumber, titleSpan);
    const cell = worksheet.getCell(rowNumber, 1);
    cell.value = `${label}: ${value || "—"}`;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF111827" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  const brandStartCol = titleSpan + 1;
  addReportBrandBlock(workbook, worksheet, logoDataUrl, {
    anchorCol: Math.max(brandStartCol - 0.2, 0),
    labelStartCol: brandStartCol,
    labelEndCol: colCount,
    labelStartRow: 2,
    labelEndRow: 3,
    // Rows 1-6 are about 114 px tall; keep the logo inside them at its own proportions.
    logoHeight: 96,
    showLabel: false
  });
  worksheet.getRow(1).height = 24;
  for (let row = 2; row <= 6; row += 1) worksheet.getRow(row).height = 18;
  for (let row = 1; row <= 6; row += 1) {
    for (let col = 1; col <= colCount; col += 1) {
      const cell = worksheet.getCell(row, col);
      if (!cell.fill || (cell.fill as { type?: string }).type !== "pattern") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5FBF7" } };
      }
      cell.border = {};
    }
  }

  const headerRowNumber = 8;
  if (sections && sections.length > 0) {
    writeSectionedBody(worksheet, headerRowNumber, headers, sections);
    worksheet.views = [{ state: "frozen", ySplit: 7, showGridLines: false }];
    return writeBrandedWorkbookBuffer(workbook);
  }
  worksheet.getRow(headerRowNumber).values = headers;
  styleHeaderRowCells(worksheet, headerRowNumber, headers.length);

  let dataRowIndex = 0;
  body.forEach((row, index) => {
    const rowNumber = headerRowNumber + 1 + index;
    const worksheetRow = worksheet.getRow(rowNumber);
    worksheetRow.values = row;
    worksheetRow.font = { name: "Arial", size: 10 };
    worksheetRow.alignment = { vertical: "middle", horizontal: "left" };

    const isSection = row[0] && row.slice(1).every((cell) => !cell);
    const isSummary = row[0] === "Totals" || row[0] === "Averages";
    if (isSection || isSummary) {
      const color = isSection ? REPORT_SECTION_FILL : REPORT_SUBSECTION_FILL;
      styleSummaryRowCells(worksheetRow, headers.length, color);
      if (isSection) dataRowIndex = 0;
    } else {
      if (dataRowIndex % 2 === 1) fillRow(worksheetRow, headers.length, REPORT_BAND_FILL);
      dataRowIndex += 1;
    }
  });

  if (body.length > 0) {
    applyWorksheetTableBorders(
      worksheet,
      headerRowNumber,
      headerRowNumber + body.length,
      1,
      headers.length
    );
  }

  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: headers.length }
  };

  worksheet.views = [{ state: "frozen", ySplit: headerRowNumber, showGridLines: false }];
  return writeBrandedWorkbookBuffer(workbook);
};
