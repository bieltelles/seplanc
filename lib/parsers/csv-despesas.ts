import fs from "fs";
import Papa from "papaparse";
import { parseBRNumber } from "@/lib/utils/parse-number";

/**
 * Linha analítica do Balancete de Despesa Geral.
 *
 * A `Dotacao` do sistema da prefeitura codifica a estrutura contábil completa
 * no formato `UO.FFSSSPPPP.ACAO.C.G.MOD.ELEM.FONTE`, onde:
 *
 * - `UO`    → Unidade Orçamentária (5 dígitos)
 * - `FFSSSPPPPT` → bloco de 10 dígitos com Função (2) + Subfunção (3) +
 *                  Programa (4) + tipo de ação (1)
 * - `ACAO`  → Código da ação (3 dígitos)
 * - `C.G.MOD.ELEM` → Natureza da despesa (Categoria/Grupo/Modalidade/Elemento)
 * - `FONTE` → Detalhamento de fonte de recurso (10 dígitos)
 *
 * Para o cálculo do Anexo 12 (Saúde, LC 141/2012), interessa:
 * - `funcao == "10"` → despesas de Saúde
 * - `subfuncao` → categoriza IV (301), V (302), VI (303), VII (304),
 *                 VIII (305), IX (306) e X (outras)
 * - `fonte == "1500001002"` → identifica XI (ASPS computadas no mínimo)
 */
export interface DespesaRow {
  ficha: number | null;
  dotacao: string;
  uo: string;
  funcao: string;
  subfuncao: string;
  programa: string;
  acao: string;
  naturezaDespesa: string;
  fonte: string;
  especificacao: string;
  orcado: number;
  suplementado: number;
  anulado: number;
  contingenciado: number;
  empenhadoPeriodo: number;
  empenhadoAcumulado: number;
  liquidadoPeriodo: number;
  liquidadoAcumulado: number;
  pagoPeriodo: number;
  pagoAcumulado: number;
  saldoAEmpenhar: number;
  saldoAPagar: number;
}

function splitDotacao(dotacao: string): {
  uo: string;
  funcao: string;
  subfuncao: string;
  programa: string;
  acao: string;
  naturezaDespesa: string;
  fonte: string;
} {
  const parts = dotacao.split(".");
  // Estrutura esperada: UO . FFSSSPPPPT . ACAO . C . G . MOD . ELEM . FONTE
  const uo = parts[0] ?? "";
  const block = parts[1] ?? "";
  const funcao = block.slice(0, 2);
  const subfuncao = block.slice(2, 5);
  const programa = block.slice(5, 9);
  const acao = parts[2] ?? "";
  const natureza =
    parts.length >= 8
      ? [parts[3], parts[4], parts[5], parts[6]].filter(Boolean).join(".")
      : "";
  const fonte = parts[parts.length - 1] ?? "";
  return {
    uo,
    funcao,
    subfuncao,
    programa,
    acao,
    naturezaDespesa: natureza,
    fonte,
  };
}

function parseRows(content: string): DespesaRow[] {
  const result = Papa.parse(content, {
    delimiter: ";",
    header: false,
    skipEmptyLines: true,
  });

  const rows: DespesaRow[] = [];
  const data = result.data as string[][];
  if (data.length < 2) return rows;

  // Header — localiza índices para tolerar pequenas variações
  const header = data[0].map((c) => (c || "").trim());
  const idx = (name: string) => {
    const i = header.findIndex(
      (h) => h.toLowerCase() === name.toLowerCase(),
    );
    return i >= 0 ? i : -1;
  };

  const iFicha = idx("Ficha");
  const iDot = idx("Dotacao") >= 0 ? idx("Dotacao") : idx("Dotação");
  const iEsp = idx("Especificação");
  const iOrc = idx("Orçado");
  const iSup = idx("Suplementado");
  const iAnu = idx("Anulado");
  const iCon =
    idx("Contigenciado") >= 0 ? idx("Contigenciado") : idx("Contingenciado");
  const iEmpP = idx("Empenhado Período");
  const iEmpA = idx("Empenhado Acumulado");
  const iLiqP = idx("Liquidado Período");
  const iLiqA = idx("Liquidado Acumulado");
  const iPagP = idx("Pago Período");
  const iPagA = idx("Pago Acumulado");
  const iSldE = idx("Saldo a Empenhar");
  const iSldP = idx("Saldo Pagar");

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const dotacao = (row[iDot] || "").trim();
    if (!dotacao) continue;

    const split = splitDotacao(dotacao);
    const fichaRaw = (row[iFicha] || "").trim();

    rows.push({
      ficha: fichaRaw ? parseInt(fichaRaw, 10) || null : null,
      dotacao,
      ...split,
      especificacao: (row[iEsp] || "").trim(),
      orcado: parseBRNumber(row[iOrc]),
      suplementado: parseBRNumber(row[iSup]),
      anulado: parseBRNumber(row[iAnu]),
      contingenciado: parseBRNumber(row[iCon]),
      empenhadoPeriodo: parseBRNumber(row[iEmpP]),
      empenhadoAcumulado: parseBRNumber(row[iEmpA]),
      liquidadoPeriodo: parseBRNumber(row[iLiqP]),
      liquidadoAcumulado: parseBRNumber(row[iLiqA]),
      pagoPeriodo: parseBRNumber(row[iPagP]),
      pagoAcumulado: parseBRNumber(row[iPagA]),
      saldoAEmpenhar: parseBRNumber(row[iSldE]),
      saldoAPagar: parseBRNumber(row[iSldP]),
    });
  }

  return rows;
}

function bufferToContent(buffer: Buffer): string {
  // O CSV vem em ISO-8859-1 (latin-1). Se o cabeçalho não contiver
  // "Dotacao"/"Dotação", tenta UTF-8 como fallback.
  let content = buffer.toString("latin1");
  if (!content.includes("Dotacao") && !content.includes("Dotação")) {
    content = buffer.toString("utf-8");
  }
  return content;
}

/**
 * Lê e parseia o Balancete de Despesa Geral a partir de um caminho no disco.
 */
export function parseDespesaCsv(filePath: string): DespesaRow[] {
  const buffer = fs.readFileSync(filePath);
  return parseRows(bufferToContent(buffer));
}

/**
 * Lê e parseia o Balancete de Despesa Geral a partir de um `Buffer` (upload).
 */
export function parseDespesaCsvFromBuffer(buffer: Buffer): DespesaRow[] {
  return parseRows(bufferToContent(buffer));
}
