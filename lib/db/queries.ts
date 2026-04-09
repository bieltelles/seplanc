import { getDb } from "./connection";
import { initializeSchema } from "./schema";
import type { ReceitaRow } from "@/lib/parsers/csv-receitas";
import type { RreoRow } from "@/lib/parsers/xls-rreo";
import type { RgfRow } from "@/lib/parsers/xls-rgf";

let initialized = false;

function ensureSchema() {
  if (!initialized) {
    initializeSchema();
    initialized = true;
  }
}

// ===== Exercícios =====

export function getExercicios() {
  ensureSchema();
  const db = getDb();
  return db.prepare("SELECT DISTINCT ano FROM exercicios ORDER BY ano DESC").all() as { ano: number }[];
}

export function getExerciciosWithDetails() {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT e.ano, e.tipo, e.status, e.created_at,
      (SELECT COUNT(*) FROM receitas WHERE exercicio_ano = e.ano) as total_receitas,
      (SELECT COUNT(DISTINCT bimestre) FROM rreo WHERE exercicio_ano = e.ano) as total_rreo_bimestres,
      (SELECT COUNT(DISTINCT quadrimestre || '-' || entidade) FROM rgf WHERE exercicio_ano = e.ano) as total_rgf_quadrimestres
    FROM exercicios e
    ORDER BY e.ano DESC
  `).all();
}

export function upsertExercicio(ano: number, tipo: string) {
  ensureSchema();
  const db = getDb();
  db.prepare(`
    INSERT INTO exercicios (ano, tipo) VALUES (?, ?)
    ON CONFLICT(ano, tipo) DO UPDATE SET updated_at = datetime('now')
  `).run(ano, tipo);
}

// ===== Receitas =====

export function insertReceitas(ano: number, rows: ReceitaRow[]) {
  ensureSchema();
  const db = getDb();

  const deleteStmt = db.prepare("DELETE FROM receitas WHERE exercicio_ano = ?");
  const insertStmt = db.prepare(`
    INSERT INTO receitas (
      exercicio_ano, rubrica, fonte, classificacao, descricao,
      is_header, is_deducao, nivel, orcado,
      janeiro, fevereiro, marco, abril, maio, junho,
      julho, agosto, setembro, outubro, novembro, dezembro,
      acumulado, categoria_tributaria
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    deleteStmt.run(ano);
    for (const r of rows) {
      insertStmt.run(
        ano, r.rubrica, r.fonte, r.classificacao, r.descricao,
        r.isHeader ? 1 : 0, r.isDeducao ? 1 : 0, r.nivel, r.orcado,
        r.janeiro, r.fevereiro, r.marco, r.abril, r.maio, r.junho,
        r.julho, r.agosto, r.setembro, r.outubro, r.novembro, r.dezembro,
        r.acumulado, r.categoriaTributaria,
      );
    }
  });

  transaction();
  return rows.length;
}

export function getReceitasByYear(ano: number) {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM receitas WHERE exercicio_ano = ? ORDER BY id
  `).all(ano);
}

export function getReceitasFiltered(params: {
  anos?: number[];
  categoria?: string;
  apenasDetalhes?: boolean;
}) {
  ensureSchema();
  const db = getDb();
  let sql = "SELECT * FROM receitas WHERE 1=1";
  const binds: unknown[] = [];

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
  return db.prepare(sql).all(...binds);
}

// ===== Dashboard Aggregations =====

export function getDashboardSummary(ano: number) {
  ensureSchema();
  const db = getDb();

  // Receita total (first row is RECEITAS CORRENTES, classification 10000000000 or 1000000000)
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN is_header = 0 AND is_deducao = 0 THEN orcado ELSE 0 END) as total_orcado,
      SUM(CASE WHEN is_header = 0 AND is_deducao = 0 THEN acumulado ELSE 0 END) as total_arrecadado,
      SUM(CASE WHEN is_header = 0 AND is_deducao = 1 THEN acumulado ELSE 0 END) as total_deducoes
    FROM receitas WHERE exercicio_ano = ? AND is_header = 0
  `).get(ano) as { total_orcado: number; total_arrecadado: number; total_deducoes: number } | undefined;

  // Top-level aggregate from header rows
  const receitasCorrentes = db.prepare(`
    SELECT orcado, acumulado,
      janeiro, fevereiro, marco, abril, maio, junho,
      julho, agosto, setembro, outubro, novembro, dezembro
    FROM receitas
    WHERE exercicio_ano = ? AND (classificacao = '10000000000' OR classificacao = '1000000000')
    LIMIT 1
  `).get(ano) as Record<string, number> | undefined;

  // By category
  const byCategory = db.prepare(`
    SELECT categoria_tributaria,
      SUM(acumulado) as total,
      SUM(orcado) as orcado_total
    FROM receitas
    WHERE exercicio_ano = ? AND is_header = 0 AND categoria_tributaria != 'OUTROS'
    GROUP BY categoria_tributaria
    ORDER BY total DESC
  `).all(ano) as { categoria_tributaria: string; total: number; orcado_total: number }[];

  // Monthly totals from the top-level header
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

export function getMonthlyComparison(ano1: number, ano2: number) {
  ensureSchema();
  const db = getDb();
  const monthCols = [
    "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];

  const getMonthly = (ano: number) => {
    const row = db.prepare(`
      SELECT janeiro, fevereiro, marco, abril, maio, junho,
             julho, agosto, setembro, outubro, novembro, dezembro
      FROM receitas
      WHERE exercicio_ano = ? AND (classificacao = '10000000000' OR classificacao = '1000000000')
      LIMIT 1
    `).get(ano) as Record<string, number> | undefined;

    return monthCols.map((m) => row?.[m] || 0);
  };

  return {
    ano1: { ano: ano1, months: getMonthly(ano1) },
    ano2: { ano: ano2, months: getMonthly(ano2) },
  };
}

export function getCategoryByMonth(ano: number, categoria: string) {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT
      SUM(janeiro) as janeiro, SUM(fevereiro) as fevereiro,
      SUM(marco) as marco, SUM(abril) as abril,
      SUM(maio) as maio, SUM(junho) as junho,
      SUM(julho) as julho, SUM(agosto) as agosto,
      SUM(setembro) as setembro, SUM(outubro) as outubro,
      SUM(novembro) as novembro, SUM(dezembro) as dezembro,
      SUM(acumulado) as acumulado, SUM(orcado) as orcado
    FROM receitas
    WHERE exercicio_ano = ? AND categoria_tributaria = ? AND is_header = 0
  `).get(ano, categoria);
}

export function getYearlyTrend() {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT exercicio_ano as ano,
      MAX(CASE WHEN classificacao IN ('10000000000', '1000000000') THEN acumulado END) as receita_corrente,
      MAX(CASE WHEN classificacao IN ('10000000000', '1000000000') THEN orcado END) as orcado
    FROM receitas
    GROUP BY exercicio_ano
    ORDER BY exercicio_ano
  `).all() as { ano: number; receita_corrente: number; orcado: number }[];
}

// ===== RREO =====

export function insertRreo(ano: number, bimestre: number, rows: RreoRow[]) {
  ensureSchema();
  const db = getDb();
  const deleteStmt = db.prepare("DELETE FROM rreo WHERE exercicio_ano = ? AND bimestre = ?");
  const insertStmt = db.prepare(`
    INSERT INTO rreo (exercicio_ano, bimestre, anexo, linha, coluna, valor, valor_numerico)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    deleteStmt.run(ano, bimestre);
    for (const r of rows) {
      insertStmt.run(ano, bimestre, r.anexo, r.linha, r.coluna, r.valor, r.valorNumerico);
    }
  });
  transaction();
  return rows.length;
}

export function getRreoAnexos(ano: number, bimestre: number) {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT anexo FROM rreo WHERE exercicio_ano = ? AND bimestre = ? ORDER BY anexo
  `).all(ano, bimestre) as { anexo: string }[];
}

export function getRreoData(ano: number, bimestre: number, anexo: string) {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM rreo WHERE exercicio_ano = ? AND bimestre = ? AND anexo = ? ORDER BY linha, coluna
  `).all(ano, bimestre, anexo);
}

export function getRreoBimestresDisponiveis(ano: number) {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT bimestre FROM rreo WHERE exercicio_ano = ? ORDER BY bimestre
  `).all(ano) as { bimestre: number }[];
}

// ===== RGF =====

export function insertRgf(ano: number, quadrimestre: number, entidade: string, rows: RgfRow[]) {
  ensureSchema();
  const db = getDb();
  const deleteStmt = db.prepare("DELETE FROM rgf WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ?");
  const insertStmt = db.prepare(`
    INSERT INTO rgf (exercicio_ano, quadrimestre, entidade, anexo, linha, coluna, valor, valor_numerico)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    deleteStmt.run(ano, quadrimestre, entidade);
    for (const r of rows) {
      insertStmt.run(ano, quadrimestre, entidade, r.anexo, r.linha, r.coluna, r.valor, r.valorNumerico);
    }
  });
  transaction();
  return rows.length;
}

export function getRgfAnexos(ano: number, quadrimestre: number, entidade: string) {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT anexo FROM rgf WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ? ORDER BY anexo
  `).all(ano, quadrimestre, entidade) as { anexo: string }[];
}

export function getRgfData(ano: number, quadrimestre: number, entidade: string, anexo: string) {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM rgf WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ? AND anexo = ? ORDER BY linha, coluna
  `).all(ano, quadrimestre, entidade, anexo);
}

export function getRgfQuadrimestresDisponiveis(ano: number) {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT quadrimestre, entidade FROM rgf WHERE exercicio_ano = ? ORDER BY quadrimestre, entidade
  `).all(ano) as { quadrimestre: number; entidade: string }[];
}

// ===== Uploads =====

export function recordUpload(filename: string, fileType: string, ano: number, periodo?: string) {
  ensureSchema();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO uploads (filename, file_type, exercicio_ano, periodo, status)
    VALUES (?, ?, ?, ?, 'processando')
  `).run(filename, fileType, ano, periodo || null);
  return result.lastInsertRowid as number;
}

export function updateUploadStatus(id: number, status: string, registros: number, erro?: string) {
  ensureSchema();
  const db = getDb();
  db.prepare(`
    UPDATE uploads SET status = ?, registros_inseridos = ?, erro_mensagem = ? WHERE id = ?
  `).run(status, registros, erro || null, id);
}

export function getUploadHistory() {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT * FROM uploads ORDER BY created_at DESC LIMIT 100
  `).all();
}

// ===== Análise de Receitas =====

export function getReceitasSummaryByCategory(anos: number[]) {
  ensureSchema();
  const db = getDb();
  if (anos.length === 0) return [];

  const placeholders = anos.map(() => "?").join(",");
  return db.prepare(`
    SELECT exercicio_ano, categoria_tributaria,
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
    ORDER BY exercicio_ano, total_arrecadado DESC
  `).all(...anos);
}

export function getAvailableYears() {
  ensureSchema();
  const db = getDb();
  return db.prepare(`
    SELECT DISTINCT exercicio_ano as ano FROM receitas ORDER BY exercicio_ano DESC
  `).all() as { ano: number }[];
}
