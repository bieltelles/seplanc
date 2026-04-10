/**
 * Helpers para buscar valores específicos em anexos do RREO persistidos
 * como (anexo, linha, coluna=col_N, valor_numerico).
 *
 * Os índices (linha, col) são derivados do layout SICONFI v13. A aba "RREO-
 * Anexo 01" (Balanço Orçamentário) tem linhas estáveis para Receitas
 * Correntes, Capital, Intra, Subtotal, Despesas, etc. O Anexo 03 tem a RCL
 * na linha 48 col_13 (total 12 meses).
 */

import { getDb } from "@/lib/db/connection";

type RreoRow = {
  anexo: string;
  linha: number;
  coluna: string;
  valor_numerico: number | null;
};

/** Busca todas as linhas de um anexo RREO de um bimestre específico. */
export async function fetchRreoAnexoAllRows(
  ano: number,
  bimestre: number,
  anexo: string,
): Promise<RreoRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT anexo, linha, coluna, valor_numerico
          FROM rreo
          WHERE exercicio_ano = ? AND bimestre = ? AND anexo = ?
          ORDER BY linha, coluna`,
    args: [ano, bimestre, anexo],
  });
  return result.rows as unknown as RreoRow[];
}

/**
 * Busca um único valor numérico em uma linha/coluna específica.
 * Retorna null se não encontrado.
 */
export async function fetchRreoCell(
  ano: number,
  bimestre: number,
  anexo: string,
  linha: number,
  colunaIdx: number,
): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT valor_numerico FROM rreo
          WHERE exercicio_ano = ? AND bimestre = ? AND anexo = ?
            AND linha = ? AND coluna = ?`,
    args: [ano, bimestre, anexo, linha, `col_${colunaIdx}`],
  });
  const row = result.rows[0] as unknown as { valor_numerico: number | null } | undefined;
  return row?.valor_numerico ?? null;
}

/**
 * Monta um mapa { colunaIdx => valor } para uma linha, facilitando o acesso.
 */
export async function fetchRreoRowCols(
  ano: number,
  bimestre: number,
  anexo: string,
  linha: number,
): Promise<Record<number, number>> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT coluna, valor_numerico FROM rreo
          WHERE exercicio_ano = ? AND bimestre = ? AND anexo = ? AND linha = ?`,
    args: [ano, bimestre, anexo, linha],
  });
  const map: Record<number, number> = {};
  for (const r of result.rows as unknown as { coluna: string; valor_numerico: number | null }[]) {
    const m = r.coluna.match(/^col_(\d+)$/);
    if (m && r.valor_numerico != null) {
      map[Number(m[1])] = r.valor_numerico;
    }
  }
  return map;
}

/**
 * Descobre o último bimestre disponível no banco para um ano.
 */
export async function getLatestBimestre(ano: number): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT MAX(bimestre) as b FROM rreo WHERE exercicio_ano = ?",
    args: [ano],
  });
  const row = result.rows[0] as unknown as { b: number | null };
  return row?.b ?? null;
}

// ================================================================
// Layout conhecido - RREO v13 SICONFI
// ================================================================

/**
 * Descobre dinamicamente a linha de uma rubrica no Anexo 01 (Balanço).
 * Procura pelo rótulo textual dentro do anexo retornando a primeira
 * ocorrência. Mais robusto que hard-coding de linhas.
 */
export async function findRreoAnexo01Linha(
  ano: number,
  bimestre: number,
  rotuloLike: string,
): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT linha FROM rreo
          WHERE exercicio_ano = ? AND bimestre = ? AND anexo = 'RREO-Anexo 01'
            AND coluna = 'col_0' AND UPPER(valor) LIKE UPPER(?)
          ORDER BY linha LIMIT 1`,
    args: [ano, bimestre, `%${rotuloLike}%`],
  });
  const row = result.rows[0] as unknown as { linha: number } | undefined;
  return row?.linha ?? null;
}

/**
 * Variação: busca linha em qualquer anexo pelo rótulo.
 */
export async function findRreoLinha(
  ano: number,
  bimestre: number,
  anexo: string,
  rotuloLike: string,
): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT linha FROM rreo
          WHERE exercicio_ano = ? AND bimestre = ? AND anexo = ?
            AND coluna = 'col_0' AND UPPER(valor) LIKE UPPER(?)
          ORDER BY linha LIMIT 1`,
    args: [ano, bimestre, anexo, `%${rotuloLike}%`],
  });
  const row = result.rows[0] as unknown as { linha: number } | undefined;
  return row?.linha ?? null;
}
