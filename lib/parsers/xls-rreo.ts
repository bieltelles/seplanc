import * as XLSX from "xlsx";
import fs from "fs";
import { parseBRNumber } from "@/lib/utils/parse-number";

export interface RreoRow {
  anexo: string;
  linha: number;
  coluna: string;
  valor: string;
  valorNumerico: number | null;
}

/**
 * Faz parsing de um arquivo RREO XLS (formato SICONFI).
 * Cada aba do Excel corresponde a um anexo do RREO.
 */
export function parseRreoXls(filePath: string): RreoRow[] {
  const buffer = fs.readFileSync(filePath);
  return parseRreoXlsFromBuffer(buffer);
}

export function parseRreoXlsFromBuffer(buffer: Buffer): RreoRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows: RreoRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    }) as unknown as unknown[][];

    if (!data || data.length === 0) continue;

    // First row is headers
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

/**
 * Retorna a lista de abas/anexos disponíveis em um arquivo RREO.
 */
export function getRreoSheetNames(filePath: string): string[] {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames;
}
