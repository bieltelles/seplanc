/**
 * Orquestrador de coleta de dados para a Audiência Pública LRF.
 *
 * Recebe AudienciaParams e devolve AudienciaData completo, agregando:
 * - Receitas por categoria (5 anos de histórico, corrigidos pelo IPCA)
 * - Dependência Financeira (Próprios vs Transferidos, 5 anos)
 * - Balanço Orçamentário (RREO Anexo 01) comparando ano atual vs ano anterior
 * - RCL (RREO Anexo 03)
 * - Resultado Primário/Nominal + DCL (RREO Anexo 06)
 * - Pessoal (RGF Anexo 01)
 * - Dívida Consolidada (RGF Anexo 02)
 * - Operações de Crédito (RGF Anexo 04)
 *
 * Convenções:
 * - 1Q → bimestre 2, jan-abr, despesas LIQUIDADAS (col_7 do Anexo 01)
 * - 2Q → bimestre 4, jan-ago, despesas LIQUIDADAS
 * - 3Q → bimestre 6, jan-dez, despesas EMPENHADAS (col_4)
 * - Receita realizada em Anexo 01 está sempre em col_5 (Até o Bimestre).
 */

import { getDb } from "@/lib/db/connection";
import { loadCorrectionContext, type CorrectionContext } from "@/lib/ipca/context";
import { correctMonthlyRow, shouldCorrectYear } from "@/lib/ipca/correction";
import type { TaxCategory } from "@/lib/constants/tax-categories";
import { fetchRreoRowCols } from "./rreo-lookups";
import { fetchRgfRowCols } from "./rgf-lookups";
import { getSiopsAnexo12 } from "@/lib/siops/queries";
import type {
  AudienciaData,
  AudienciaParams,
  BalancoOrcamentarioData,
  BalancoOrcamentarioLinha,
  CategoriaReceitaDetalhe,
  ComposicaoDividaLinha,
  DependenciaFinanceiraAno,
  DividaConsolidadaData,
  OperacoesCreditoData,
  PessoalData,
  Quadrimestre,
  RclData,
  ResultadosData,
} from "./types";

// ==========================================================================
// Helpers de período
// ==========================================================================

const MONTH_COLS = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

function bimestreFor(q: Quadrimestre): number {
  return q === 1 ? 2 : q === 2 ? 4 : 6;
}

function monthCutoff(q: Quadrimestre): number {
  return q === 1 ? 4 : q === 2 ? 8 : 12;
}

function periodoLabel(q: Quadrimestre, ano: number): string {
  if (q === 1) return `jan-abr/${ano}`;
  if (q === 2) return `jan-ago/${ano}`;
  return `jan-dez/${ano}`;
}

function tituloQuadrimestre(q: Quadrimestre, ano: number): string {
  return `${q}º Quadrimestre - ${ano}`;
}

// ==========================================================================
// Receitas por categoria (5 anos, com correção IPCA)
// ==========================================================================

/**
 * Para cada ano solicitado, agrega as receitas por categoria tributária
 * e soma apenas os meses até o `cutoff` (jan-abr, jan-ago ou jan-dez).
 * Exclui deduções e cabeçalhos.
 * Aplica correção IPCA nos anos anteriores ao pivô do contexto.
 */
async function loadCategoriasPorAno(
  anos: number[],
  cutoff: number,
  ctx: CorrectionContext | null,
): Promise<Map<number, Map<string, number>>> {
  const byYear = new Map<number, Map<string, number>>();
  if (anos.length === 0) return byYear;

  const db = getDb();
  const placeholders = anos.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT exercicio_ano, categoria_tributaria,
      SUM(janeiro) as janeiro, SUM(fevereiro) as fevereiro,
      SUM(marco) as marco, SUM(abril) as abril,
      SUM(maio) as maio, SUM(junho) as junho,
      SUM(julho) as julho, SUM(agosto) as agosto,
      SUM(setembro) as setembro, SUM(outubro) as outubro,
      SUM(novembro) as novembro, SUM(dezembro) as dezembro,
      SUM(orcado) as orcado
    FROM receitas
    WHERE exercicio_ano IN (${placeholders})
      AND is_header = 0
      AND is_deducao = 0
      AND categoria_tributaria IS NOT NULL
    GROUP BY exercicio_ano, categoria_tributaria`,
    args: anos,
  });

  const rows = result.rows as unknown as (Record<string, number> & {
    exercicio_ano: number;
    categoria_tributaria: string;
  })[];

  for (const r of rows) {
    let row: Record<string, number> = r as unknown as Record<string, number>;
    if (ctx && shouldCorrectYear(r.exercicio_ano, ctx.currentYear)) {
      const c = correctMonthlyRow(r, r.exercicio_ano, ctx.ipcaMap, {
        tipoJuros: ctx.tipoJuros,
        currentYear: ctx.currentYear,
      });
      row = { ...row, ...c };
    }
    let soma = 0;
    for (let i = 0; i < cutoff; i++) soma += row[MONTH_COLS[i]] || 0;

    if (!byYear.has(r.exercicio_ano)) byYear.set(r.exercicio_ano, new Map());
    byYear.get(r.exercicio_ano)!.set(r.categoria_tributaria, soma);
  }
  return byYear;
}

function sumCategorias(
  catMap: Map<string, number> | undefined,
  cats: readonly TaxCategory[],
): number {
  if (!catMap) return 0;
  let s = 0;
  for (const c of cats) s += catMap.get(c) || 0;
  return s;
}

function buildCategoriaDetalhe(
  categoriaKey: string,
  label: string,
  anos: number[],
  mapa: Map<number, Map<string, number>>,
  cats: readonly TaxCategory[],
): CategoriaReceitaDetalhe {
  const historicoAnual = anos.map((ano) => ({
    ano,
    valor: sumCategorias(mapa.get(ano), cats),
  }));
  const atual = historicoAnual[historicoAnual.length - 1]?.valor || 0;
  const inicio5a = historicoAnual[0]?.valor || 0;
  const anoAnterior = historicoAnual[historicoAnual.length - 2]?.valor || 0;
  const crescimento5a = inicio5a > 0 ? (atual - inicio5a) / inicio5a : 0;
  const crescimentoAnual = anoAnterior > 0 ? (atual - anoAnterior) / anoAnterior : 0;
  return {
    categoria: categoriaKey,
    label,
    valorArrecadado: atual,
    historicoAnual,
    crescimento5a,
    crescimentoAnual,
  };
}

// ==========================================================================
// RREO Anexo 01 — Balanço Orçamentário
// ==========================================================================

interface Anexo01Snapshot {
  // receitas — col_5 = Até o Bimestre (c)
  correntes: number;
  capital: number;
  intra: number;
  subtotalReceitas: number;
  // despesas — col_4 (empenhadas, 3Q) ou col_7 (liquidadas, 1Q/2Q)
  despCorrentes: number;
  despCapital: number;
  reservaContingencia: number;
  despIntra: number;
  subtotalDespesas: number;
  totalDespesas: number;
  superavit: number;
}

async function fetchAnexo01(
  ano: number,
  bim: number,
  despCol: number,
): Promise<Anexo01Snapshot | null> {
  const COL_REC = 5;
  const linhas = [21, 61, 83, 84, 107, 111, 115, 116, 117, 125, 126] as const;
  const fetched = await Promise.all(
    linhas.map((l) => fetchRreoRowCols(ano, bim, "RREO-Anexo 01", l)),
  );
  const [
    corrR, capR, intraR, subR,
    corrD, capD, resD, intraD, subD, totD, superD,
  ] = fetched;

  // Se nenhuma linha retornou nada, assume que não há dados para esse (ano, bim).
  const hasAny = fetched.some((r) => Object.keys(r).length > 0);
  if (!hasAny) return null;

  const get = (m: Record<number, number>, c: number) => m[c] || 0;
  return {
    correntes: get(corrR, COL_REC),
    capital: get(capR, COL_REC),
    intra: get(intraR, COL_REC),
    subtotalReceitas: get(subR, COL_REC),
    despCorrentes: get(corrD, despCol),
    despCapital: get(capD, despCol),
    reservaContingencia: get(resD, despCol),
    despIntra: get(intraD, despCol),
    subtotalDespesas: get(subD, despCol),
    totalDespesas: get(totD, despCol),
    superavit: get(superD, despCol),
  };
}

function buildBalancoOrcamentario(
  atu: Anexo01Snapshot | null,
  prev: Anexo01Snapshot | null,
): BalancoOrcamentarioData | null {
  if (!atu) return null;
  const p = prev ?? {
    correntes: 0, capital: 0, intra: 0, subtotalReceitas: 0,
    despCorrentes: 0, despCapital: 0, reservaContingencia: 0,
    despIntra: 0, subtotalDespesas: 0, totalDespesas: 0, superavit: 0,
  };

  const mkLinha = (
    rotulo: string,
    anoAnterior: number,
    anoAtual: number,
  ): BalancoOrcamentarioLinha => ({
    rotulo,
    anoAnterior,
    anoAtual,
    diferenca: anoAtual - anoAnterior,
  });

  return {
    receitas: [
      mkLinha("Receitas Correntes", p.correntes, atu.correntes),
      mkLinha("Receitas de Capital", p.capital, atu.capital),
      mkLinha("Receitas Intra-orçamentárias", p.intra, atu.intra),
      mkLinha("SUBTOTAL DAS RECEITAS", p.subtotalReceitas, atu.subtotalReceitas),
    ],
    despesas: [
      mkLinha("Despesas Correntes", p.despCorrentes, atu.despCorrentes),
      mkLinha("Despesas de Capital", p.despCapital, atu.despCapital),
      mkLinha("Reserva de Contingência", p.reservaContingencia, atu.reservaContingencia),
      mkLinha("Despesas Intra-orçamentárias", p.despIntra, atu.despIntra),
      mkLinha("SUBTOTAL DAS DESPESAS", p.subtotalDespesas, atu.subtotalDespesas),
    ],
    resultadoSuperavit: {
      anoAnterior: p.superavit,
      anoAtual: atu.superavit,
    },
  };
}

// ==========================================================================
// RREO Anexo 03 — Receita Corrente Líquida (RCL)
// ==========================================================================

async function fetchRcl(ano: number, bim: number): Promise<RclData | null> {
  const COL_TOTAL = 13; // TOTAL (ÚLTIMOS 12 MESES)
  const [l48, l50, l54] = await Promise.all([
    fetchRreoRowCols(ano, bim, "RREO-Anexo 03", 48),
    fetchRreoRowCols(ano, bim, "RREO-Anexo 03", 50),
    fetchRreoRowCols(ano, bim, "RREO-Anexo 03", 54),
  ]);
  const rcl = l48[COL_TOTAL];
  if (rcl == null) return null;
  return {
    valorTotal: rcl,
    ajustadaEndividamento: l50[COL_TOTAL] ?? rcl,
    ajustadaPessoal: l54[COL_TOTAL] ?? rcl,
  };
}

// ==========================================================================
// RREO Anexo 06 — Resultado Primário, Nominal, DCL
// ==========================================================================

async function fetchResultados(
  ano: number,
  bim: number,
): Promise<ResultadosData | null> {
  // Anexo 06 rows:
  // 103 = RESULTADO PRIMÁRIO (SEM RPPS) - Acima da Linha (col_1)
  // 140 = DÍVIDA CONSOLIDADA (XXXIX) — col_1 = 31/12 anterior, col_2 = até bim atual
  // 147 = DCL (XLII) — col_1 = 31/12 anterior, col_2 = até bim atual
  const [l103, l147] = await Promise.all([
    fetchRreoRowCols(ano, bim, "RREO-Anexo 06", 103),
    fetchRreoRowCols(ano, bim, "RREO-Anexo 06", 147),
  ]);
  if (Object.keys(l103).length === 0 && Object.keys(l147).length === 0) return null;

  const resultadoPrimario = l103[1] ?? 0;
  const dclAnterior = l147[1] ?? 0;
  const dclAtual = l147[2] ?? 0;
  return {
    resultadoPrimario,
    dclAnterior,
    dclAtual,
    resultadoNominal: dclAtual - dclAnterior,
  };
}

// ==========================================================================
// RGF Anexo 01 — Pessoal
// ==========================================================================

async function fetchPessoal(
  ano: number,
  quad: number,
  entidade: string,
): Promise<PessoalData | null> {
  // Linhas:
  // 47 = RCL, 52 = RCL Ajustada p/ pessoal,
  // 53 = DTP (col_1 = valor, col_2 = % sobre RCL ajustada),
  // 54 = LIMITE MÁXIMO (col_1 = valor, col_2 = %),
  // 55 = LIMITE PRUDENCIAL, 56 = LIMITE ALERTA
  const [l52, l53, l54, l55, l56] = await Promise.all([
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 01", 52),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 01", 53),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 01", 54),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 01", 55),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 01", 56),
  ]);
  if (Object.keys(l53).length === 0) return null;
  // SICONFI armazena percentuais em escala 0-100 (ex.: 39,66). O consumidor
  // espera fração decimal (0,3966) — divide por 100 na borda.
  return {
    dtp: l53[1] ?? 0,
    rclAjustada: l52[1] ?? 0,
    percentualDtp: (l53[2] ?? 0) / 100,
    limiteMaximo: l54[1] ?? 0,
    limitePrudencial: l55[1] ?? 0,
    limiteAlerta: l56[1] ?? 0,
  };
}

// ==========================================================================
// RGF Anexo 02 — Dívida Consolidada
// ==========================================================================

async function fetchDivida(
  ano: number,
  quad: number,
  entidade: string,
): Promise<DividaConsolidadaData | null> {
  // Coluna: 2 = 1º Quad, 3 = 2º Quad, 4 = 3º Quad
  const col = quad + 1;
  // Linhas: 20=DC, 39=Deduções, 40=Disp.Caixa, 42=RP processados,
  //         43=Depósitos, 44=Demais haveres, 45=DCL,
  //         48=RCL Ajustada, 49=%DC, 50=%DCL, 51=LIMITE MÁXIMO
  const [l20, l39, l40, l42, l43, l44, l45, l48, l49, l50, l51] = await Promise.all([
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 20),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 39),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 40),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 42),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 43),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 44),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 45),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 48),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 49),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 50),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", 51),
  ]);
  if (Object.keys(l20).length === 0) return null;
  // SICONFI armazena percentuais em escala 0-100 (ex.: 12,74). O consumidor
  // espera fração decimal (0,1274) — divide por 100 na borda.
  return {
    dc: l20[col] ?? 0,
    deducoesTotal: l39[col] ?? 0,
    dcl: l45[col] ?? 0,
    rclAjustada: l48[col] ?? 0,
    percentualDc: (l49[col] ?? 0) / 100,
    percentualDcl: (l50[col] ?? 0) / 100,
    limiteMaximo: l51[col] ?? 0,
    disponibilidadeCaixa: l40[col] ?? 0,
    restosAPagar: l42[col] ?? 0,
    depositosRestituiveis: l43[col] ?? 0,
    demaisHaveres: l44[col] ?? 0,
  };
}

async function fetchComposicaoDivida(
  ano: number,
  quad: number,
  entidade: string,
): Promise<ComposicaoDividaLinha[]> {
  const colAtu = quad + 1;
  const colPrev = 1; // Saldo do Exercício Anterior
  // Tipos de dívida: 22=Dív.Contratual, 23=Empréstimos,
  // 27=Financiamentos, 30=Parcelamentos, 37=Precatórios, 38=Outras
  const defs: { linha: number; rotulo: string }[] = [
    { linha: 22, rotulo: "Dívida Contratual" },
    { linha: 23, rotulo: "Empréstimos" },
    { linha: 27, rotulo: "Financiamentos" },
    { linha: 30, rotulo: "Parcelamento e Renegociação" },
    { linha: 37, rotulo: "Precatórios (>05/05/2000)" },
    { linha: 38, rotulo: "Outras Dívidas" },
  ];
  const out: ComposicaoDividaLinha[] = [];
  for (const d of defs) {
    const m = await fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 02", d.linha);
    if (Object.keys(m).length === 0) continue;
    out.push({
      tipo: d.rotulo,
      anoAnterior: m[colPrev] ?? 0,
      anoAtual: m[colAtu] ?? 0,
    });
  }
  return out;
}

// ==========================================================================
// RGF Anexo 04 — Operações de Crédito
// ==========================================================================

async function fetchOperacoesCredito(
  ano: number,
  quad: number,
  entidade: string,
): Promise<OperacoesCreditoData | null> {
  // Linhas: 36 = TOTAL (III), 47 = RCL Ajustada, 50 = LIMITE GERAL (16%),
  //         51 = LIMITE ALERTA (14,4%)
  const [l36, l47, l50, l51] = await Promise.all([
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 04", 36),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 04", 47),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 04", 50),
    fetchRgfRowCols(ano, quad, entidade, "RGF-Anexo 04", 51),
  ]);
  if (Object.keys(l50).length === 0) return null;
  return {
    rclAjustada: l47[1] ?? 0,
    limiteGeral: l50[1] ?? 0,
    limiteAlerta: l51[1] ?? 0,
    valorRealizado: l36[2] ?? 0, // col_2 = até o quadrimestre
  };
}

// ==========================================================================
// SIOPS Anexo 12 — Indicador de Saúde (ASPS)
// ==========================================================================

async function fetchIndicadorSaude(
  ano: number,
  bim: number,
): Promise<import("./types").IndicadorSaudeData | null> {
  try {
    // São Luís/MA — código IBGE fixo para este dashboard
    const row = await getSiopsAnexo12(ano, bim, "211130");
    if (!row) return null;

    const r = row as unknown as {
      receita_impostos: number;
      receita_transferencias: number;
      total_receitas: number;
      despesa_minima: number;
      valor_aplicado_liquidada: number;
      percentual_aplicado_liquidada: number;
    };

    return {
      receitaImpostos: r.receita_impostos ?? 0,
      receitaTransferencias: r.receita_transferencias ?? 0,
      receitaTotal: r.total_receitas ?? 0,
      minimoAsps: r.despesa_minima ?? 0,
      aplicadoAsps: r.valor_aplicado_liquidada ?? 0,
      // SIOPS armazena o percentual em escala 0-100 (ex.: 17,63).
      // O consumidor (pptx-builder) espera fração decimal (0,1763).
      percentualAsps: (r.percentual_aplicado_liquidada ?? 0) / 100,
    };
  } catch {
    // Se a tabela ainda não existe ou erro qualquer, não bloqueia a geração
    return null;
  }
}

// ==========================================================================
// Função principal
// ==========================================================================

export async function gatherAudienciaData(
  params: AudienciaParams,
): Promise<AudienciaData> {
  const { ano, quadrimestre } = params;
  const bim = bimestreFor(quadrimestre);
  const cutoff = monthCutoff(quadrimestre);
  const anoBase = params.anoBaseCorrecao ?? ano;
  const ctx = await loadCorrectionContext(anoBase);

  // ---- Receitas: 5 anos de histórico ----
  const anos5 = [ano - 4, ano - 3, ano - 2, ano - 1, ano];
  const mapa = await loadCategoriasPorAno(anos5, cutoff, ctx);

  const iss = buildCategoriaDetalhe("ISS", "ISS/ISSQN", anos5, mapa, ["ISS"]);
  const iptu = buildCategoriaDetalhe("IPTU", "IPTU", anos5, mapa, ["IPTU"]);
  const itbi = buildCategoriaDetalhe("ITBI", "ITBI", anos5, mapa, ["ITBI"]);
  const ir = buildCategoriaDetalhe("IR", "Imposto de Renda (IRRF)", anos5, mapa, ["IR"]);
  const taxas = buildCategoriaDetalhe("TAXAS", "Taxas", anos5, mapa, ["TAXAS"]);

  const contribSociais = buildCategoriaDetalhe(
    "CONTRIBUICOES_SOCIAIS", "Contribuições Sociais",
    anos5, mapa, ["CONTRIBUICOES_SOCIAIS", "CONTRIBUICOES"],
  );
  const cosip = buildCategoriaDetalhe(
    "CONTRIBUICAO_ILUMINACAO", "COSIP (Iluminação Pública)",
    anos5, mapa, ["CONTRIBUICAO_ILUMINACAO"],
  );
  const patrimonial = buildCategoriaDetalhe(
    "RECEITA_PATRIMONIAL", "Receita Patrimonial",
    anos5, mapa, ["RECEITA_PATRIMONIAL"],
  );
  const outrasCorrentes = buildCategoriaDetalhe(
    "OUTRAS_RECEITAS_CORRENTES", "Outras Receitas Correntes",
    anos5, mapa, ["OUTRAS_RECEITAS_CORRENTES"],
  );

  const transferTotalCats: TaxCategory[] = [
    "TRANSFERENCIAS",
    "TRANSFER_UNIAO", "TRANSFER_UNIAO_FPM", "TRANSFER_UNIAO_SUS", "TRANSFER_UNIAO_OUTRAS",
    "TRANSFER_ESTADO", "TRANSFER_ESTADO_ICMS", "TRANSFER_ESTADO_IPVA", "TRANSFER_ESTADO_OUTROS",
  ];
  const transferTotal = buildCategoriaDetalhe(
    "TRANSFERENCIAS", "Transferências Correntes", anos5, mapa, transferTotalCats,
  );
  const uniaoFpm = buildCategoriaDetalhe(
    "TRANSFER_UNIAO_FPM", "União - FPM", anos5, mapa, ["TRANSFER_UNIAO_FPM"],
  );
  const uniaoSus = buildCategoriaDetalhe(
    "TRANSFER_UNIAO_SUS", "União - SUS", anos5, mapa, ["TRANSFER_UNIAO_SUS"],
  );
  const uniaoOutras = buildCategoriaDetalhe(
    "TRANSFER_UNIAO_OUTRAS", "União - Outras",
    anos5, mapa, ["TRANSFER_UNIAO_OUTRAS", "TRANSFER_UNIAO"],
  );
  const estadoIcms = buildCategoriaDetalhe(
    "TRANSFER_ESTADO_ICMS", "Estado - ICMS", anos5, mapa, ["TRANSFER_ESTADO_ICMS"],
  );
  const estadoIpva = buildCategoriaDetalhe(
    "TRANSFER_ESTADO_IPVA", "Estado - IPVA", anos5, mapa, ["TRANSFER_ESTADO_IPVA"],
  );
  const estadoOutras = buildCategoriaDetalhe(
    "TRANSFER_ESTADO_OUTROS", "Estado - Outras",
    anos5, mapa, ["TRANSFER_ESTADO_OUTROS", "TRANSFER_ESTADO"],
  );

  const totalTributarias =
    iss.valorArrecadado + iptu.valorArrecadado + itbi.valorArrecadado +
    ir.valorArrecadado + taxas.valorArrecadado;

  // ---- Dependência Financeira ----
  const propriosCats: TaxCategory[] = [
    "IPTU", "ITBI", "IR", "ISS", "TAXAS",
    "CONTRIBUICOES", "CONTRIBUICOES_SOCIAIS", "CONTRIBUICAO_ILUMINACAO",
    "RECEITA_PATRIMONIAL", "RECEITA_SERVICOS", "OUTRAS_RECEITAS_CORRENTES",
  ];
  const dependenciaFinanceira: DependenciaFinanceiraAno[] = anos5.map((a) => {
    const m = mapa.get(a);
    const proprios = sumCategorias(m, propriosCats);
    const transferidos = sumCategorias(m, transferTotalCats);
    const tot = proprios + transferidos;
    return {
      ano: a,
      proprios,
      transferidos,
      percentProprios: tot > 0 ? proprios / tot : 0,
      percentTransferidos: tot > 0 ? transferidos / tot : 0,
    };
  });

  // ---- RREO Anexo 01 — Balanço Orçamentário (atual vs anterior) ----
  const despCol = quadrimestre === 3 ? 4 : 7;
  const [anexo01Atu, anexo01Prev] = await Promise.all([
    fetchAnexo01(ano, bim, despCol),
    fetchAnexo01(ano - 1, bim, despCol),
  ]);
  const balancoOrcamentario = buildBalancoOrcamentario(anexo01Atu, anexo01Prev);

  // ---- RREO Anexo 03 — RCL ----
  const rcl = await fetchRcl(ano, bim);

  // ---- RREO Anexo 06 — Resultado Primário/Nominal ----
  const resultados = await fetchResultados(ano, bim);

  // ---- RGF ----
  // O pipeline de upload (app/api/upload/route.ts) persiste `entidade` como
  // "prefeitura" ou "camara" (vide lib/parsers/detect-file-type.ts). Para a
  // audiência do Poder Executivo lemos a entidade "prefeitura".
  const entidade = "prefeitura";
  const [pessoal, dividaConsolidada, composicaoDivida, operacoesCredito] =
    await Promise.all([
      fetchPessoal(ano, quadrimestre, entidade),
      fetchDivida(ano, quadrimestre, entidade),
      fetchComposicaoDivida(ano, quadrimestre, entidade),
      fetchOperacoesCredito(ano, quadrimestre, entidade),
    ]);

  // ---- SIOPS Anexo 12 — Indicador de Saúde (ASPS) ----
  const indicadorSaude = await fetchIndicadorSaude(ano, bim);

  // Educação (MDE/Anexo 08): ainda não implementado — mantemos null.
  return {
    params,
    periodoRef: periodoLabel(quadrimestre, ano),
    tituloQuadrimestre: tituloQuadrimestre(quadrimestre, ano),
    tributarias: {
      iss, iptu, itbi, ir, taxas,
      total: totalTributarias,
    },
    contribuicoes: {
      sociais: contribSociais,
      cosip,
    },
    receitaPatrimonial: patrimonial,
    outrasReceitasCorrentes: outrasCorrentes,
    transferencias: {
      total: transferTotal,
      uniaoFpm, uniaoSus, uniaoOutras,
      estadoIcms, estadoIpva, estadoOutras,
    },
    dependenciaFinanceira,
    balancoOrcamentario,
    rcl,
    resultados,
    indicadorEducacao: null,
    indicadorSaude,
    pessoal,
    dividaConsolidada,
    composicaoDivida,
    operacoesCredito,
  };
}
