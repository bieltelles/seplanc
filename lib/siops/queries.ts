/**
 * Queries de persistência para o SIOPS Anexo 12.
 */

import { getDb } from "@/lib/db/connection";
import type { SiopsAnexo12, SiopsUpsertResult } from "./types";

/**
 * Insere ou atualiza um registro do Anexo 12 no Turso.
 * A chave única é (exercicio_ano, bimestre, cod_ibge).
 */
export async function upsertSiopsAnexo12(
  data: SiopsAnexo12,
): Promise<SiopsUpsertResult> {
  const db = getDb();

  // Verifica se já existe
  const existing = await db.execute({
    sql: `SELECT id, data_homologacao FROM siops_anexo12
          WHERE exercicio_ano = ? AND bimestre = ? AND cod_ibge = ?`,
    args: [data.exercicioAno, data.bimestre, data.codIbge],
  });

  const row = existing.rows[0] as unknown as
    | { id: number; data_homologacao: string | null }
    | undefined;

  const dadosCompletos = JSON.stringify({
    receitas: data.receitas,
    despesasProprias: data.despesasProprias,
    apuracao: data.apuracao,
    receitasAdicionais: data.receitasAdicionais,
    despesasNaoComputadas: data.despesasNaoComputadas,
    despesasTotais: data.despesasTotais,
  });

  const values = [
    data.exercicioAno,
    data.bimestre,
    data.codIbge,
    data.ufSigla,
    data.municipio,
    data.dataHomologacao,
    data.receitas.impostos,
    data.receitas.transferencias,
    data.receitas.total,
    data.apuracao.totalDespesasAsps.empenhada,
    data.apuracao.totalDespesasAsps.liquidada,
    data.apuracao.totalDespesasAsps.paga,
    data.apuracao.valorAplicado.empenhada,
    data.apuracao.valorAplicado.liquidada,
    data.apuracao.valorAplicado.paga,
    data.apuracao.despesaMinima,
    data.apuracao.percentualAplicado.empenhada,
    data.apuracao.percentualAplicado.liquidada,
    data.apuracao.percentualAplicado.paga,
    data.receitasAdicionais.provenientesUniao,
    data.receitasAdicionais.provenientesEstados,
    data.receitasAdicionais.total,
    data.despesasTotais.totalSaude.empenhada,
    data.despesasTotais.totalSaude.liquidada,
    data.despesasTotais.totalProprios.empenhada,
    data.despesasTotais.totalProprios.liquidada,
    dadosCompletos,
  ];

  if (row) {
    // Se a data de homologação é a mesma, não precisa atualizar
    if (row.data_homologacao === data.dataHomologacao) {
      return {
        success: true,
        action: "unchanged",
        exercicioAno: data.exercicioAno,
        bimestre: data.bimestre,
        codIbge: data.codIbge,
      };
    }

    await db.execute({
      sql: `UPDATE siops_anexo12 SET
        uf = ?, municipio = ?, data_homologacao = ?,
        receita_impostos = ?, receita_transferencias = ?, total_receitas = ?,
        despesa_asps_empenhada = ?, despesa_asps_liquidada = ?, despesa_asps_paga = ?,
        valor_aplicado_empenhada = ?, valor_aplicado_liquidada = ?, valor_aplicado_paga = ?,
        despesa_minima = ?,
        percentual_aplicado_empenhada = ?, percentual_aplicado_liquidada = ?, percentual_aplicado_paga = ?,
        transf_saude_uniao = ?, transf_saude_estados = ?, total_receitas_adicionais = ?,
        total_despesas_saude_empenhada = ?, total_despesas_saude_liquidada = ?,
        total_despesas_proprios_empenhada = ?, total_despesas_proprios_liquidada = ?,
        dados_completos = ?,
        updated_at = datetime('now')
      WHERE exercicio_ano = ? AND bimestre = ? AND cod_ibge = ?`,
      args: [
        ...values.slice(3), // skip ano, bim, cod_ibge (already in WHERE)
        data.exercicioAno,
        data.bimestre,
        data.codIbge,
      ],
    });

    return {
      success: true,
      action: "updated",
      exercicioAno: data.exercicioAno,
      bimestre: data.bimestre,
      codIbge: data.codIbge,
    };
  }

  await db.execute({
    sql: `INSERT INTO siops_anexo12 (
      exercicio_ano, bimestre, cod_ibge, uf, municipio, data_homologacao,
      receita_impostos, receita_transferencias, total_receitas,
      despesa_asps_empenhada, despesa_asps_liquidada, despesa_asps_paga,
      valor_aplicado_empenhada, valor_aplicado_liquidada, valor_aplicado_paga,
      despesa_minima,
      percentual_aplicado_empenhada, percentual_aplicado_liquidada, percentual_aplicado_paga,
      transf_saude_uniao, transf_saude_estados, total_receitas_adicionais,
      total_despesas_saude_empenhada, total_despesas_saude_liquidada,
      total_despesas_proprios_empenhada, total_despesas_proprios_liquidada,
      dados_completos
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: values,
  });

  return {
    success: true,
    action: "inserted",
    exercicioAno: data.exercicioAno,
    bimestre: data.bimestre,
    codIbge: data.codIbge,
  };
}

/**
 * Busca o registro do Anexo 12 para um município/ano/bimestre.
 */
export async function getSiopsAnexo12(
  ano: number,
  bimestre: number,
  codIbge: string,
) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM siops_anexo12
          WHERE exercicio_ano = ? AND bimestre = ? AND cod_ibge = ?`,
    args: [ano, bimestre, codIbge],
  });
  return result.rows[0] || null;
}

/**
 * Busca o último bimestre disponível para um município/ano.
 */
export async function getLatestSiopsBimestre(
  ano: number,
  codIbge: string,
): Promise<number | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT MAX(bimestre) as b FROM siops_anexo12
          WHERE exercicio_ano = ? AND cod_ibge = ?`,
    args: [ano, codIbge],
  });
  const row = result.rows[0] as unknown as { b: number | null } | undefined;
  return row?.b ?? null;
}

/**
 * Lista todos os registros SIOPS disponíveis para um município.
 */
export async function listSiopsRegistros(codIbge: string) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT exercicio_ano, bimestre, data_homologacao,
            percentual_aplicado_liquidada, total_receitas, valor_aplicado_liquidada,
            updated_at
          FROM siops_anexo12
          WHERE cod_ibge = ?
          ORDER BY exercicio_ano DESC, bimestre DESC`,
    args: [codIbge],
  });
  return result.rows;
}
