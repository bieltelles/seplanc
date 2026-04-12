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

    // Balancete de Despesa Geral — linhas analíticas com Dotacao completa
    // (UO + FFSSSPPPPT + ação + natureza + fonte). Usada como base para o
    // cálculo do Anexo 12 (Saúde, LC 141/2012): função=10 isola as despesas
    // de saúde e fonte=1500001002 identifica as computadas no mínimo (XI).
    `CREATE TABLE IF NOT EXISTS despesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercicio_ano INTEGER NOT NULL,
      ficha INTEGER,
      dotacao TEXT NOT NULL,
      uo TEXT,
      funcao TEXT,
      subfuncao TEXT,
      programa TEXT,
      acao TEXT,
      natureza_despesa TEXT,
      fonte TEXT,
      especificacao TEXT,
      orcado REAL DEFAULT 0,
      suplementado REAL DEFAULT 0,
      anulado REAL DEFAULT 0,
      contingenciado REAL DEFAULT 0,
      empenhado_periodo REAL DEFAULT 0,
      empenhado_acumulado REAL DEFAULT 0,
      liquidado_periodo REAL DEFAULT 0,
      liquidado_acumulado REAL DEFAULT 0,
      pago_periodo REAL DEFAULT 0,
      pago_acumulado REAL DEFAULT 0,
      saldo_a_empenhar REAL DEFAULT 0,
      saldo_a_pagar REAL DEFAULT 0
    )`,

    `CREATE INDEX IF NOT EXISTS idx_despesas_ano ON despesas(exercicio_ano)`,
    `CREATE INDEX IF NOT EXISTS idx_despesas_funcao ON despesas(exercicio_ano, funcao)`,
    `CREATE INDEX IF NOT EXISTS idx_despesas_fonte ON despesas(exercicio_ano, fonte)`,

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

    `CREATE TABLE IF NOT EXISTS ipca_indices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      variacao_mensal REAL NOT NULL,
      data_referencia TEXT NOT NULL,
      fonte TEXT DEFAULT 'BCB-SGS-433',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(ano, mes)
    )`,

    `CREATE INDEX IF NOT EXISTS idx_ipca_ano_mes ON ipca_indices(ano, mes)`,

    `CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      descricao TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // SIOPS Anexo 12 — Demonstrativo ASPS (Saúde)
    `CREATE TABLE IF NOT EXISTS siops_anexo12 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercicio_ano INTEGER NOT NULL,
      bimestre INTEGER NOT NULL,
      cod_ibge TEXT NOT NULL,
      uf TEXT NOT NULL,
      municipio TEXT NOT NULL,
      data_homologacao TEXT,

      -- Receitas (base para cálculo do mínimo 15%)
      receita_impostos REAL DEFAULT 0,
      receita_transferencias REAL DEFAULT 0,
      total_receitas REAL DEFAULT 0,

      -- Apuração do cumprimento do mínimo (LC 141/2012)
      despesa_asps_empenhada REAL DEFAULT 0,
      despesa_asps_liquidada REAL DEFAULT 0,
      despesa_asps_paga REAL DEFAULT 0,
      valor_aplicado_empenhada REAL DEFAULT 0,
      valor_aplicado_liquidada REAL DEFAULT 0,
      valor_aplicado_paga REAL DEFAULT 0,
      despesa_minima REAL DEFAULT 0,
      percentual_aplicado_empenhada REAL DEFAULT 0,
      percentual_aplicado_liquidada REAL DEFAULT 0,
      percentual_aplicado_paga REAL DEFAULT 0,

      -- Receitas adicionais (transferências SUS)
      transf_saude_uniao REAL DEFAULT 0,
      transf_saude_estados REAL DEFAULT 0,
      total_receitas_adicionais REAL DEFAULT 0,

      -- Despesas totais
      total_despesas_saude_empenhada REAL DEFAULT 0,
      total_despesas_saude_liquidada REAL DEFAULT 0,
      total_despesas_proprios_empenhada REAL DEFAULT 0,
      total_despesas_proprios_liquidada REAL DEFAULT 0,

      -- Blob JSON com dados completos para detalhamento
      dados_completos TEXT,

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(exercicio_ano, bimestre, cod_ibge)
    )`,

    `CREATE INDEX IF NOT EXISTS idx_siops_ano_bim ON siops_anexo12(exercicio_ano, bimestre)`,
    `CREATE INDEX IF NOT EXISTS idx_siops_ibge ON siops_anexo12(cod_ibge)`,
  ];

  for (const sql of statements) {
    await db.execute(sql);
  }
}
