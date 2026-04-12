import { NextRequest, NextResponse } from "next/server";
import { getSiopsAnexo12, getLatestSiopsBimestre, listSiopsRegistros } from "@/lib/siops/queries";
import { initializeSchema } from "@/lib/db/schema";
import { getConfiguracao } from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * GET /api/indicadores/saude
 *
 * Retorna dados do indicador de saúde (SIOPS Anexo 12) para exibição
 * na página de Indicadores.
 *
 * Query params opcionais:
 *   ano=YYYY     — exercício (default: ano atual)
 *   bimestre=N   — bimestre (default: último disponível)
 *   cod_ibge=... — município (default: 211130 = São Luís)
 */
export async function GET(request: NextRequest) {
  try {
    await initializeSchema();

    const sp = request.nextUrl.searchParams;
    const codIbge = sp.get("cod_ibge") || "211130";
    const anoParam = sp.get("ano");
    const bimParam = sp.get("bimestre");

    const currentYear = new Date().getFullYear();
    const ano = anoParam ? parseInt(anoParam, 10) : currentYear;

    // Se bimestre não foi especificado, busca o último disponível
    let bimestre: number | null = bimParam ? parseInt(bimParam, 10) : null;
    if (!bimestre) {
      bimestre = await getLatestSiopsBimestre(ano, codIbge);
      // Se não há dados para o ano atual, tenta o anterior
      if (!bimestre && ano === currentYear) {
        bimestre = await getLatestSiopsBimestre(ano - 1, codIbge);
        if (bimestre) {
          // Retorna dados do ano anterior
          return await buildResponse(ano - 1, bimestre, codIbge);
        }
      }
    }

    if (!bimestre) {
      return NextResponse.json({
        disponivel: false,
        ano,
        message: "Nenhum dado do SIOPS disponível. Importe dados na página de Upload.",
      });
    }

    return await buildResponse(ano, bimestre, codIbge);
  } catch (error) {
    console.error("[indicadores/saude] erro:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

async function buildResponse(ano: number, bimestre: number, codIbge: string) {
  const row = await getSiopsAnexo12(ano, bimestre, codIbge);
  if (!row) {
    return NextResponse.json({
      disponivel: false,
      ano,
      bimestre,
      message: "Registro não encontrado para esse período.",
    });
  }

  const r = row as Record<string, unknown>;

  // Busca última atualização
  const ultimaAtualizacao = await getConfiguracao("siops_ultima_atualizacao");

  // Lista todos os registros disponíveis para o histórico
  const historico = await listSiopsRegistros(codIbge);

  const MINIMO_CONSTITUCIONAL = 15;
  const percentual = (r.percentual_aplicado_liquidada as number) || 0;
  const status = percentual >= MINIMO_CONSTITUCIONAL ? "cumprido" : "descumprido";

  return NextResponse.json({
    disponivel: true,
    ano,
    bimestre,
    municipio: r.municipio,
    dataHomologacao: r.data_homologacao,
    ultimaAtualizacao: ultimaAtualizacao || r.updated_at,

    // Dados principais do indicador
    indicador: {
      percentualAplicado: percentual,
      minimoConstitucional: MINIMO_CONSTITUCIONAL,
      status,
      excedente: Math.max(0, percentual - MINIMO_CONSTITUCIONAL),
    },

    // Receitas (base de cálculo)
    receitas: {
      impostos: r.receita_impostos,
      transferencias: r.receita_transferencias,
      total: r.total_receitas,
    },

    // Despesas ASPS
    despesas: {
      empenhada: r.despesa_asps_empenhada,
      liquidada: r.despesa_asps_liquidada,
      paga: r.despesa_asps_paga,
    },

    // Valor aplicado (após deduções)
    valorAplicado: {
      empenhada: r.valor_aplicado_empenhada,
      liquidada: r.valor_aplicado_liquidada,
      paga: r.valor_aplicado_paga,
    },

    // Despesa mínima (15% da receita base)
    despesaMinima: r.despesa_minima,

    // Percentuais
    percentuais: {
      empenhada: r.percentual_aplicado_empenhada,
      liquidada: r.percentual_aplicado_liquidada,
      paga: r.percentual_aplicado_paga,
    },

    // Transferências SUS
    transfSus: {
      uniao: r.transf_saude_uniao,
      estados: r.transf_saude_estados,
      totalAdicionais: r.total_receitas_adicionais,
    },

    // Histórico de bimestres disponíveis
    historico: (historico as Record<string, unknown>[]).map((h) => ({
      ano: h.exercicio_ano,
      bimestre: h.bimestre,
      percentual: h.percentual_aplicado_liquidada,
      dataHomologacao: h.data_homologacao,
    })),
  });
}
