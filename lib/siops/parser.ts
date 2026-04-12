/**
 * Parser para o HTML do SIOPS Anexo 12 (Demonstrativo da LRF - Saúde).
 *
 * O SIOPS retorna HTML com encoding ISO-8859-15. As tabelas de dados são
 * identificadas por conteúdo (marcadores textuais como "RECEITA DE IMPOSTOS",
 * "(XXIX)", etc.) em vez de depender de nomes de classe CSS, que podem variar
 * dependendo de como o HTML foi salvo ou obtido.
 *
 * Números em formato BR: "1.438.294.648,89" → 1438294648.89
 */

import type {
  SiopsAnexo12,
  SiopsApuracao,
  SiopsDespesasSubfuncao,
  SiopsDespesasTotais,
  SiopsReceitas,
  SiopsReceitasAdicionais,
} from "./types";

// =========================================================================
// Helpers
// =========================================================================

/** Converte "1.438.294.648,89" → 1438294648.89. Retorna 0 para "N/A", vazio, etc. */
export function parseBrNumber(raw: string): number {
  const s = raw.trim();
  if (!s || s === "N/A" || s === "-" || s === "..." || s === "0,00") return 0;
  // Remove thousand separators (dots) and replace decimal comma with dot
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Strip HTML tags and collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<sup>[^<]*<\/sup>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract all <td> contents from a <tr> string. */
function extractTds(trHtml: string): string[] {
  const tds: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trHtml)) !== null) {
    tds.push(stripHtml(m[1]));
  }
  return tds;
}

// =========================================================================
// Robust table extraction — handles nested tables and any class/quote style
// =========================================================================

/**
 * Extrai todas as tabelas do HTML usando uma abordagem baseada em contagem
 * de abertura/fechamento de tags, ignorando aninhamento.
 * Retorna o HTML completo de cada <table>...</table> de nível superior.
 */
function extractAllTables(html: string): string[] {
  const results: string[] = [];
  const lowerHtml = html.toLowerCase();
  let pos = 0;

  while (pos < html.length) {
    // Find next <table
    const startIdx = lowerHtml.indexOf("<table", pos);
    if (startIdx === -1) break;

    // Find the end of the opening tag
    const openTagEnd = html.indexOf(">", startIdx);
    if (openTagEnd === -1) { pos = startIdx + 6; continue; }

    // Walk forward counting table opens/closes to find matching </table>
    let depth = 1;
    let searchPos = openTagEnd + 1;
    let tableEnd = -1;

    while (searchPos < html.length && depth > 0) {
      const nextOpen = lowerHtml.indexOf("<table", searchPos);
      const nextClose = lowerHtml.indexOf("</table", searchPos);

      if (nextClose === -1) break; // malformed

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        searchPos = nextOpen + 6;
      } else {
        depth--;
        if (depth === 0) {
          const closeEnd = html.indexOf(">", nextClose);
          tableEnd = closeEnd !== -1 ? closeEnd + 1 : nextClose + 8;
        } else {
          searchPos = nextClose + 8;
        }
      }
    }

    if (tableEnd > startIdx) {
      results.push(html.substring(startIdx, tableEnd));
      pos = tableEnd;
    } else {
      pos = startIdx + 6;
    }
  }

  return results;
}

/**
 * Encontra tabelas de dados SIOPS.
 *
 * Estratégia:
 * 1. Tenta filtrar por classe CSS "tam2 tdExterno" (original do SIOPS)
 * 2. Se não encontrar suficientes, usa todas as tabelas que contenham dados financeiros
 */
function extractTables(html: string): string[] {
  const allTables = extractAllTables(html);

  if (allTables.length === 0) {
    throw new Error(
      `SIOPS HTML inválido: nenhuma tag <table> encontrada. ` +
      `Certifique-se de colar o código-fonte HTML da página (Ctrl+U → Ctrl+A → Ctrl+C), ` +
      `não o texto visível.`,
    );
  }

  // Strategy 1: filter by class "tam2 tdExterno" (double or single quotes, any order)
  const byClass = allTables.filter((t) => {
    const openTag = t.slice(0, Math.min(300, t.indexOf(">") + 1));
    return /class\s*=\s*["'][^"']*tam2[^"']*["']/i.test(openTag) ||
           /class\s*=\s*["'][^"']*tdExterno[^"']*["']/i.test(openTag);
  });

  if (byClass.length >= 6) return byClass;

  // Strategy 2: filter tables that contain SIOPS-specific financial content
  // (row labels like "RECEITA DE IMPOSTOS", Roman numerals in parentheses, BR numbers)
  const brNumberPattern = /\d{1,3}(?:\.\d{3})+,\d{2}/;
  const siopsPattern = /RECEITA|DESPESA|IMPOSTO|TRANSFER|ASPS|BIMESTRE|\(X[IVXLC]+\)/i;

  const byContent = allTables.filter((t) =>
    brNumberPattern.test(t) && siopsPattern.test(t) && t.length > 300
  );

  if (byContent.length >= 6) return byContent;

  // Strategy 3: return all tables with financial data and let the parser handle it
  const withData = allTables.filter((t) => brNumberPattern.test(t) && t.length > 200);
  if (withData.length >= 4) return withData;

  throw new Error(
    `SIOPS HTML inválido: ${allTables.length} tabelas encontradas, mas nenhuma contém ` +
    `dados financeiros do Anexo 12. Verifique se o HTML é da página de consulta do ` +
    `SIOPS (siops.datasus.gov.br/rel_LRF.php).`,
  );
}

/** Extract all <tr> from a table string (non-nested). */
function extractRows(tableHtml: string): string[] {
  const rows: string[] = [];
  // Only grab rows at this level (skip nested table rows)
  // We find <tr> tags and close at matching </tr>
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tableHtml)) !== null) {
    rows.push(m[0]);
  }
  return rows;
}

/** Check if a row is a header row (bgcolor or th elements). */
function isHeaderRow(trHtml: string): boolean {
  return /bgcolor\s*=\s*["']#CDCDCD["']/i.test(trHtml) ||
         /<th[\s>]/i.test(trHtml);
}

type DataRow = { label: string; values: number[] };

/** Parse a data table into label→values[] pairs, skipping headers. */
function parseDataRows(tableHtml: string): DataRow[] {
  const rows = extractRows(tableHtml);
  const result: DataRow[] = [];
  for (const tr of rows) {
    if (isHeaderRow(tr)) continue;
    const tds = extractTds(tr);
    if (tds.length < 2) continue;
    const label = tds[0];
    if (!label) continue;
    const values = tds.slice(1).map(parseBrNumber);
    result.push({ label, values });
  }
  return result;
}

/** Find a row whose label contains a needle (case-insensitive, ignores accents). */
function findRow(rows: DataRow[], needle: string): DataRow | undefined {
  const upper = needle.toUpperCase();
  // Try exact substring first
  let found = rows.find((r) => r.label.toUpperCase().includes(upper));
  if (found) return found;

  // Try ignoring accent chars (common with ISO-8859 → UTF-8 conversion issues)
  const deaccent = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const needleDeaccented = deaccent(upper);
  found = rows.find((r) => deaccent(r.label).includes(needleDeaccented));
  return found;
}

/** Safely get value at index. */
function val(row: DataRow | undefined, idx: number): number {
  return row?.values[idx] ?? 0;
}

// =========================================================================
// Metadata extraction
// =========================================================================

function extractMetadata(html: string) {
  // Work with a small prefix of the HTML (header area)
  const headerHtml = html.slice(0, 8000);
  const stripped = stripHtml(headerHtml);

  // UF: look for "UF: MA" or "UF: MA" in stripped text
  const ufMatch = stripped.match(/\bUF\s*:\s*([A-Z]{2})\b/i);
  const uf = ufMatch ? ufMatch[1].trim().toUpperCase() : "";

  // Município: look for "MUNICIPIO: SAO LUIS" in stripped text
  const munMatch = stripped.match(/MUN[IÍ]C[IÍ]PIO\s*:\s*([A-Z][A-Z\s]+?)(?=\s{2,}|\s*UF\s*:|\s*ANO|\s*BIMESTRE|$)/i);
  const municipio = munMatch ? munMatch[1].replace(/\s+/g, " ").trim() : "";

  // Bimestre and ano — handles "6º Bimestre de 2025", "6&#186; Bimestre de 2025"
  // Search in raw HTML (to handle entities) and in stripped text
  const bimRawMatch =
    html.match(/(\d)\s*(?:&#186;|&#186|&#176;|&#176|[º°o])\s*Bimestre\s+de\s+(\d{4})/i) ||
    html.match(/(\d)\s*Bimestre\s+de\s+(\d{4})/i) ||
    stripped.match(/(\d)\s*[º°o]?\s*BIMESTRE\s+DE\s+(\d{4})/i);
  const bimestre = bimRawMatch ? parseInt(bimRawMatch[1], 10) : 0;
  const ano = bimRawMatch ? parseInt(bimRawMatch[2], 10) : 0;

  // Data de homologação — "Dados Homologados em 20/01/2026"
  const homMatch =
    html.match(/Dados\s+Homologados\s+em\s+(\d{2}\/\d{2}\/\d{4})/i) ||
    html.match(/Homologados?\s+em\s+(\d{2}\/\d{2}\/\d{4})/i) ||
    stripped.match(/Homologados?\s+em\s+(\d{2}\/\d{2}\/\d{4})/i);
  const dataHomologacao = homMatch ? homMatch[1].trim() : "";

  return { uf, municipio, bimestre, ano, dataHomologacao };
}

// =========================================================================
// Table-specific parsers
// =========================================================================

/** Table 1: Receitas de impostos e transferências */
function parseReceitas(tableHtml: string): SiopsReceitas {
  const rows = parseDataRows(tableHtml);
  // Col layout: [previsãoInicial, previsãoAtualizada, atéBimestre, %]
  // We want "até o bimestre" → index 2
  const COL = 2;
  return {
    impostos: val(findRow(rows, "RECEITA DE IMPOSTOS"), COL),
    iptu: val(findRow(rows, "Imposto Predial"), COL),
    itbi: val(findRow(rows, "Transmiss"), COL),
    iss: val(findRow(rows, "Servi"), COL),
    irrf: val(findRow(rows, "Renda e Proventos"), COL),
    transferencias: val(findRow(rows, "RECEITA DE TRANSFER"), COL),
    fpm: val(findRow(rows, "Cota-Parte FPM"), COL),
    itr: val(findRow(rows, "Cota-Parte ITR"), COL),
    ipva: val(findRow(rows, "Cota-Parte do IPVA"), COL),
    icms: val(findRow(rows, "Cota-Parte do ICMS"), COL),
    ipiExportacao: val(findRow(rows, "IPI"), COL),
    compensacoes: val(findRow(rows, "Compensa"), COL),
    total: val(findRow(rows, "TOTAL DAS RECEITAS"), COL),
  };
}

/** Parse despesas por subfunção */
function parseDespesasSubfuncao(
  tableHtml: string,
  colEmpenhada: number,
  colLiquidada: number,
): { empenhada: SiopsDespesasSubfuncao; liquidada: SiopsDespesasSubfuncao } {
  const rows = parseDataRows(tableHtml);

  const parse = (col: number): SiopsDespesasSubfuncao => ({
    atencaoBasica: val(findRow(rows, "ATEN"), col),
    assistenciaHospitalar: val(findRow(rows, "ASSIST"), col),
    suporteProfilatico: val(findRow(rows, "SUPORTE PROFIL"), col),
    vigilanciaSanitaria: val(findRow(rows, "VIGIL"), col),
    vigilanciaEpidemiologica: val(findRow(rows, "EPIDEMIOL"), col),
    alimentacaoNutricao: val(findRow(rows, "ALIMENTA"), col),
    outrasSubfuncoes: val(findRow(rows, "OUTRAS SUBFUN"), col),
    total: val(findRow(rows, "TOTAL"), col),
  });

  return {
    empenhada: parse(colEmpenhada),
    liquidada: parse(colLiquidada),
  };
}

/** Apuração do cumprimento do limite mínimo de 15% */
function parseApuracao(tableHtml: string): SiopsApuracao {
  const rows = parseDataRows(tableHtml);
  const E = 0, L = 1, P = 2;

  const triVal = (needle: string) => ({
    empenhada: val(findRow(rows, needle), E),
    liquidada: val(findRow(rows, needle), L),
    paga: val(findRow(rows, needle), P),
  });

  // Despesa mínima row may have a single colspan value
  const minRow = findRow(rows, "Despesa M") ||
                 findRow(rows, "15%") ||
                 findRow(rows, "XVII");
  const despesaMinima = minRow ? (minRow.values[0] || 0) : 0;

  return {
    totalDespesasAsps: triVal("Total das Despesas com ASPS"),
    rpInscritosIndevidamente: triVal("Restos a Pagar Inscritos Indevidamente"),
    despesasRecursosVinculados: triVal("Recursos Vinculados"),
    despesasCaixaRpCancelados: triVal("Disponibilidade de Caixa"),
    valorAplicado: triVal("VALOR APLICADO EM ASPS"),
    despesaMinima,
    diferenca: triVal("Diferen"),
    percentualAplicado: triVal("PERCENTUAL"),
  };
}

/** Receitas adicionais */
function parseReceitasAdicionais(tableHtml: string): SiopsReceitasAdicionais {
  const rows = parseDataRows(tableHtml);
  const COL = 2;
  return {
    transferencias: val(findRow(rows, "TRANSFER") || findRow(rows, "XXIX"), COL),
    provenientesUniao: val(findRow(rows, "Provenientes da Uni"), COL),
    provenientesEstados: val(findRow(rows, "Provenientes dos Estados"), COL),
    provenientesOutrosMunicipios: val(findRow(rows, "Outros Munic"), COL),
    operacoesCredito: val(findRow(rows, "OPERA"), COL),
    outras: val(findRow(rows, "OUTRAS RECEITAS"), COL),
    total: val(findRow(rows, "TOTAL RECEITAS ADICIONAIS") || findRow(rows, "TOTAL"), COL),
  };
}

/** Despesas totais com saúde */
function parseDespesasTotais(tableHtml: string): SiopsDespesasTotais {
  const rows = parseDataRows(tableHtml);
  // Cols: [dotIni, dotAtual, empenhAtéBim, %empenh, liquidAtéBim, %liquid, pagaAtéBim, %paga, rpNP]
  const CE = 2, CL = 4, CP = 6;

  const rowTotal = findRow(rows, "TOTAL DAS DESPESAS COM SA") || findRow(rows, "XLVIII");
  const rowProprios = findRow(rows, "RECURSOS PR") || findRow(rows, "XLIX");

  return {
    totalSaude: {
      empenhada: val(rowTotal, CE),
      liquidada: val(rowTotal, CL),
      paga: val(rowTotal, CP),
    },
    totalProprios: {
      empenhada: val(rowProprios, CE),
      liquidada: val(rowProprios, CL),
      paga: val(rowProprios, CP),
    },
  };
}

// =========================================================================
// Main parser
// =========================================================================

/**
 * Parse the full SIOPS Anexo 12 HTML into a structured object.
 *
 * @param html - Full HTML string from SIOPS (ISO-8859-15 or UTF-8 decoded).
 * @param codIbge - IBGE municipality code (e.g., "211130").
 * @param ufSigla - UF abbreviation (e.g., "MA").
 */
export function parseSiopsAnexo12(
  html: string,
  codIbge: string,
  ufSigla: string,
): SiopsAnexo12 {
  const meta = extractMetadata(html);
  const tables = extractTables(html);

  // Identify key tables by content markers (robust, order-independent)
  const findTable = (markers: string[]): string | undefined =>
    tables.find((t) => markers.some((m) => t.toUpperCase().includes(m.toUpperCase())));

  const receitasTable = findTable(["RECEITA DE IMPOSTOS", "TOTAL DAS RECEITAS"]);
  const despPropriasTable = findTable(["(IV)", "(V)", "(VI)"]) ||
                            (tables.length > 1 ? tables[1] : undefined);
  const apuracaoTable = findTable(["VALOR APLICADO EM ASPS", "(XVI)"]);
  const recAdicionaisTable = findTable(["(XXIX)", "RECEITAS ADICIONAIS"]);
  const despNaoCompTable = findTable(["(XXXIII)", "NAO COMPUTADAS", "NÃO COMPUTADAS"]);
  const despTotaisTable = findTable(["(XLVIII)", "TOTAL DAS DESPESAS COM SA"]);

  const receitas = receitasTable
    ? parseReceitas(receitasTable)
    : parseReceitas(tables[0]);

  const despProprias = despPropriasTable
    ? parseDespesasSubfuncao(despPropriasTable, 2, 4)
    : { empenhada: emptySubfuncao(), liquidada: emptySubfuncao() };

  const apuracao = apuracaoTable
    ? parseApuracao(apuracaoTable)
    : parseApuracao(tables[Math.min(2, tables.length - 1)]);

  const receitasAdicionais = recAdicionaisTable
    ? parseReceitasAdicionais(recAdicionaisTable)
    : { transferencias: 0, provenientesUniao: 0, provenientesEstados: 0, provenientesOutrosMunicipios: 0, operacoesCredito: 0, outras: 0, total: 0 };

  const despesasNaoComputadas = despNaoCompTable
    ? parseDespesasSubfuncao(despNaoCompTable, 2, 4)
    : { empenhada: emptySubfuncao(), liquidada: emptySubfuncao() };

  const despesasTotais = despTotaisTable
    ? parseDespesasTotais(despTotaisTable)
    : { totalSaude: { empenhada: 0, liquidada: 0, paga: 0 }, totalProprios: { empenhada: 0, liquidada: 0, paga: 0 } };

  // If metadata extraction failed, try to infer from the HTML content
  const exercicioAno = meta.ano || new Date().getFullYear();
  const bimestre = meta.bimestre || 1;

  return {
    uf: meta.uf || ufSigla,
    ufSigla,
    municipio: meta.municipio || "SAO LUIS",
    codIbge,
    exercicioAno,
    bimestre,
    dataHomologacao: meta.dataHomologacao,
    receitas,
    despesasProprias: despProprias,
    apuracao,
    receitasAdicionais,
    despesasNaoComputadas,
    despesasTotais,
  };
}

function emptySubfuncao(): SiopsDespesasSubfuncao {
  return {
    atencaoBasica: 0,
    assistenciaHospitalar: 0,
    suporteProfilatico: 0,
    vigilanciaSanitaria: 0,
    vigilanciaEpidemiologica: 0,
    alimentacaoNutricao: 0,
    outrasSubfuncoes: 0,
    total: 0,
  };
}
