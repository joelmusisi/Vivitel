import type ExcelJS from "exceljs";
import { applyWorksheetTableBorders, REPORT_HEADER_FILL, REPORT_SECTION_FILL, REPORT_SUBSECTION_FILL } from "./reportExcelStyles";

export const REPORT_NO_DATA_MESSAGE =
  "No data available for the selected scope and date range.";

export const SAMPLE_HEADER_FILL = REPORT_HEADER_FILL;
export const SAMPLE_SECTION_FILL = REPORT_SECTION_FILL;
export const SAMPLE_SUBSECTION_FILL = REPORT_SUBSECTION_FILL;

export const finishSampleTable = (
  worksheet: ExcelJS.Worksheet,
  headerRow: number,
  endRow: number,
  columnCount: number
) => {
  if (endRow < headerRow || columnCount < 1) return;
  applyWorksheetTableBorders(worksheet, headerRow, endRow, 1, columnCount);
};

export const writeSummaryTotalsRow = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  labelColumn: number,
  values: Array<{ column: number; value: string | number }>
) => {
  const row = worksheet.getRow(rowNumber);
  row.getCell(labelColumn).value = "Total";
  row.font = { name: "Arial", size: 10, bold: true };
  row.getCell(labelColumn).alignment = { vertical: "middle", horizontal: "left" };
  values.forEach(({ column, value }) => {
    const cell = row.getCell(column);
    cell.value = value;
    cell.alignment = { vertical: "middle", horizontal: "right" };
    cell.font = { name: "Arial", size: 10, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFFFF" }
    };
  });
};
