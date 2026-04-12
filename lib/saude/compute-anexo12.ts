/**
 * Calcula o Anexo 12 (Saúde — LC 141/2012) a partir dos dados internos
 * da prefeitura (tabelas `receitas` e `despesas`), sem depender de scraping
 * do SIOPS.
 *
 * A metodologia foi validada centavo a centavo contra os PDFs oficiais
 * homologados no SIOPS (5º e 6º bimestres de 2025) para São Luís/MA:
 *
 * - **Receita base (III)**: somam-se apenas linhas-folha (campo `fonte`
 *   preenchido) por prefixo de classificação MCASP.
 * - **Impostos (I) = líquidos**: bruto do imposto + deduções específicas
 *   (classificação iniciada em 911xxx) para cada tributo.
 * - **Transferências (II) = brutas**: FPM, ITR, ICMS, IPVA, IPI-Exp (antes
 *   do FUNDEB).
 * - **XI (ASPS computadas no mínimo)**: linhas com função=10 E fonte
 *   igual a `1500001002`.
 * - **XLVIII (total ASPS)**: linhas com função=10 em qualquer fonte.
 * - **XL (não computadas)**: diferença XLVIII - XI.
 * - **% aplicado**: (XVI / III) × 100, armazenado em float para permitir
 *   truncamento na apresentação (o SIOPS exibe truncado, não arredondado).
 */

import type {
  SiopsAnexo12,
  SiopsDespesasSubfuncao,
  SiopsReceitas,
} from "@/lib/siops/types";
import {
  getDespesasSaudeByYear,
  getReceitasFolhasByYear,
} from "@/lib/db/queries";
import { upsertSiopsAnexo12 } from "@/lib/siops/queries";

export const COD_IBGE_SAO_LUIS = "211130";
export const UF_SIGLA_MA = "MA";
export const UF_NOME_MA = "Maranhão";
export const MUNICIPIO_SAO_LUIS = "São Luís";

// Fonte de recurso que identifica despesa ASPS computada no mínimo (XI).
// Descoberta por cruzamento exato com SIOPS: função=10 + fonte=1500001002
// bate centavo a centavo com XI em todos os status (empenhada/liquidada/paga).
const FONTE_ASPS_COMPUTADA = "1500001002";

// Subfunções MCASP da função Saúde (10).
const SUBF_ATENCAO_BASICA = "301";
const SUBF_ASSIST_HOSP = "302";
const SUBF_SUPORTE_PROFILATICO = "303";
const SUBF_VIG_SANITARIA = "304";
const SUBF_VIG_EPIDEMIOLOGICA = "305";
const SUBF_ALIM_NUTRICAO = "306";

// Meses do ano na ordem do breakdown mensal (bimestre 1 = jan+fev, etc.)
const MESES = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;
type Mes = (typeof MESES)[number];

/** Soma os valores mensais acumulados até o fim do bimestre informado. */
function acumuladoAteBimestre(
  row: Record<Mes, number>,
  bimestre: number,
): number {
  const ultimoMes = Math.min(12, bimestre * 2);
  let s = 0;
  for (let i = 0; i < ultimoMes; i++) {
    s += Number(row[MESES[i]] ?? 0);
  }
  return s;
}

// ---------- Classificação de linhas de receita (prefixos MCASP) ----------

type CategoriaReceita =
  | "IPTU"
  | "ITBI"
  | "IRRF"
  | "ISS"
  | "FPM"
  | "ITR"
  | "ICMS"
  | "IPVA"
  | "IPI_EXP"
  | "DED_IPTU"
  | "DED_ITBI"
  | "DED_IRRF"
  | "DED_ISS"
  | null;

/**
 * Mapeia o código de classificação MCASP para uma das categorias usadas no
 * cálculo do Anexo 12. Retorna `null` para linhas irrelevantes.
 *
 * NB: o teste das deduções precisa vir **antes** do teste dos brutos para
 * 911253 não ser confundido com 111253 — embora na prática nenhum prefixo
 * de receita bruta colida com o `9` das deduções.
 */
function classificarReceita(code: string): CategoriaReceita {
  const c = code.trim();

  // Deduções de receita de impostos (para obter o líquido)
  if (c.startsWith("9111253")) return "DED_ITBI";
  if (c.startsWith("911125")) return "DED_IPTU";
  if (c.startsWith("911130")) return "DED_IRRF";
  if (c.startsWith("911140") || c.startsWith("911145")) return "DED_ISS";

  // Impostos (formato MCASP 11 dígitos, 2022+)
  if (c.startsWith("111253")) return "ITBI";
  if (c.startsWith("11125")) return "IPTU";
  if (c.startsWith("11130")) return "IRRF";
  if (c.startsWith("11140") || c.startsWith("11145")) return "ISS";

  // Transferências constitucionais e legais (II)
  if (c.startsWith("171151")) return "FPM";
  if (c.startsWith("171152")) return "ITR";
  if (c.startsWith("172150")) return "ICMS";
  if (c.startsWith("172151")) return "IPVA";
  if (c.startsWith("172152")) return "IPI_EXP";

  return null;
}

interface ReceitasComputed {
  iptu: number;
  itbi: number;
  irrf: number;
  iss: number;
  fpm: number;
  itr: number;
  icms: number;
  ipva: number;
  ipiExportacao: number;
  impostosTotal: number;
  transferenciasTotal: number;
  total: number;
}

async function computeReceitas(
  ano: number,
  bimestre: number,
): Promise<ReceitasComputed> {
  const rows = await getReceitasFolhasByYear(ano);

  let bIptu = 0,
    bItbi = 0,
    bIrrf = 0,
    bIss = 0;
  let dIptu = 0,
    dItbi = 0,
    dIrrf = 0,
    dIss = 0;
  let fpm = 0,
    itr = 0,
    icms = 0,
    ipva = 0,
    ipi = 0;

  for (const r of rows) {
    const cat = classificarReceita(r.classificacao);
    if (!cat) continue;
    const v = acumuladoAteBimestre(r, bimestre);
    switch (cat) {
      case "IPTU":
        bIptu += v;
        break;
      case "ITBI":
        bItbi += v;
        break;
      case "IRRF":
        bIrrf += v;
        break;
      case "ISS":
        bIss += v;
        break;
      case "DED_IPTU":
        dIptu += v;
        break;
      case "DED_ITBI":
        dItbi += v;
        break;
      case "DED_IRRF":
        dIrrf += v;
        break;
      case "DED_ISS":
        dIss += v;
        break;
      case "FPM":
        fpm += v;
        break;
      case "ITR":
        itr += v;
        break;
      case "ICMS":
        icms += v;
        break;
      case "IPVA":
        ipva += v;
        break;
      case "IPI_EXP":
        ipi += v;
        break;
    }
  }

  // Líquidos = bruto + deduções (que já vêm negativas no CSV)
  const iptu = bIptu + dIptu;
  const itbi = bItbi + dItbi;
  const irrf = bIrrf + dIrrf;
  const iss = bIss + dIss;

  const impostosTotal = iptu + itbi + irrf + iss;
  const transferenciasTotal = fpm + itr + icms + ipva + ipi;

  return {
    iptu,
    itbi,
    irrf,
    iss,
    fpm,
    itr,
    icms,
    ipva,
    ipiExportacao: ipi,
    impostosTotal,
    transferenciasTotal,
    total: impostosTotal + transferenciasTotal,
  };
}

// ---------- Agrupamento de despesas por subfunção Saúde ----------

interface SubfuncaoAcc {
  atencaoBasica: { empenhada: number; liquidada: number; paga: number };
  assistenciaHospitalar: { empenhada: number; liquidada: number; paga: number };
  suporteProfilatico: { empenhada: number; liquidada: number; paga: number };
  vigilanciaSanitaria: { empenhada: number; liquidada: number; paga: number };
  vigilanciaEpidemiologica: {
    empenhada: number;
    liquidada: number;
    paga: number;
  };
  alimentacaoNutricao: { empenhada: number; liquidada: number; paga: number };
  outrasSubfuncoes: { empenhada: number; liquidada: number; paga: number };
  total: { empenhada: number; liquidada: number; paga: number };
}

function emptyAcc(): SubfuncaoAcc {
  const zero = () => ({ empenhada: 0, liquidada: 0, paga: 0 });
  return {
    atencaoBasica: zero(),
    assistenciaHospitalar: zero(),
    suporteProfilatico: zero(),
    vigilanciaSanitaria: zero(),
    vigilanciaEpidemiologica: zero(),
    alimentacaoNutricao: zero(),
    outrasSubfuncoes: zero(),
    total: zero(),
  };
}

function bucketParaSubfuncao(acc: SubfuncaoAcc, sub: string) {
  switch (sub) {
    case SUBF_ATENCAO_BASICA:
      return acc.atencaoBasica;
    case SUBF_ASSIST_HOSP:
      return acc.assistenciaHospitalar;
    case SUBF_SUPORTE_PROFILATICO:
      return acc.suporteProfilatico;
    case SUBF_VIG_SANITARIA:
      return acc.vigilanciaSanitaria;
    case SUBF_VIG_EPIDEMIOLOGICA:
      return acc.vigilanciaEpidemiologica;
    case SUBF_ALIM_NUTRICAO:
      return acc.alimentacaoNutricao;
    default:
      return acc.outrasSubfuncoes;
  }
}

function toSubfuncaoView(
  acc: SubfuncaoAcc,
  pick: "empenhada" | "liquidada" | "paga",
): SiopsDespesasSubfuncao {
  return {
    atencaoBasica: acc.atencaoBasica[pick],
    assistenciaHospitalar: acc.assistenciaHospitalar[pick],
    suporteProfilatico: acc.suporteProfilatico[pick],
    vigilanciaSanitaria: acc.vigilanciaSanitaria[pick],
    vigilanciaEpidemiologica: acc.vigilanciaEpidemiologica[pick],
    alimentacaoNutricao: acc.alimentacaoNutricao[pick],
    outrasSubfuncoes: acc.outrasSubfuncoes[pick],
    total: acc.total[pick],
  };
}

interface DespesasComputed {
  proprias: {
    empenhada: SiopsDespesasSubfuncao;
    liquidada: SiopsDespesasSubfuncao;
    paga: SiopsDespesasSubfuncao;
  };
  naoComputadas: {
    empenhada: SiopsDespesasSubfuncao;
    liquidada: SiopsDespesasSubfuncao;
    paga: SiopsDespesasSubfuncao;
  };
  totais: {
    empenhada: number;
    liquidada: number;
    paga: number;
  };
}

async function computeDespesas(ano: number): Promise<DespesasComputed> {
  const rows = await getDespesasSaudeByYear(ano);

  const proprias = emptyAcc();
  const naoComputadas = emptyAcc();

  let totalEmp = 0;
  let totalLiq = 0;
  let totalPago = 0;

  for (const r of rows) {
    const emp = Number(r.empenhado_acumulado ?? 0);
    const liq = Number(r.liquidado_acumulado ?? 0);
    const pago = Number(r.pago_acumulado ?? 0);

    const acc = r.fonte === FONTE_ASPS_COMPUTADA ? proprias : naoComputadas;
    const b = bucketParaSubfuncao(acc, r.subfuncao);
    b.empenhada += emp;
    b.liquidada += liq;
    b.paga += pago;
    acc.total.empenhada += emp;
    acc.total.liquidada += liq;
    acc.total.paga += pago;

    totalEmp += emp;
    totalLiq += liq;
    totalPago += pago;
  }

  return {
    proprias: {
      empenhada: toSubfuncaoView(proprias, "empenhada"),
      liquidada: toSubfuncaoView(proprias, "liquidada"),
      paga: toSubfuncaoView(proprias, "paga"),
    },
    naoComputadas: {
      empenhada: toSubfuncaoView(naoComputadas, "empenhada"),
      liquidada: toSubfuncaoView(naoComputadas, "liquidada"),
      paga: toSubfuncaoView(naoComputadas, "paga"),
    },
    totais: {
      empenhada: totalEmp,
      liquidada: totalLiq,
      paga: totalPago,
    },
  };
}

// ---------- Montagem e persistência do Anexo 12 ----------

function buildReceitas(r: ReceitasComputed): SiopsReceitas {
  return {
    impostos: r.impostosTotal,
    iptu: r.iptu,
    itbi: r.itbi,
    iss: r.iss,
    irrf: r.irrf,
    transferencias: r.transferenciasTotal,
    fpm: r.fpm,
    itr: r.itr,
    ipva: r.ipva,
    icms: r.icms,
    ipiExportacao: r.ipiExportacao,
    // Compensações financeiras: não há hoje no balancete interno. Mantido
    // zero para preservar a compatibilidade com o tipo (mesmo padrão do
    // PDF oficial, que mostra 0,00 para o município).
    compensacoes: 0,
    total: r.total,
  };
}

export interface ComputeAnexo12Result {
  action: "inserted" | "updated" | "unchanged" | "skipped";
  exercicioAno: number;
  bimestre: number;
  motivo?: string;
  receitaTotal?: number;
  valorAplicadoLiquidada?: number;
  percentualLiquidada?: number;
}

/**
 * Calcula e persiste o Anexo 12 para um (ano, bimestre).
 * Se não houver receitas folha ou despesas de saúde, retorna `skipped`.
 */
export async function computeAndUpsertAnexo12(
  ano: number,
  bimestre: number,
): Promise<ComputeAnexo12Result> {
  if (bimestre < 1 || bimestre > 6) {
    throw new Error(`Bimestre inválido: ${bimestre}`);
  }

  const receitas = await computeReceitas(ano, bimestre);
  const despesas = await computeDespesas(ano);

  // Se não há receita ou despesa detectada, não há o que persistir.
  if (receitas.total === 0 && despesas.totais.empenhada === 0) {
    return {
      action: "skipped",
      exercicioAno: ano,
      bimestre,
      motivo:
        "Sem dados de receita ou despesa para o exercício. Importe os Balancetes.",
    };
  }

  // Como XIII/XIV/XV são zero no município, XVI = XII = XI.
  const xvi = {
    empenhada: despesas.proprias.empenhada.total,
    liquidada: despesas.proprias.liquidada.total,
    paga: despesas.proprias.paga.total,
  };
  const despesaMinima = receitas.total * 0.15;
  const pct = (v: number) =>
    receitas.total > 0 ? (v / receitas.total) * 100 : 0;

  const anexo: SiopsAnexo12 = {
    uf: UF_NOME_MA,
    ufSigla: UF_SIGLA_MA,
    municipio: MUNICIPIO_SAO_LUIS,
    codIbge: COD_IBGE_SAO_LUIS,
    exercicioAno: ano,
    bimestre,
    dataHomologacao: new Date().toISOString().slice(0, 10),
    receitas: buildReceitas(receitas),
    despesasProprias: {
      empenhada: despesas.proprias.empenhada,
      liquidada: despesas.proprias.liquidada,
    },
    apuracao: {
      totalDespesasAsps: xvi,
      rpInscritosIndevidamente: { empenhada: 0, liquidada: 0, paga: 0 },
      despesasRecursosVinculados: { empenhada: 0, liquidada: 0, paga: 0 },
      despesasCaixaRpCancelados: { empenhada: 0, liquidada: 0, paga: 0 },
      valorAplicado: xvi,
      despesaMinima,
      diferenca: {
        empenhada: xvi.empenhada - despesaMinima,
        liquidada: xvi.liquidada - despesaMinima,
        paga: xvi.paga - despesaMinima,
      },
      percentualAplicado: {
        empenhada: pct(xvi.empenhada),
        liquidada: pct(xvi.liquidada),
        paga: pct(xvi.paga),
      },
    },
    // Receitas adicionais (XXIX-XXXII) e despesas totais (XLVIII/XLIX):
    // preenche XLVIII a partir do total da função 10; as demais métricas
    // dependem de fontes SUS específicas que ainda não foram validadas
    // individualmente — ficam zeradas até a próxima iteração.
    receitasAdicionais: {
      transferencias: 0,
      provenientesUniao: 0,
      provenientesEstados: 0,
      provenientesOutrosMunicipios: 0,
      operacoesCredito: 0,
      outras: 0,
      total: 0,
    },
    despesasNaoComputadas: {
      empenhada: despesas.naoComputadas.empenhada,
      liquidada: despesas.naoComputadas.liquidada,
    },
    despesasTotais: {
      totalSaude: despesas.totais,
      totalProprios: xvi,
    },
  };

  const upsert = await upsertSiopsAnexo12(anexo);

  return {
    action: upsert.action,
    exercicioAno: ano,
    bimestre,
    receitaTotal: receitas.total,
    valorAplicadoLiquidada: xvi.liquidada,
    percentualLiquidada: pct(xvi.liquidada),
  };
}

/**
 * Recalcula todos os 6 bimestres para um exercício. Pula bimestres sem
 * receita disponível (ex: CSV do ano corrente só tem movimento parcial).
 */
export async function computeAllBimestres(
  ano: number,
): Promise<ComputeAnexo12Result[]> {
  const results: ComputeAnexo12Result[] = [];
  for (let bim = 1; bim <= 6; bim++) {
    const r = await computeAndUpsertAnexo12(ano, bim);
    results.push(r);
  }
  return results;
}

/**
 * Inferência simples do bimestre de referência para um exercício:
 * - Ano anterior ao atual → 6º bimestre (ano fechado).
 * - Ano corrente → bimestre em curso (ceil(mes/2)).
 * - Ano futuro → 1º (fallback).
 */
export function inferBimestreDoExercicio(
  ano: number,
  now: Date = new Date(),
): number {
  const anoAtual = now.getFullYear();
  if (ano < anoAtual) return 6;
  if (ano > anoAtual) return 1;
  const mes = now.getMonth() + 1; // 1..12
  return Math.max(1, Math.min(6, Math.ceil(mes / 2)));
}
