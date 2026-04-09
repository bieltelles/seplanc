import { getDb } from "./connection";

export async function initializeSchema() {
  const db = getDb();

  const statements = [
    `CREATE TABLE IF NOT EXISTS exercicios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ano INTEGER NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'receita',
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ano, tipo)
    )`,

    `CREATE TABLE IF NOT EXISTS receitas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercicio_ano INTEGER NOT NULL,
      rubrica TEXT,
      fonte TEXT,
      classificacao TEXT NOT NULL,
      descricao TEXT NOT NULL,
      is_header INTEGER DEFAULT 0,
      is_deducao INTEGER DEFAULT 0,
      nivel INTEGER DEFAULT 0,
      orcado REAL DEFAULT 0,
      janeiro REAL DEFAULT 0,
      fevereiro REAL DEFAULT 0,
      marco REAL DEFAULT 0,
      abril REAL DEFAULT 0,
      maio REAL DEFAULT 0,
      junho REAL DEFAULT 0,
      julho REAL DEFAULT 0,
      agosto REAL DEFAULT 0,
      setembro REAL DEFAULT 0,
      outubro REAL DEFAULT 0,
      novembro REAL DEFAULT 0,
      dezembro REAL DEFAULT 0,
      acumulado REAL DEFAULT 0,
      categoria_tributaria TEXT
    )`,

    `CREATE INDEX IF NOT EXISTS idx_receitas_ano ON receitas(exercicio_ano)`,
    `CREATE INDEX IF NOT EXISTS idx_receitas_classificacao ON receitas(classificacao)`,
    `CREATE INDEX IF NOT EXISTS idx_receitas_categoria ON receitas(categoria_tributaria)`,
    `CREATE INDEX IF NOT EXISTS idx_receitas_header ON receitas(is_header)`,

    `CREATE TABLE IF NOT EXISTS rreo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercicio_ano INTEGER NOT NULL,
      bimestre INTEGER NOT NULL,
      anexo TEXT NOT NULL,
      linha INTEGER,
      coluna TEXT,
      valor TEXT,
      valor_numerico REAL
    )`,

    `CREATE INDEX IF NOT EXISTS idx_rreo_ano_bim ON rreo(exercicio_ano, bimestre)`,
    `CREATE INDEX IF NOT EXISTS idx_rreo_anexo ON rreo(anexo)`,

    `CREATE TABLE IF NOT EXISTS rgf (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercicio_ano INTEGER NOT NULL,
      quadrimestre INTEGER NOT NULL,
      entidade TEXT NOT NULL,
      anexo TEXT NOT NULL,
      linha INTEGER,
      coluna TEXT,
      valor TEXT,
      valor_numerico REAL
    )`,

    `CREATE INDEX IF NOT EXISTS idx_rgf_ano_quad ON rgf(exercicio_ano, quadrimestre)`,
    `CREATE INDEX IF NOT EXISTS idx_rgf_entidade ON rgf(entidade)`,

    `CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      exercicio_ano INTEGER NOT NULL,
      periodo TEXT,
      status TEXT DEFAULT 'processando',
      registros_inseridos INTEGER DEFAULT 0,
      erro_mensagem TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ];

  for (const sql of statements) {
    await db.execute(sql);
  }
}
