import * as XLSX from "xlsx";
import fs from "fs";
import { parseBRNumber } from "@/lib/utils/parse-number";

export interface RgfRow {
  anexo: string;
  linha: number;
  coluna: string;
  valor: string;
  valorNumerico: number | null;
}

/**
 * Faz parsing de um arquivo RGF XLS (formato SICONFI).
 */
export function parseRgfXls(filePath: string): RgfRow[] {
  const buffer = fs.readFileSync(filePath);
  return parseRgfXlsFromBuffer(buffer);
}

export function parseRgfXlsFromBuffer(buffer: Buffer): RgfRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows: RgfRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    }) as unknown as unknown[][];

    if (!data || data.length === 0) continue;

    const headers = (data[0] || []).map((h) => String(h || "").trim());

    for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      if (!row) continue;

      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const cellValue = row[colIdx];
        if (cellValue === undefined || cellValue === null || cellValue === "") continue;

        const strValue = String(cellValue).trim();
        if (!strValue) continue;

        const numValue = typeof cellValue === "number"
          ? cellValue
          : parseBRNumber(strValue) || null;

        rows.push({
          anexo: sheetName,
          linha: rowIdx,
          coluna: headers[colIdx] || `col_${colIdx}`,
          valor: strValue,
          valorNumerico: numValue !== 0 ? numValue : (strValue === "0" ? 0 : null),
        });
      }
    }
  }

  return rows;
}
