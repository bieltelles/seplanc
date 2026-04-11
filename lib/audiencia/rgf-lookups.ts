/**
 * Helpers análogos para o RGF. O RGF é persistido com a chave extra
 * `entidade` ('prefeitura' ou 'camara') — ver lib/parsers/detect-file-type.ts.
 */

import { getDb } from "@/lib/db/connection";

type RgfRow = {
  anexo: string;
  linha: number;
  coluna: string;
  valor_numerico: number | null;
};

export async function fetchRgfAnexoAllRows(
  ano: number,
  quadrimestre: number,
  entidade: string,
  anexo: string,
): Promise<RgfRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT anexo, linha, coluna, valor_numerico
          FROM rgf
          WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ? AND anexo = ?
          ORDER BY linha, coluna`,
    args: [ano, quadrimestre, entidade, anexo],
  });
  return result.rows as unknown as RgfRow[];
}

export async function fetchRgfRowCols(
  ano: number,
  quadrimestre: number,
  entidade: string,
  anexo: string,
  linha: number,
): Promise<Record<number, number>> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT coluna, valor_numerico FROM rgf
          WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ? AND anexo = ? AND linha = ?`,
    args: [ano, quadrimestre, entidade, anexo, linha],
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

export async function findRgfLinha(
  ano: number,
  quadrimestre: number,
  entidade: string,
  anexo: string,
  rotuloLike: string,
): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT linha FROM rgf
          WHERE exercicio_ano = ? AND quadrimestre = ? AND entidade = ? AND anexo = ?
            AND coluna = 'col_0' AND UPPER(valor) LIKE UPPER(?)
          ORDER BY linha LIMIT 1`,
    args: [ano, quadrimestre, entidade, anexo, `%${rotuloLike}%`],
  });
  const row = result.rows[0] as unknown as { linha: number } | undefined;
  return row?.linha ?? null;
}

export async function getLatestQuadrimestre(
  ano: number,
  entidade: string = "prefeitura",
): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT MAX(quadrimestre) as q FROM rgf WHERE exercicio_ano = ? AND entidade = ?",
    args: [ano, entidade],
  });
  const row = result.rows[0] as unknown as { q: number | null };
  return row?.q ?? null;
}
