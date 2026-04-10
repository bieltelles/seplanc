import type { InValue } from "@libsql/client";
import { getDb } from "./connection";
import { initializeSchema } from "./schema";
import type { ReceitaRow } from "@/lib/parsers/csv-receitas";
import type { RreoRow } from "@/lib/parsers/xls-rreo";
import type { RgfRow } from "@/lib/parsers/xls-rgf";
import type { CorrectionContext } from "@/lib/ipca/context";
import {
  correctMonthlyRow,
  correctMonthlyValue,
  correctOrcado,
  shouldCorrectYear,
} from "@/lib/ipca/correction";

let initialized = false;

async function ensureSchema() {
  if (!initialized) {
    await initializeSchema();
    initialized = true;
  }
}

// ===== Exercícios =====

export async function getExercicios() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute("SELECT DISTINCT ano FROM exercicios ORDER BY ano DESC");
  return result.rows as unknown as { ano: number }[];
}

export async function getExerciciosWithDetails() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute(`
    SELECT e.ano, e.tipo, e.status, e.created_at,
      (SELECT COUNT(*) FROM receitas WHERE exercicio_ano = e.ano) as total_receitas,
      (SELECT COUNT(DISTINCT bimestre) FROM rreo WHERE exercicio_ano = e.ano) as total_rreo_bimestres,
      (SELECT COUNT(DISTINCT quadrimestre || '-' || entidade) FROM rgf WHERE exercicio_ano = e.ano) as total_rgf_quadrimestres
    FROM exercicios e
    ORDER BY e.ano DESC
  `);
  return result.rows;
}

export async function upsertExercicio(ano: number, tipo: string) {
  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO exercicios (ano, tipo) VALUES (?, ?)
          ON CONFLICT(ano, tipo) DO UPDATE SET updated_at = datetime('now')`,
    args: [ano, tipo],
  });
}

export async function deleteExercicio(ano: number) {
  await ensureSchema();
  const db = getDb();
  await db.batch(
    [
      { sql: "DELETE FROM receitas WHERE exercicio_ano = ?", args: [ano] },
      { sql: "DELETE FROM rreo WHERE exercicio_ano = ?", args: [ano] },
      { sql: "DELETE FROM rgf WHERE exercicio_ano = ?", args: [ano] },
      { sql: "DELETE FROM uploads WHERE exercicio_ano = ?", args: [ano] },
      { sql: "DELETE FROM exercicios WHERE ano = ?", args: [ano] },
    ],
    "write",
  );
}

// ===== Receitas =====

const BATCH_CHUNK_SIZE = 200;

export async function insertReceitas(ano: number, rows: ReceitaRow[]) {
  await ensureSchema();
  const db = getDb();

  // Delete existing data first
  await db.execute({ sql: "DELETE FROM receitas WHERE exercicio_ano = ?", args: [ano] });

  // Insert in chunks using batch
  for (let i = 0; i < rows.length; i += BATCH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(
      chunk.map((r) => ({
        sql: `INSERT INTO receitas (
          exercicio_ano, rubrica, fonte, classificacao, descricao,
          is_header, is_deducao, nivel, orcado,
          janeiro, fevereiro, marco, abril, maio, junho,
          julho, agosto, setembro, outubro, novembro, dezembro,
          acumulado, categoria_tributaria
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ano, r.rubrica, r.fonte, r.classificacao, r.descricao,
          r.isHeader ? 1 : 0, r.isDeducao ? 1 : 0, r.nivel, r.orcado,
          r.janeiro, r.fevereiro, r.marco, r.abril, r.maio, r.junho,
          r.julho, r.agosto, r.setembro, r.outubro, r.novembro, r.dezembro,
          r.acumulado, r.categoriaTributaria,
        ],
      })),
      "write",
    );
  }

  return rows.length;
}

export async function getReceitasByYear(ano: number) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM receitas WHERE exercicio_ano = ? ORDER BY id",
    args: [ano],
  });
  return result.rows;
}

/**
 * Reclassifica todas as linhas de receitas aplicando a função `classifyRevenue`
 * atual sobre a coluna `classificacao`. Útil quando a lógica de classificação
 * é atualizada sem precisar reimportar os CSVs.
 */
export async function reclassifyAllReceitas(): Promise<{
  totalLidos: number;
  totalAtualizados: number;
  porCategoria: Record<string, number>;
}> {
  const { classifyRevenue } = await import("@/lib/constants/tax-categories");
  await ensureSchema();
  const db = getDb();

  const result = await db.execute(
    "SELECT id, classificacao, categoria_tributaria FROM receitas",
  );
  const rows = result.rows as unknown as {
    id: number;
    classificacao: string;
    categoria_tributaria: string | null;
  }[];

  const updates: { id: number; novaCategoria: string }[] = [];
  const porCategoria: Record<string, number> = {};

  for (const row of rows) {
    const nova = classifyRevenue(row.classificacao || "");
    porCategoria[nova] = (porCategoria[nova] || 0) + 1;
    if (nova !== row.categoria_tributaria) {
      updates.push({ id: row.id, novaCategoria: nova });
    }
  }

  for (let i = 0; i < updates.length; i += BATCH_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(
      chunk.map((u) => ({
        sql: "UPDATE receitas SET categoria_tributaria = ? WHERE id = ?",
        args: [u.novaCategoria, u.id],
      })),
      "write",
    );
  }

  return {
    totalLidos: rows.length,
    totalAtualizados: updates.length,
    porCategoria,
  };
}

export async function getReceitasFiltered(
  params: {
    anos?: number[];
    categoria?: string;
    apenasDetalhes?: boolean;
  },
  ctx?: CorrectionContext | null,
) {
  await ensureSchema();
  const db = getDb();
  let sql = "SELECT * FROM receitas WHERE 1=1";
  const binds: InValue[] = [];

  if (params.anos && params.anos.length > 0) {
    sql += ` AND exercicio_ano IN (${params.anos.map(() => "?").join(",")})`;
    binds.push(...params.anos);
  }
  if (params.categoria) {
    sql += " AND categoria_tributaria = ?";
    binds.push(params.categoria);
  }
  if (params.apenasDetalhes) {
    sql += " AND is_header = 0";
  }

  sql += " ORDER BY exercicio_ano, id";
  const result = await db.execute({ sql, args: binds });
  const rows = result.rows as unknown as (Record<string, unknown> & { exercicio_ano: number })[];

  if (!ctx) return rows;

  return rows.map((row) => {
    if (!shouldCorrectYear(row.exercicio_ano, ctx.currentYear)) return row;
    const corrected = correctMonthlyRow(row as unknown as Record<string, number>, row.exercicio_ano, ctx.ipcaMap, {
      tipoJuros: ctx.tipoJuros,
      currentYear: ctx.currentYear,
    });
    return { ...row, ...corrected };
  });
}

// ===== Dashboard Aggregations =====

const MONTH_COLS = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

export async function getDashboardSummary(ano: number, ctx?: CorrectionContext | null) {
  await ensureSchema();
  const db = getDb();

  const rcResult = await db.execute({
    sql: `SELECT orcado, acumulado,
      janeiro, fevereiro, marco, abril, maio, junho,
      julho, agosto, setembro, outubro, novembro, dezembro
    FROM receitas
    WHERE exercicio_ano = ? AND (classificacao = '10000000000' OR classificacao = '1000000000')
    LIMIT 1`,
    args: [ano],
  });
  const receitasCorrentesRaw = rcResult.rows[0] as unknown as Record<string, number> | undefined;

  const deducoesResult = await db.execute({
    sql: `SELECT
      SUM(janeiro) as janeiro, SUM(fevereiro) as fevereiro,
      SUM(marco) as marco, SUM(abril) as abril,
      SUM(maio) as maio, SUM(junho) as junho,
      SUM(julho) as julho, SUM(agosto) as agosto,
      SUM(setembro) as setembro, SUM(outubro) as outubro,
      SUM(novembro) as novembro, SUM(dezembro) as dezembro,
      SUM(acumulado) as acumulado
    FROM receitas WHERE exercicio_ano = ? AND is_header = 0 AND is_deducao = 1`,
    args: [ano],
  });
  const deducoesRaw = deducoesResult.rows[0] as unknown as Record<string, number> | undefined;

  const catResult = await db.execute({
    sql: `SELECT categoria_tributaria,
      SUM(janeiro) as janeiro, SUM(fevereiro) as fevereiro,
      SUM(marco) as marco, SUM(abril) as abril,
      SUM(maio) as maio, SUM(junho) as junho,
      SUM(julho) as julho, SUM(agosto) as agosto,
      SUM(setembro) as setembro, SUM(outubro) as outubro,
      SUM(novembro) as novembro, SUM(dezembro) as dezembro,
      SUM(acumulado) as total,
      SUM(orcado) as orcado_total
    FROM receitas
    WHERE exercicio_ano = ? AND is_header = 0 AND categoria_tributaria != 'OUTROS'
    GROUP BY categoria_tributaria
    ORDER BY total DESC`,
    args: [ano],
  });
  const byCategoryRaw = catResult.rows as unknown as (Record<string, number> & {
    categoria_tributaria: string;
  })[];

  // Aplica correção (se solicitada e necessária)
  const applyCorrection = ctx && shouldCorrectYear(ano, ctx.currentYear);

  const rcCorrected = applyCorrection && receitasCorrentesRaw
    ? correctMonthlyRow(receitasCorrentesRaw, ano, ctx.ipcaMap, {
        tipoJuros: ctx.tipoJuros,
        currentYear: ctx.currentYear,
      })
    : null;

  const deducoesCorrected = applyCorrection && deducoesRaw
    ? correctMonthlyRow(deducoesRaw, ano, ctx.ipcaMap, {
        tipoJuros: ctx.tipoJuros,
        currentYear: ctx.currentYear,
      })
    : null;

  const byCategory = byCategoryRaw.map((row) => {
    const r = row as unknown as Record<string, number>;
    if (applyCorrection) {
      const corrected = correctMonthlyRow({ ...r, orcado: r.orcado_total }, ano, ctx.ipcaMap, {
        tipoJuros: ctx.tipoJuros,
        currentYear: ctx.currentYear,
      });
      return {
        categoria_tributaria: row.categoria_tributaria,
        total: corrected.acumulado,
        orcado_total: corrected.orcado,
      };
    }
    return {
      categoria_tributaria: row.categoria_tributaria,
      total: r.total || 0,
      orcado_total: r.orcado_total || 0,
    };
  });

  const rcFinal = rcCorrected || receitasCorrentesRaw;
  const deducoesFinal = deducoesCorrected || deducoesRaw;

  const months = rcFinal ? MONTH_COLS.map((m) => (rcFinal[m] as number) || 0) : [];

  const totalOrcado = (rcFinal?.orcado as number) || 0;
  const totalArrecadado = (rcFinal?.acumulado as number) || 0;
  const totalDeducoes = (deducoesFinal?.acumulado as number) || 0;

  return {
    ano,
    totalOrcado,
    totalArrecadado,
    totalDeducoes,
    execucaoOrcamentaria: totalOrcado > 0 ? totalArrecadado / totalOrcado : 0,
    byCategory,
    monthlyTotals: months,
    correcaoAplicada: !!applyCorrection,
  };
}

export async function getMonthlyComparison(
  ano1: number,
  ano2: number,
  ctx?: CorrectionContext | null,
) {
  await ensureSchema();
  const db = getDb();

  const getMonthly = async (ano: number) => {
    const result = await db.execute({
      sql: `SELECT janeiro, fevereiro, marco, abril, maio, junho,
             julho, agosto, setembro, outubro, novembro, dezembro, acumulado, orcado
      FROM receitas
      WHERE exercicio_ano = ? AND (classificacao = '10000000000' OR classificacao = '1000000000')
      LIMIT 1`,
      args: [ano],
    });
    const row = result.rows[0] as unknown as Record<string, number> | undefined;
    if (!row) return MONTH_COLS.map(() => 0);

    if (ctx && shouldCorrectYear(ano, ctx.currentYear)) {
      const corrected = correctMonthlyRow(row, ano, ctx.ipcaMap, {
        tipoJuros: ctx.tipoJuros,
        currentYear: ctx.currentYear,
      });
      return MONTH_COLS.map((m) => corrected[m] || 0);
    }
    return MONTH_COLS.map((m) => (row[m] as number) || 0);
  };

  return {
    ano1: { ano: ano1, months: await getMonthly(ano1) },
    ano2: { ano: ano2, months: await getMonthly(ano2) },
  };
}

export async function getCategoryByMonth(
  ano: number,
  categoria: string,
  ctx?: CorrectionContext | null,
) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT
      SUM(janeiro) as janeiro, SUM(fevereiro) as fevereiro,
      SUM(marco) as marco, SUM(abril) as abril,
      SUM(maio) as maio, SUM(junho) as junho,
      SUM(julho) as julho, SUM(agosto) as agosto,
      SUM(setembro) as setembro, SUM(outubro) as outubro,
      SUM(novembro) as novembro, SUM(dezembro) as dezembro,
      SUM(acumulado) as acumulado, SUM(orcado) as orcado
    FROM receitas
    WHERE exercicio_ano = ? AND categoria_tributaria = ? AND is_header = 0`,
    args: [ano, categoria],
  });
  const row = result.rows[0] as unknown as Record<string, number> | undefined;
  if (!row) return undefined;

  if (ctx && shouldCorrectYear(ano, ctx.currentYear)) {
    return correctMonthlyRow(row, ano, ctx.ipcaMap, {
      tipoJuros: ctx.tipoJuros,
      currentYear: ctx.currentYear,
    });
  }
  return row;
}

export async function getYearlyTrend(ctx?: CorrectionContext | null) {
  await ensureSchema();
  const db = getDb();
  // Busca dados mensais para permitir correção consistente por mês
  const result = await db.execute(`
    SELECT exercicio_ano as ano, orcado, acumulado,
      janeiro, fevereiro, marco, abril, maio, junho,
      julho, agosto, setembro, outubro, novembro, dezembro
    FROM receitas
    WHERE classificacao IN ('10000000000', '1000000000')
    ORDER BY exercicio_ano
  `);
  const rows = result.rows as unknown as (Record<string, number> & { ano: number })[];

  return rows.map((r) => {
    if (ctx && shouldCorrectYear(r.ano, ctx.currentYear)) {
      const corrected = correctMonthlyRow(r, r.ano, ctx.ipcaMap, {
        tipoJuros: ctx.tipoJuros,
        currentYear: ctx.currentYear,
      });
      return {
        ano: r.ano,
        receita_corrente: corrected.acumulado,
        orcado: corrected.orcado,
      };
    }
    return {
      ano: r.ano,
      receita_corrente: (r.acumulado as number) || 0,
      orcado: (r.orcado as number) || 0,
    };
  });
}

// ===== RREO =====

export async function insertRreo(ano: number, bimestre: number, rows: RreoRow[]) {
  await ensureSchema();
  const db = getDb();

  await db.execute({
    sql: "DELETE FROM rreo WHERE exercicio_ano = ? AND bimestre = ?",
    args: [ano, bimestre],
  });

  for (let i = 0; i < rows.length; i += BATCH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(
      chunk.map((r) => ({
        sql: `INSERT INTO rreo (exercicio_ano, bimestre, anexo, linha, coluna, valor, valor_numerico)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [ano, bimestre, r.anexo, r.linha, r.coluna, r.valor, r.valorNumerico],
      })),
      "write",
    );
  }

  return rows.length;
}

export async function getRreoAnexos(ano: number, bimestre: number) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT DISTINCT anexo FROM rreo WHERE exercicio_ano = ? AND bimestre = ? ORDER BY anexo",
    args: [ano, bimestre],
  });
  return result.rows as unknown as { anexo: string }[];
}

export async function getRreoData(ano: number, bimestre: number, anexo: string) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM rreo WHERE exercicio_ano = ? AND bimestre = ? AND anexo = ? ORDER BY linha, coluna",
    args: [ano, bimestre, anexo],
  });
  return result.rows;
}

export async function getRreoBimestresDisponiveis(ano: number) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT DISTINCT bimestre FROM rreo WHERE exercicio_ano = ? ORDER BY bimestre",
    args: [ano],
  });
  return result.rows as unknown as { bimestre: number }[];
}

// ===== RGF =====

export async function insertRgf(ano: number, quadrimestre: number, entidade: string, rows: RgfRow[]) {
  await ensureSchema();
  const db = getDb();

  await db.execute({
    sql: "DELETE FROM rgf WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ?",
    args: [ano, quadrimestre, entidade],
  });

  for (let i = 0; i < rows.length; i += BATCH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(
      chunk.map((r) => ({
        sql: `INSERT INTO rgf (exercicio_ano, quadrimestre, entidade, anexo, linha, coluna, valor, valor_numerico)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [ano, quadrimestre, entidade, r.anexo, r.linha, r.coluna, r.valor, r.valorNumerico],
      })),
      "write",
    );
  }

  return rows.length;
}

export async function getRgfAnexos(ano: number, quadrimestre: number, entidade: string) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT DISTINCT anexo FROM rgf WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ? ORDER BY anexo",
    args: [ano, quadrimestre, entidade],
  });
  return result.rows as unknown as { anexo: string }[];
}

export async function getRgfData(ano: number, quadrimestre: number, entidade: string, anexo: string) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM rgf WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ? AND anexo = ? ORDER BY linha, coluna",
    args: [ano, quadrimestre, entidade, anexo],
  });
  return result.rows;
}

export async function getRgfQuadrimestresDisponiveis(ano: number) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT DISTINCT quadrimestre, entidade FROM rgf WHERE exercicio_ano = ? ORDER BY quadrimestre, entidade",
    args: [ano],
  });
  return result.rows as unknown as { quadrimestre: number; entidade: string }[];
}

// ===== Uploads =====

export async function recordUpload(filename: string, fileType: string, ano: number, periodo?: string) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO uploads (filename, file_type, exercicio_ano, periodo, status)
          VALUES (?, ?, ?, ?, 'processando')`,
    args: [filename, fileType, ano, periodo || null],
  });
  return Number(result.lastInsertRowid);
}

export async function updateUploadStatus(id: number, status: string, registros: number, erro?: string) {
  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: "UPDATE uploads SET status = ?, registros_inseridos = ?, erro_mensagem = ? WHERE id = ?",
    args: [status, registros, erro || null, id],
  });
}

export async function getUploadHistory() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute("SELECT * FROM uploads ORDER BY created_at DESC LIMIT 100");
  return result.rows;
}

// ===== Análise de Receitas =====

export async function getReceitasSummaryByCategory(
  anos: number[],
  ctx?: CorrectionContext | null,
) {
  await ensureSchema();
  const db = getDb();
  if (anos.length === 0) return [];

  const placeholders = anos.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT exercicio_ano, categoria_tributaria,
      SUM(acumulado) as total_arrecadado,
      SUM(orcado) as total_orcado,
      SUM(janeiro) as janeiro, SUM(fevereiro) as fevereiro,
      SUM(marco) as marco, SUM(abril) as abril,
      SUM(maio) as maio, SUM(junho) as junho,
      SUM(julho) as julho, SUM(agosto) as agosto,
      SUM(setembro) as setembro, SUM(outubro) as outubro,
      SUM(novembro) as novembro, SUM(dezembro) as dezembro
    FROM receitas
    WHERE exercicio_ano IN (${placeholders})
      AND is_header = 0
      AND categoria_tributaria IS NOT NULL
    GROUP BY exercicio_ano, categoria_tributaria
    ORDER BY exercicio_ano, total_arrecadado DESC`,
    args: anos,
  });
  const rows = result.rows as unknown as (Record<string, number> & {
    exercicio_ano: number;
    categoria_tributaria: string;
  })[];

  if (!ctx) return rows;

  return rows.map((row) => {
    if (!shouldCorrectYear(row.exercicio_ano, ctx.currentYear)) return row;
    const corrected = correctMonthlyRow(row, row.exercicio_ano, ctx.ipcaMap, {
      tipoJuros: ctx.tipoJuros,
      currentYear: ctx.currentYear,
    });
    return {
      ...row,
      janeiro: corrected.janeiro,
      fevereiro: corrected.fevereiro,
      marco: corrected.marco,
      abril: corrected.abril,
      maio: corrected.maio,
      junho: corrected.junho,
      julho: corrected.julho,
      agosto: corrected.agosto,
      setembro: corrected.setembro,
      outubro: corrected.outubro,
      novembro: corrected.novembro,
      dezembro: corrected.dezembro,
      total_arrecadado: corrected.acumulado,
      total_orcado: correctOrcado(row.total_orcado as number || 0, row.exercicio_ano, ctx.ipcaMap, {
        tipoJuros: ctx.tipoJuros,
        currentYear: ctx.currentYear,
      }),
    };
  });
}

export async function getAvailableYears() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute("SELECT DISTINCT exercicio_ano as ano FROM receitas ORDER BY exercicio_ano DESC");
  return result.rows as unknown as { ano: number }[];
}

// ===== IPCA =====

export interface IpcaRow {
  ano: number;
  mes: number;
  variacao_mensal: number;
  data_referencia: string;
}

export async function upsertIpcaIndices(
  entries: { ano: number; mes: number; variacao: number; dataReferencia: string }[],
) {
  await ensureSchema();
  const db = getDb();
  if (entries.length === 0) return 0;

  for (let i = 0; i < entries.length; i += BATCH_CHUNK_SIZE) {
    const chunk = entries.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(
      chunk.map((e) => ({
        sql: `INSERT INTO ipca_indices (ano, mes, variacao_mensal, data_referencia, updated_at)
              VALUES (?, ?, ?, ?, datetime('now'))
              ON CONFLICT(ano, mes) DO UPDATE SET
                variacao_mensal = excluded.variacao_mensal,
                data_referencia = excluded.data_referencia,
                updated_at = datetime('now')`,
        args: [e.ano, e.mes, e.variacao, e.dataReferencia],
      })),
      "write",
    );
  }
  return entries.length;
}

export async function getAllIpcaIndices(): Promise<IpcaRow[]> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute("SELECT ano, mes, variacao_mensal, data_referencia FROM ipca_indices ORDER BY ano, mes");
  return result.rows as unknown as IpcaRow[];
}

export async function getLatestIpcaEntry() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute(
    "SELECT ano, mes, variacao_mensal, data_referencia, updated_at FROM ipca_indices ORDER BY ano DESC, mes DESC LIMIT 1",
  );
  return result.rows[0] as unknown as
    | { ano: number; mes: number; variacao_mensal: number; data_referencia: string; updated_at: string }
    | undefined;
}

export async function getIpcaCount() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute("SELECT COUNT(*) as c FROM ipca_indices");
  return (result.rows[0] as unknown as { c: number }).c;
}

/**
 * Carrega todos os índices do IPCA em um Map para uso nos cálculos de correção.
 * Chave: "YYYY-M" (ex: "2024-1")
 */
export async function loadIpcaMap(): Promise<Map<string, number>> {
  const rows = await getAllIpcaIndices();
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.ano}-${r.mes}`, r.variacao_mensal);
  }
  return map;
}

// ===== Configurações =====

export async function getConfiguracao(chave: string): Promise<string | null> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT valor FROM configuracoes WHERE chave = ?",
    args: [chave],
  });
  const row = result.rows[0] as unknown as { valor: string } | undefined;
  return row?.valor ?? null;
}

export async function setConfiguracao(chave: string, valor: string, descricao?: string) {
  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO configuracoes (chave, valor, descricao, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(chave) DO UPDATE SET
            valor = excluded.valor,
            descricao = COALESCE(excluded.descricao, configuracoes.descricao),
            updated_at = datetime('now')`,
    args: [chave, valor, descricao || null],
  });
}

export async function getAllConfiguracoes() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute("SELECT chave, valor, descricao, updated_at FROM configuracoes ORDER BY chave");
  return result.rows as unknown as {
    chave: string;
    valor: string;
    descricao: string | null;
    updated_at: string;
  }[];
}
