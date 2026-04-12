import type { InValue } from "@libsql/client";
import { getDb } from "./connection";
import { initializeSchema } from "./schema";
import type { ReceitaRow } from "@/lib/parsers/csv-receitas";
import type { RreoRow } from "@/lib/parsers/xls-rreo";
import type { RgfRow } from "@/lib/parsers/xls-rgf";
import type { DespesaRow } from "@/lib/parsers/csv-despesas";
import type { CorrectionContext } from "@/lib/ipca/context";
import {
  classifyDeducaoSubtipo,
  classifyRevenue,
  deducaoToReceitaCode,
  expandCategoriaFilter,
} from "@/lib/constants/tax-categories";
import {
  type DeducoesContext,
  hasAnySubtipoAtivo,
} from "@/lib/deducoes/context";
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
      (SELECT COUNT(*) FROM despesas WHERE exercicio_ano = e.ano) as total_despesas,
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
      { sql: "DELETE FROM despesas WHERE exercicio_ano = ?", args: [ano] },
      { sql: "DELETE FROM rreo WHERE exercicio_ano = ?", args: [ano] },
      { sql: "DELETE FROM rgf WHERE exercicio_ano = ?", args: [ano] },
      { sql: "DELETE FROM siops_anexo12 WHERE exercicio_ano = ?", args: [ano] },
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
    const cats = expandCategoriaFilter(params.categoria);
    if (cats.length === 1) {
      sql += " AND categoria_tributaria = ?";
      binds.push(cats[0]);
    } else {
      sql += ` AND categoria_tributaria IN (${cats.map(() => "?").join(",")})`;
      binds.push(...cats);
    }
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

// ---------------------------------------------------------------------------
// Deduções (conta 9) — helpers para aplicar "valores líquidos"
// ---------------------------------------------------------------------------

/**
 * Agregado mensal usado tanto para o total absorvido (aplicado nas categorias)
 * quanto para cada bucket de categoria alvo ou para o restante que permanece na
 * rubrica "DEDUCOES".
 */
interface DeducaoBucket {
  acumulado: number;
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
}

interface DeducoesYearImpact {
  /**
   * Map categoria_tributaria → agregado das deduções absorvidas por aquela
   * categoria (subtipo ativo em `deducoesCtx`). Valores são NEGATIVOS, pois
   * as deduções já são armazenadas no banco com sinal negativo.
   */
  porCategoria: Map<string, DeducaoBucket>;
  /** Soma das deduções absorvidas (aplicadas às categorias). */
  absorvido: DeducaoBucket;
  /**
   * Soma das deduções que NÃO foram aplicadas (subtipo desmarcado). Essas
   * permanecem na rubrica `DEDUCOES` do retorno, para o usuário continuar
   * enxergando a rubrica com o "resto".
   */
  restante: DeducaoBucket;
}

function makeBucket(): DeducaoBucket {
  return {
    acumulado: 0,
    orcado: 0,
    janeiro: 0,
    fevereiro: 0,
    marco: 0,
    abril: 0,
    maio: 0,
    junho: 0,
    julho: 0,
    agosto: 0,
    setembro: 0,
    outubro: 0,
    novembro: 0,
    dezembro: 0,
  };
}

function addBucket(target: DeducaoBucket, src: DeducaoBucket): void {
  target.acumulado += src.acumulado;
  target.orcado += src.orcado;
  target.janeiro += src.janeiro;
  target.fevereiro += src.fevereiro;
  target.marco += src.marco;
  target.abril += src.abril;
  target.maio += src.maio;
  target.junho += src.junho;
  target.julho += src.julho;
  target.agosto += src.agosto;
  target.setembro += src.setembro;
  target.outubro += src.outubro;
  target.novembro += src.novembro;
  target.dezembro += src.dezembro;
}

/**
 * Busca as linhas de dedução dos anos solicitados (is_deducao = 1, detalhe
 * apenas) e as agrupa por categoria alvo conforme o contexto de deduções.
 *
 * Retorna um map `ano → DeducoesYearImpact`. Anos sem deduções ativas ficam
 * ausentes do map.
 *
 * - A correção monetária é aplicada linha a linha, usando `correctMonthlyRow`.
 * - Para mapear "dedução → categoria alvo" usamos `deducaoToReceitaCode` +
 *   `classifyRevenue`. Funciona nos três formatos (STN 10d, intermediário 11d
 *   e MCASP 11d/12d).
 * - `classifyDeducaoSubtipo(classificacao, descricao)` define se a linha é
 *   FUNDEB / ABATIMENTO / INTRA / OUTRAS. Se o subtipo não está ativo no
 *   contexto, a linha vai para `restante` (continua em DEDUCOES).
 */
async function computeDeducoesImpact(
  anos: number[],
  deducoesCtx: DeducoesContext,
  ctx?: CorrectionContext | null,
): Promise<Map<number, DeducoesYearImpact>> {
  const out = new Map<number, DeducoesYearImpact>();
  if (anos.length === 0 || !hasAnySubtipoAtivo(deducoesCtx)) return out;

  const db = getDb();
  const placeholders = anos.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT exercicio_ano, classificacao, descricao,
      SUM(janeiro) as janeiro, SUM(fevereiro) as fevereiro,
      SUM(marco) as marco, SUM(abril) as abril,
      SUM(maio) as maio, SUM(junho) as junho,
      SUM(julho) as julho, SUM(agosto) as agosto,
      SUM(setembro) as setembro, SUM(outubro) as outubro,
      SUM(novembro) as novembro, SUM(dezembro) as dezembro,
      SUM(acumulado) as acumulado, SUM(orcado) as orcado
    FROM receitas
    WHERE exercicio_ano IN (${placeholders})
      AND is_header = 0
      AND is_deducao = 1
    GROUP BY exercicio_ano, classificacao, descricao`,
    args: anos,
  });
  const rows = result.rows as unknown as (Record<string, number> & {
    exercicio_ano: number;
    classificacao: string;
    descricao: string | null;
  })[];

  const rowToBucket = (r: (typeof rows)[number]): DeducaoBucket => {
    const applyCorrection = ctx && shouldCorrectYear(r.exercicio_ano, ctx.currentYear);
    if (applyCorrection) {
      const corr = correctMonthlyRow(
        r as unknown as Record<string, unknown>,
        r.exercicio_ano,
        ctx!.ipcaMap,
        { tipoJuros: ctx!.tipoJuros, currentYear: ctx!.currentYear },
      );
      return {
        acumulado: corr.acumulado,
        orcado: corr.orcado,
        janeiro: corr.janeiro,
        fevereiro: corr.fevereiro,
        marco: corr.marco,
        abril: corr.abril,
        maio: corr.maio,
        junho: corr.junho,
        julho: corr.julho,
        agosto: corr.agosto,
        setembro: corr.setembro,
        outubro: corr.outubro,
        novembro: corr.novembro,
        dezembro: corr.dezembro,
      };
    }
    return {
      acumulado: Number(r.acumulado) || 0,
      orcado: Number(r.orcado) || 0,
      janeiro: Number(r.janeiro) || 0,
      fevereiro: Number(r.fevereiro) || 0,
      marco: Number(r.marco) || 0,
      abril: Number(r.abril) || 0,
      maio: Number(r.maio) || 0,
      junho: Number(r.junho) || 0,
      julho: Number(r.julho) || 0,
      agosto: Number(r.agosto) || 0,
      setembro: Number(r.setembro) || 0,
      outubro: Number(r.outubro) || 0,
      novembro: Number(r.novembro) || 0,
      dezembro: Number(r.dezembro) || 0,
    };
  };

  for (const r of rows) {
    let impact = out.get(r.exercicio_ano);
    if (!impact) {
      impact = {
        porCategoria: new Map(),
        absorvido: makeBucket(),
        restante: makeBucket(),
      };
      out.set(r.exercicio_ano, impact);
    }

    const code = String(r.classificacao || "");
    const desc = String(r.descricao || "");
    const subtipo = classifyDeducaoSubtipo(code, desc);
    const enabled = deducoesCtx.subtipos[subtipo] === true;

    const bucket = rowToBucket(r);

    if (!enabled) {
      addBucket(impact.restante, bucket);
      continue;
    }

    const targetCat = classifyRevenue(deducaoToReceitaCode(code));
    let catBucket = impact.porCategoria.get(targetCat);
    if (!catBucket) {
      catBucket = makeBucket();
      impact.porCategoria.set(targetCat, catBucket);
    }
    addBucket(catBucket, bucket);
    addBucket(impact.absorvido, bucket);
  }

  return out;
}

export async function getDashboardSummary(
  ano: number,
  ctx?: CorrectionContext | null,
  deducoesCtx?: DeducoesContext | null,
) {
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

  const byCategory: {
    categoria_tributaria: string;
    total: number;
    orcado_total: number;
  }[] = byCategoryRaw.map((row) => {
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

  let totalOrcado = (rcFinal?.orcado as number) || 0;
  let totalArrecadado = (rcFinal?.acumulado as number) || 0;
  const totalDeducoes = (deducoesFinal?.acumulado as number) || 0;

  // -----------------------------------------------------------------------
  // Aplica deduções por categoria (toggle "valores líquidos").
  // -----------------------------------------------------------------------
  const aplicarDeducoes = hasAnySubtipoAtivo(deducoesCtx);
  if (aplicarDeducoes && deducoesCtx) {
    const impactMap = await computeDeducoesImpact([ano], deducoesCtx, ctx);
    const impact = impactMap.get(ano);
    if (impact) {
      const byCatMap = new Map<string, (typeof byCategory)[number]>();
      for (const c of byCategory) byCatMap.set(c.categoria_tributaria, c);

      for (const [cat, bucket] of impact.porCategoria) {
        let row = byCatMap.get(cat);
        if (!row) {
          row = { categoria_tributaria: cat, total: 0, orcado_total: 0 };
          byCategory.push(row);
          byCatMap.set(cat, row);
        }
        // bucket.acumulado é NEGATIVO (deduções), somar aqui já subtrai.
        row.total += bucket.acumulado;
        row.orcado_total += bucket.orcado;
      }

      // A rubrica DEDUCOES continua exibindo apenas o "restante" (deduções
      // cujo subtipo está desmarcado). Se tudo foi absorvido, zera/remove.
      const dedRow = byCatMap.get("DEDUCOES");
      if (dedRow) {
        dedRow.total = impact.restante.acumulado;
        dedRow.orcado_total = impact.restante.orcado;
      }

      // totalArrecadado/months recebem o absorvido (negativo).
      totalArrecadado += impact.absorvido.acumulado;
      for (let i = 0; i < 12; i++) {
        months[i] += (impact.absorvido as unknown as Record<string, number>)[MONTH_COLS[i]] || 0;
      }
      totalOrcado += impact.absorvido.orcado;
    }
  }

  // Remove linhas residuais de DEDUCOES com total ~ 0 (todas absorvidas).
  const byCategoryFinal = byCategory
    .filter((c) => !(c.categoria_tributaria === "DEDUCOES" && Math.abs(c.total) < 1))
    .sort((a, b) => b.total - a.total);

  return {
    ano,
    totalOrcado,
    totalArrecadado,
    totalDeducoes,
    execucaoOrcamentaria: totalOrcado > 0 ? totalArrecadado / totalOrcado : 0,
    byCategory: byCategoryFinal,
    monthlyTotals: months,
    correcaoAplicada: !!applyCorrection,
    deducoesAplicadas: aplicarDeducoes,
  };
}

export async function getMonthlyComparison(
  ano1: number,
  ano2: number,
  ctx?: CorrectionContext | null,
  deducoesCtx?: DeducoesContext | null,
) {
  await ensureSchema();
  const db = getDb();

  const aplicarDeducoes = hasAnySubtipoAtivo(deducoesCtx);
  const impactMap = aplicarDeducoes && deducoesCtx
    ? await computeDeducoesImpact([ano1, ano2], deducoesCtx, ctx)
    : null;

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

    let months: number[];
    if (ctx && shouldCorrectYear(ano, ctx.currentYear)) {
      const corrected = correctMonthlyRow(row, ano, ctx.ipcaMap, {
        tipoJuros: ctx.tipoJuros,
        currentYear: ctx.currentYear,
      });
      months = MONTH_COLS.map((m) => corrected[m] || 0);
    } else {
      months = MONTH_COLS.map((m) => (row[m] as number) || 0);
    }

    const impact = impactMap?.get(ano);
    if (impact) {
      for (let i = 0; i < 12; i++) {
        months[i] += (impact.absorvido as unknown as Record<string, number>)[MONTH_COLS[i]] || 0;
      }
    }
    return months;
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
  deducoesCtx?: DeducoesContext | null,
) {
  await ensureSchema();
  const db = getDb();
  const cats = expandCategoriaFilter(categoria);
  const catPlaceholders = cats.map(() => "?").join(",");
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
    WHERE exercicio_ano = ? AND categoria_tributaria IN (${catPlaceholders}) AND is_header = 0`,
    args: [ano, ...cats],
  });
  const row = result.rows[0] as unknown as Record<string, number> | undefined;
  if (!row) return undefined;

  let finalRow: Record<string, number>;
  if (ctx && shouldCorrectYear(ano, ctx.currentYear)) {
    finalRow = correctMonthlyRow(row, ano, ctx.ipcaMap, {
      tipoJuros: ctx.tipoJuros,
      currentYear: ctx.currentYear,
    }) as unknown as Record<string, number>;
  } else {
    finalRow = { ...row };
  }

  // Aplica deduções: soma as deduções cujo subtipo está ativo E cuja
  // categoria alvo bate com o filtro solicitado.
  if (hasAnySubtipoAtivo(deducoesCtx) && deducoesCtx) {
    const impactMap = await computeDeducoesImpact([ano], deducoesCtx, ctx);
    const impact = impactMap.get(ano);
    if (impact) {
      const catSet = new Set(cats);
      for (const [cat, bucket] of impact.porCategoria) {
        if (!catSet.has(cat)) continue;
        finalRow.acumulado = (finalRow.acumulado || 0) + bucket.acumulado;
        finalRow.orcado = (finalRow.orcado || 0) + bucket.orcado;
        for (const m of MONTH_COLS) {
          finalRow[m] =
            (finalRow[m] || 0) +
            ((bucket as unknown as Record<string, number>)[m] || 0);
        }
      }
    }
  }

  return finalRow;
}

export async function getYearlyTrend(
  ctx?: CorrectionContext | null,
  deducoesCtx?: DeducoesContext | null,
) {
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

  const base = rows.map((r) => {
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

  if (!hasAnySubtipoAtivo(deducoesCtx) || !deducoesCtx) return base;

  const anos = base.map((b) => b.ano);
  const impactMap = await computeDeducoesImpact(anos, deducoesCtx, ctx);
  return base.map((b) => {
    const impact = impactMap.get(b.ano);
    if (!impact) return b;
    return {
      ano: b.ano,
      receita_corrente: b.receita_corrente + impact.absorvido.acumulado,
      orcado: b.orcado + impact.absorvido.orcado,
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

/**
 * Retorna apenas as linhas-folha de receitas (aquelas com campo `fonte`
 * preenchido — o CSV sinaliza agregadas via `is_header`/fonte vazia).
 * Usado pelo calculador do Anexo 12 para evitar double-counting.
 */
export async function getReceitasFolhasByYear(ano: number) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT classificacao, acumulado,
                 janeiro, fevereiro, marco, abril, maio, junho,
                 julho, agosto, setembro, outubro, novembro, dezembro
          FROM receitas
          WHERE exercicio_ano = ?
            AND is_header = 0
            AND fonte IS NOT NULL
            AND fonte <> ''`,
    args: [ano],
  });
  return result.rows as unknown as {
    classificacao: string;
    acumulado: number;
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
  }[];
}

// ===== Despesas =====

export async function insertDespesas(ano: number, rows: DespesaRow[]) {
  await ensureSchema();
  const db = getDb();

  await db.execute({
    sql: "DELETE FROM despesas WHERE exercicio_ano = ?",
    args: [ano],
  });

  for (let i = 0; i < rows.length; i += BATCH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BATCH_CHUNK_SIZE);
    await db.batch(
      chunk.map((r) => ({
        sql: `INSERT INTO despesas (
          exercicio_ano, ficha, dotacao, uo, funcao, subfuncao, programa,
          acao, natureza_despesa, fonte, especificacao,
          orcado, suplementado, anulado, contingenciado,
          empenhado_periodo, empenhado_acumulado,
          liquidado_periodo, liquidado_acumulado,
          pago_periodo, pago_acumulado,
          saldo_a_empenhar, saldo_a_pagar
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ano,
          r.ficha,
          r.dotacao,
          r.uo,
          r.funcao,
          r.subfuncao,
          r.programa,
          r.acao,
          r.naturezaDespesa,
          r.fonte,
          r.especificacao,
          r.orcado,
          r.suplementado,
          r.anulado,
          r.contingenciado,
          r.empenhadoPeriodo,
          r.empenhadoAcumulado,
          r.liquidadoPeriodo,
          r.liquidadoAcumulado,
          r.pagoPeriodo,
          r.pagoAcumulado,
          r.saldoAEmpenhar,
          r.saldoAPagar,
        ],
      })),
      "write",
    );
  }

  return rows.length;
}

/**
 * Retorna todas as linhas analíticas de despesas de Saúde (função = 10) do
 * exercício informado. Usado pelo calculador do Anexo 12.
 */
export async function getDespesasSaudeByYear(ano: number) {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT subfuncao, fonte,
                 empenhado_acumulado, liquidado_acumulado, pago_acumulado
          FROM despesas
          WHERE exercicio_ano = ? AND funcao = '10'`,
    args: [ano],
  });
  return result.rows as unknown as {
    subfuncao: string;
    fonte: string;
    empenhado_acumulado: number;
    liquidado_acumulado: number;
    pago_acumulado: number;
  }[];
}

/** Conta quantas linhas existem na tabela despesas para um exercício. */
export async function countDespesas(ano: number): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM despesas WHERE exercicio_ano = ?",
    args: [ano],
  });
  const row = result.rows[0] as unknown as { n: number } | undefined;
  return Number(row?.n ?? 0);
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
  deducoesCtx?: DeducoesContext | null,
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
  const rawRows = result.rows as unknown as (Record<string, number> & {
    exercicio_ano: number;
    categoria_tributaria: string;
  })[];

  interface Row {
    exercicio_ano: number;
    categoria_tributaria: string;
    total_arrecadado: number;
    total_orcado: number;
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
  }

  const toRow = (r: (typeof rawRows)[number]): Row => ({
    exercicio_ano: r.exercicio_ano,
    categoria_tributaria: r.categoria_tributaria,
    total_arrecadado: Number(r.total_arrecadado) || 0,
    total_orcado: Number(r.total_orcado) || 0,
    janeiro: Number(r.janeiro) || 0,
    fevereiro: Number(r.fevereiro) || 0,
    marco: Number(r.marco) || 0,
    abril: Number(r.abril) || 0,
    maio: Number(r.maio) || 0,
    junho: Number(r.junho) || 0,
    julho: Number(r.julho) || 0,
    agosto: Number(r.agosto) || 0,
    setembro: Number(r.setembro) || 0,
    outubro: Number(r.outubro) || 0,
    novembro: Number(r.novembro) || 0,
    dezembro: Number(r.dezembro) || 0,
  });

  // 1) Aplica correção monetária (se houver).
  const corrected: Row[] = ctx
    ? rawRows.map((row) => {
        if (!shouldCorrectYear(row.exercicio_ano, ctx.currentYear)) return toRow(row);
        const c = correctMonthlyRow(row, row.exercicio_ano, ctx.ipcaMap, {
          tipoJuros: ctx.tipoJuros,
          currentYear: ctx.currentYear,
        });
        return {
          exercicio_ano: row.exercicio_ano,
          categoria_tributaria: row.categoria_tributaria,
          janeiro: c.janeiro,
          fevereiro: c.fevereiro,
          marco: c.marco,
          abril: c.abril,
          maio: c.maio,
          junho: c.junho,
          julho: c.julho,
          agosto: c.agosto,
          setembro: c.setembro,
          outubro: c.outubro,
          novembro: c.novembro,
          dezembro: c.dezembro,
          total_arrecadado: c.acumulado,
          total_orcado: correctOrcado(
            (row.total_orcado as number) || 0,
            row.exercicio_ano,
            ctx.ipcaMap,
            { tipoJuros: ctx.tipoJuros, currentYear: ctx.currentYear },
          ),
        };
      })
    : rawRows.map(toRow);

  // 2) Aplica deduções por categoria alvo (se solicitado).
  if (!hasAnySubtipoAtivo(deducoesCtx) || !deducoesCtx) return corrected;

  const impactMap = await computeDeducoesImpact(anos, deducoesCtx, ctx);

  // Índice (ano, categoria) → row
  const indexRow = new Map<string, Row>();
  for (const r of corrected) {
    indexRow.set(`${r.exercicio_ano}|${r.categoria_tributaria}`, r);
  }

  const getOrCreate = (ano: number, cat: string): Row => {
    const key = `${ano}|${cat}`;
    const existing = indexRow.get(key);
    if (existing) return existing;
    const r: Row = {
      exercicio_ano: ano,
      categoria_tributaria: cat,
      total_arrecadado: 0,
      total_orcado: 0,
      janeiro: 0,
      fevereiro: 0,
      marco: 0,
      abril: 0,
      maio: 0,
      junho: 0,
      julho: 0,
      agosto: 0,
      setembro: 0,
      outubro: 0,
      novembro: 0,
      dezembro: 0,
    };
    corrected.push(r);
    indexRow.set(key, r);
    return r;
  };

  for (const ano of anos) {
    const impact = impactMap.get(ano);
    if (!impact) continue;

    // Absorvidas: somam nas categorias alvo.
    for (const [cat, bucket] of impact.porCategoria) {
      const target = getOrCreate(ano, cat);
      target.total_arrecadado += bucket.acumulado;
      target.total_orcado += bucket.orcado;
      target.janeiro += bucket.janeiro;
      target.fevereiro += bucket.fevereiro;
      target.marco += bucket.marco;
      target.abril += bucket.abril;
      target.maio += bucket.maio;
      target.junho += bucket.junho;
      target.julho += bucket.julho;
      target.agosto += bucket.agosto;
      target.setembro += bucket.setembro;
      target.outubro += bucket.outubro;
      target.novembro += bucket.novembro;
      target.dezembro += bucket.dezembro;
    }

    // Restante: fica em DEDUCOES (ou remove se ~0).
    const dedKey = `${ano}|DEDUCOES`;
    const dedRow = indexRow.get(dedKey);
    if (dedRow) {
      dedRow.total_arrecadado = impact.restante.acumulado;
      dedRow.total_orcado = impact.restante.orcado;
      dedRow.janeiro = impact.restante.janeiro;
      dedRow.fevereiro = impact.restante.fevereiro;
      dedRow.marco = impact.restante.marco;
      dedRow.abril = impact.restante.abril;
      dedRow.maio = impact.restante.maio;
      dedRow.junho = impact.restante.junho;
      dedRow.julho = impact.restante.julho;
      dedRow.agosto = impact.restante.agosto;
      dedRow.setembro = impact.restante.setembro;
      dedRow.outubro = impact.restante.outubro;
      dedRow.novembro = impact.restante.novembro;
      dedRow.dezembro = impact.restante.dezembro;
    }
  }

  // Remove linhas DEDUCOES com valor ~ 0 após absorção.
  const result2 = corrected.filter(
    (r) =>
      !(r.categoria_tributaria === "DEDUCOES" && Math.abs(r.total_arrecadado) < 1),
  );
  // Mantém ordenação: por ano crescente, depois total desc.
  result2.sort((a, b) => {
    if (a.exercicio_ano !== b.exercicio_ano) return a.exercicio_ano - b.exercicio_ano;
    return b.total_arrecadado - a.total_arrecadado;
  });
  return result2;
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
