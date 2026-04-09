import type { InValue } from "@libsql/client";
import { getDb } from "./connection";
import { initializeSchema } from "./schema";
import type { ReceitaRow } from "@/lib/parsers/csv-receitas";
import type { RreoRow } from "@/lib/parsers/xls-rreo";
import type { RgfRow } from "@/lib/parsers/xls-rgf";

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

export async function getReceitasFiltered(params: {
  anos?: number[];
  categoria?: string;
  apenasDetalhes?: boolean;
}) {
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
  return result.rows;
}

// ===== Dashboard Aggregations =====

export async function getDashboardSummary(ano: number) {
  await ensureSchema();
  const db = getDb();

  const totalsResult = await db.execute({
    sql: `SELECT
      SUM(CASE WHEN is_header = 0 AND is_deducao = 0 THEN orcado ELSE 0 END) as total_orcado,
      SUM(CASE WHEN is_header = 0 AND is_deducao = 0 THEN acumulado ELSE 0 END) as total_arrecadado,
      SUM(CASE WHEN is_header = 0 AND is_deducao = 1 THEN acumulado ELSE 0 END) as total_deducoes
    FROM receitas WHERE exercicio_ano = ? AND is_header = 0`,
    args: [ano],
  });
  const totals = totalsResult.rows[0] as unknown as {
    total_orcado: number; total_arrecadado: number; total_deducoes: number;
  } | undefined;

  const rcResult = await db.execute({
    sql: `SELECT orcado, acumulado,
      janeiro, fevereiro, marco, abril, maio, junho,
      julho, agosto, setembro, outubro, novembro, dezembro
    FROM receitas
    WHERE exercicio_ano = ? AND (classificacao = '10000000000' OR classificacao = '1000000000')
    LIMIT 1`,
    args: [ano],
  });
  const receitasCorrentes = rcResult.rows[0] as unknown as Record<string, number> | undefined;

  const catResult = await db.execute({
    sql: `SELECT categoria_tributaria,
      SUM(acumulado) as total,
      SUM(orcado) as orcado_total
    FROM receitas
    WHERE exercicio_ano = ? AND is_header = 0 AND categoria_tributaria != 'OUTROS'
    GROUP BY categoria_tributaria
    ORDER BY total DESC`,
    args: [ano],
  });
  const byCategory = catResult.rows as unknown as {
    categoria_tributaria: string; total: number; orcado_total: number;
  }[];

  const months = receitasCorrentes ? [
    receitasCorrentes.janeiro, receitasCorrentes.fevereiro, receitasCorrentes.marco,
    receitasCorrentes.abril, receitasCorrentes.maio, receitasCorrentes.junho,
    receitasCorrentes.julho, receitasCorrentes.agosto, receitasCorrentes.setembro,
    receitasCorrentes.outubro, receitasCorrentes.novembro, receitasCorrentes.dezembro,
  ] : [];

  return {
    ano,
    totalOrcado: receitasCorrentes?.orcado || totals?.total_orcado || 0,
    totalArrecadado: receitasCorrentes?.acumulado || totals?.total_arrecadado || 0,
    totalDeducoes: totals?.total_deducoes || 0,
    execucaoOrcamentaria: receitasCorrentes
      ? (receitasCorrentes.orcado > 0 ? receitasCorrentes.acumulado / receitasCorrentes.orcado : 0)
      : 0,
    byCategory,
    monthlyTotals: months,
  };
}

export async function getMonthlyComparison(ano1: number, ano2: number) {
  await ensureSchema();
  const db = getDb();
  const monthCols = [
    "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];

  const getMonthly = async (ano: number) => {
    const result = await db.execute({
      sql: `SELECT janeiro, fevereiro, marco, abril, maio, junho,
             julho, agosto, setembro, outubro, novembro, dezembro
      FROM receitas
      WHERE exercicio_ano = ? AND (classificacao = '10000000000' OR classificacao = '1000000000')
      LIMIT 1`,
      args: [ano],
    });
    const row = result.rows[0] as unknown as Record<string, number> | undefined;
    return monthCols.map((m) => (row?.[m] as number) || 0);
  };

  return {
    ano1: { ano: ano1, months: await getMonthly(ano1) },
    ano2: { ano: ano2, months: await getMonthly(ano2) },
  };
}

export async function getCategoryByMonth(ano: number, categoria: string) {
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
  return result.rows[0];
}

export async function getYearlyTrend() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute(`
    SELECT exercicio_ano as ano,
      MAX(CASE WHEN classificacao IN ('10000000000', '1000000000') THEN acumulado END) as receita_corrente,
      MAX(CASE WHEN classificacao IN ('10000000000', '1000000000') THEN orcado END) as orcado
    FROM receitas
    GROUP BY exercicio_ano
    ORDER BY exercicio_ano
  `);
  return result.rows as unknown as { ano: number; receita_corrente: number; orcado: number }[];
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

export async function getReceitasSummaryByCategory(anos: number[]) {
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
  return result.rows;
}

export async function getAvailableYears() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute("SELECT DISTINCT exercicio_ano as ano FROM receitas ORDER BY exercicio_ano DESC");
  return result.rows as unknown as { ano: number }[];
}
