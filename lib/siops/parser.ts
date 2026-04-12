/**
 * Parser para o HTML do SIOPS Anexo 12 (Demonstrativo da LRF - Saúde).
 *
 * O SIOPS retorna HTML com encoding ISO-8859-15 e tabelas com classe
 * "tam2 tdExterno". Cada tabela tem cabeçalho bgcolor="#CDCDCD" e
 * dados em <td class="td2 caixa"> (label) e <td class="tdr caixa"> (valor).
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
  if (!s || s === "N/A" || s === "-" || s === "...") return 0;
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

/** Check how many columns a <td> spans via colspan="N". */
function getColspan(tdHtml: string): number {
  const m = tdHtml.match(/colspan="(\d+)"/i);
  return m ? parseInt(m[1], 10) : 1;
}

/** Extract tables by splitting on <table and </table>. */
function extractTables(html: string): string[] {
  const tables: string[] = [];
  const re = /<table[^>]*class="[^"]*tam2 tdExterno[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    tables.push(m[0]);
  }
  return tables;
}

/** Extract all <tr> from a table. */
function extractRows(tableHtml: string): string[] {
  const rows: string[] = [];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tableHtml)) !== null) {
    rows.push(m[0]);
  }
  return rows;
}

/** Check if a row is a header row (bgcolor="#CDCDCD"). */
function isHeaderRow(trHtml: string): boolean {
  return /bgcolor="#CDCDCD"/i.test(trHtml);
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
    // First td (possibly colspan=2) is the label
    const label = tds[0];
    const values = tds.slice(1).map(parseBrNumber);
    result.push({ label, values });
  }
  return result;
}

/** Find a row whose label starts with (or contains) a needle. */
function findRow(rows: DataRow[], needle: string): DataRow | undefined {
  const upper = needle.toUpperCase();
  return rows.find((r) => r.label.toUpperCase().includes(upper));
}

/** Safely get value at index. */
function val(row: DataRow | undefined, idx: number): number {
  return row?.values[idx] ?? 0;
}

// =========================================================================
// Metadata extraction
// =========================================================================

function extractMetadata(html: string) {
  // UF and Município from header table
  const ufMatch = html.match(/UF:<\/span>\s*&nbsp;([^<]+)/i)
    || html.match(/UF:<\/span>[^<]*<\/td>/i);
  let uf = "";
  if (ufMatch) {
    uf = stripHtml(ufMatch[0]).replace(/.*UF:\s*/, "").trim();
  }

  const munMatch = html.match(/MUNIC\s*(?:Í|I)PIO:<\/span>\s*&nbsp;([^<&]+)/i)
    || html.match(/MUNIC.*?PIO:<\/span>[^<]*<\/td>/i);
  let municipio = "";
  if (munMatch) {
    municipio = stripHtml(munMatch[0]).replace(/.*PIO:\s*/, "").trim();
  }

  // Bimestre from "1º Bimestre de 2025" or "1  Bimestre de 2025"
  const bimMatch = html.match(/(\d)\s*.?\s*Bimestre\s+de\s+(\d{4})/i);
  const bimestre = bimMatch ? parseInt(bimMatch[1], 10) : 0;
  const ano = bimMatch ? parseInt(bimMatch[2], 10) : 0;

  // Data de homologação
  const homMatch = html.match(/Dados\s+Homologados\s+em\s+([^<]+)/i);
  const dataHomologacao = homMatch ? homMatch[1].trim() : "";

  return { uf, municipio, bimestre, ano, dataHomologacao };
}

// =========================================================================
// Table-specific parsers
// =========================================================================

/** Table 1: Receitas de impostos e transferências (6 colunas: label, previsãoIni, previsãoAtual, realizada, %). */
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

/** Parse despesas por subfunção (tables 2 and 10). */
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
    vigilanciaSanitaria: val(findRow(rows, "VIGIL NCIA SANIT"), col),
    vigilanciaEpidemiologica: val(findRow(rows, "VIGIL NCIA EPIDEMIOL"), col),
    alimentacaoNutricao: val(findRow(rows, "ALIMENTA"), col),
    outrasSubfuncoes: val(findRow(rows, "OUTRAS SUBFUN"), col),
    total: val(findRow(rows, "TOTAL"), col),
  });

  return {
    empenhada: parse(colEmpenhada),
    liquidada: parse(colLiquidada),
  };
}

/** Table 3: Apuração do cumprimento do limite. 3 value columns: empenhada, liquidada, paga. */
function parseApuracao(tableHtml: string): SiopsApuracao {
  const rows = parseDataRows(tableHtml);
  // Cols: [empenhada(d), liquidada(e), paga(f)]
  const E = 0, L = 1, P = 2;

  const triVal = (needle: string) => ({
    empenhada: val(findRow(rows, needle), E),
    liquidada: val(findRow(rows, needle), L),
    paga: val(findRow(rows, needle), P),
  });

  // Despesa mínima row has a single colspan=3 value
  const minRow = findRow(rows, "Despesa M nima a ser Aplicada em ASPS (XVII) = (III) x 15%");
  const despesaMinima = minRow ? (minRow.values[0] || 0) : 0;

  return {
    totalDespesasAsps: triVal("Total das Despesas com ASPS (XII)"),
    rpInscritosIndevidamente: triVal("Restos a Pagar Inscritos Indevidamente"),
    despesasRecursosVinculados: triVal("Recursos Vinculados"),
    despesasCaixaRpCancelados: triVal("Disponibilidade de Caixa"),
    valorAplicado: triVal("VALOR APLICADO EM ASPS (XVI)"),
    despesaMinima,
    diferenca: triVal("Diferen a entre o Valor Aplicado"),
    percentualAplicado: triVal("PERCENTUAL DA RECEITA"),
  };
}

/** Table 9: Receitas adicionais. */
function parseReceitasAdicionais(tableHtml: string): SiopsReceitasAdicionais {
  const rows = parseDataRows(tableHtml);
  const COL = 2; // até o bimestre
  return {
    transferencias: val(findRow(rows, "RECEITAS DE TRANSFER NCIAS PARA A SA DE"), COL),
    provenientesUniao: val(findRow(rows, "Provenientes da Uni"), COL),
    provenientesEstados: val(findRow(rows, "Provenientes dos Estados"), COL),
    provenientesOutrosMunicipios: val(findRow(rows, "Provenientes de Outros Munic"), COL),
    operacoesCredito: val(findRow(rows, "OPERA"), COL),
    outras: val(findRow(rows, "OUTRAS RECEITAS (XXXI)"), COL),
    total: val(findRow(rows, "TOTAL RECEITAS ADICIONAIS"), COL),
  };
}

/** Last table: Despesas totais com saúde. */
function parseDespesasTotais(tableHtml: string): SiopsDespesasTotais {
  const rows = parseDataRows(tableHtml);
  // Cols: [dotIni, dotAtual, empenhAtéBim, %empenh, liquidAtéBim, %liquid, pagaAtéBim, %paga, rpNP]
  const CE = 2, CL = 4, CP = 6;

  const rowTotal = findRow(rows, "TOTAL DAS DESPESAS COM SA DE (XLVIII)");
  const rowProprios = findRow(rows, "TOTAL DAS DESPESAS EXECUTADAS COM RECURSOS PR PRIOS");

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
 * @param html - Full HTML string from rel_LRF.php (ISO-8859-15 already decoded).
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

  if (tables.length < 8) {
    throw new Error(
      `SIOPS HTML inválido: esperadas >= 8 tabelas "tam2 tdExterno", encontradas ${tables.length}`,
    );
  }

  // Table mapping by order:
  // [0] Receitas de impostos e transferências
  // [1] Despesas ASPS por subfunção (recursos próprios)
  // [2] Apuração do cumprimento do limite mínimo
  // [3] Controle do percentual mínimo não cumprido em exercícios anteriores
  // [4] Exercício do empenho (histórico RP)
  // [5,6,7] Tables with single-row totals (RP cancelados XXI, XXII, XXIII)
  // [8] Controle de RP cancelados (XXIV-XXVIII)
  // [9] Receitas adicionais para financiamento da saúde
  // [10] Despesas não computadas no mínimo
  // [11] Despesas totais com saúde

  // The exact table count varies. Identify key tables by content:
  const receitas = parseReceitas(tables[0]);

  // Table 1 (despesas ASPS com recursos próprios): has "(IV)" for atenção básica
  // Cols: [dotIni, dotAtual, empenhAtéBim, %emp, liquidAtéBim, %liq, pagaAtéBim, %paga, rpNP]
  const despProprias = parseDespesasSubfuncao(tables[1], 2, 4);

  // Find table with "VALOR APLICADO EM ASPS" for apuração
  const apuracaoIdx = tables.findIndex((t) => t.includes("VALOR APLICADO EM ASPS"));
  const apuracao = apuracaoIdx >= 0 ? parseApuracao(tables[apuracaoIdx]) : parseApuracao(tables[2]);

  // Find receitas adicionais table (contains "TRANSFER NCIAS PARA A SA DE  (XXIX)")
  const recAdIdx = tables.findIndex((t) => t.includes("(XXIX)"));
  const receitasAdicionais = recAdIdx >= 0
    ? parseReceitasAdicionais(tables[recAdIdx])
    : { transferencias: 0, provenientesUniao: 0, provenientesEstados: 0, provenientesOutrosMunicipios: 0, operacoesCredito: 0, outras: 0, total: 0 };

  // Find despesas não computadas (contains "(XXXIII)" for atenção básica)
  const despNaoIdx = tables.findIndex((t) => t.includes("(XXXIII)"));
  const despesasNaoComputadas = despNaoIdx >= 0
    ? parseDespesasSubfuncao(tables[despNaoIdx], 2, 4)
    : { empenhada: emptySubfuncao(), liquidada: emptySubfuncao() };

  // Last table: despesas totais (contains "(XLVIII)")
  const despTotIdx = tables.findIndex((t) => t.includes("(XLVIII)"));
  const despesasTotais = despTotIdx >= 0
    ? parseDespesasTotais(tables[despTotIdx])
    : { totalSaude: { empenhada: 0, liquidada: 0, paga: 0 }, totalProprios: { empenhada: 0, liquidada: 0, paga: 0 } };

  return {
    uf: meta.uf,
    ufSigla,
    municipio: meta.municipio,
    codIbge,
    exercicioAno: meta.ano,
    bimestre: meta.bimestre,
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
