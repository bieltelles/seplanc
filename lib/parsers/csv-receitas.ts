import fs from "fs";
import Papa from "papaparse";
import { parseBRNumber } from "@/lib/utils/parse-number";
import { classifyRevenue, getClassificationLevel } from "@/lib/constants/tax-categories";

export interface ReceitaRow {
  rubrica: string;
  fonte: string;
  classificacao: string;
  descricao: string;
  isHeader: boolean;
  isDeducao: boolean;
  nivel: number;
  orcado: number;
  janeiro: number;
  fevereiro: number;
  marco: number;
  abril: number;
  maio: number;
  junho: number;
  julho: number;
  agosto: number;
  setembro: number;
  outubro: number;
  novembro: number;
  dezembro: number;
  acumulado: number;
  categoriaTributaria: string;
}

/**
 * Faz parsing de um arquivo CSV de Balancete de Receita Anual.
 * Suporta encoding ISO-8859-1 (Latin-1) e delimitador ponto-e-vírgula.
 */
export function parseReceitaCsv(filePath: string): ReceitaRow[] {
  const buffer = fs.readFileSync(filePath);
  // Try latin1 first, fall back to utf-8
  let content = buffer.toString("latin1");
  // If the header looks correct with latin1, use it; otherwise try utf8
  if (!content.includes("Rubrica") && !content.includes("rubrica")) {
    content = buffer.toString("utf-8");
  }

  const result = Papa.parse(content, {
    delimiter: ";",
    header: false,
    skipEmptyLines: true,
  });

  const rows: ReceitaRow[] = [];
  const data = result.data as string[][];

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 5) continue;

    const classificacao = (row[2] || "").trim();
    if (!classificacao) continue;

    const rubrica = (row[0] || "").trim();
    const fonte = (row[1] || "").trim();
    const descricao = (row[3] || "").trim();
    const isHeader = !rubrica && !fonte;
    const isDeducao = classificacao.startsWith("9");

    rows.push({
      rubrica,
      fonte,
      classificacao,
      descricao,
      isHeader,
      isDeducao,
      nivel: getClassificationLevel(classificacao),
      orcado: parseBRNumber(row[4]),
      janeiro: parseBRNumber(row[5]),
      fevereiro: parseBRNumber(row[6]),
      marco: parseBRNumber(row[7]),
      abril: parseBRNumber(row[8]),
      maio: parseBRNumber(row[9]),
      junho: parseBRNumber(row[10]),
      julho: parseBRNumber(row[11]),
      agosto: parseBRNumber(row[12]),
      setembro: parseBRNumber(row[13]),
      outubro: parseBRNumber(row[14]),
      novembro: parseBRNumber(row[15]),
      dezembro: parseBRNumber(row[16]),
      acumulado: parseBRNumber(row[17]),
      categoriaTributaria: classifyRevenue(classificacao),
    });
  }

  return rows;
}

/**
 * Extrai o ano do nome do arquivo.
 * Ex: "2024_BALANCETE_RECEITA_ANUAL.csv" → 2024
 */
export function extractYearFromFilename(filename: string): number | null {
  const match = filename.match(/^(\d{4})_/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Faz parsing de um CSV a partir de um Buffer (para upload).
 */
export function parseReceitaCsvFromBuffer(buffer: Buffer): ReceitaRow[] {
  let content = buffer.toString("latin1");
  if (!content.includes("Rubrica") && !content.includes("rubrica")) {
    content = buffer.toString("utf-8");
  }

  const result = Papa.parse(content, {
    delimiter: ";",
    header: false,
    skipEmptyLines: true,
  });

  const rows: ReceitaRow[] = [];
  const data = result.data as string[][];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 5) continue;

    const classificacao = (row[2] || "").trim();
    if (!classificacao) continue;

    const rubrica = (row[0] || "").trim();
    const fonte = (row[1] || "").trim();
    const descricao = (row[3] || "").trim();
    const isHeader = !rubrica && !fonte;
    const isDeducao = classificacao.startsWith("9");

    rows.push({
      rubrica,
      fonte,
      classificacao,
      descricao,
      isHeader,
      isDeducao,
      nivel: getClassificationLevel(classificacao),
      orcado: parseBRNumber(row[4]),
      janeiro: parseBRNumber(row[5]),
      fevereiro: parseBRNumber(row[6]),
      marco: parseBRNumber(row[7]),
      abril: parseBRNumber(row[8]),
      maio: parseBRNumber(row[9]),
      junho: parseBRNumber(row[10]),
      julho: parseBRNumber(row[11]),
      agosto: parseBRNumber(row[12]),
      setembro: parseBRNumber(row[13]),
      outubro: parseBRNumber(row[14]),
      novembro: parseBRNumber(row[15]),
      dezembro: parseBRNumber(row[16]),
      acumulado: parseBRNumber(row[17]),
      categoriaTributaria: classifyRevenue(classificacao),
    });
  }

  return rows;
}
