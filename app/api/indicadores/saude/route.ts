import { NextRequest, NextResponse } from "next/server";
import {
  getSiopsAnexo12,
  getLatestSiopsBimestre,
  listSiopsRegistros,
} from "@/lib/siops/queries";
import { initializeSchema } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Trunca para 2 casas decimais (sem arredondar) — o SIOPS exibe o
 * percentual truncado; se fizermos `toFixed(2)` teríamos divergência
 * de 0,01% em valores como 22,699% (viraria 22,70% em vez de 22,69%).
 */
function truncate2(v: number): number {
  return Math.trunc(v * 100) / 100;
}

/**
 * GET /api/indicadores/saude
 *
 * Retorna os dados do indicador de Saúde (Anexo 12, LC 141/2012) calculados
 * a partir dos Balancetes internos da prefeitura (tabelas `receitas` e
 * `despesas`) e persistidos em `siops_anexo12`.
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
        const prev = await getLatestSiopsBimestre(ano - 1, codIbge);
        if (prev) {
          return await buildResponse(ano - 1, prev, codIbge);
        }
      }
    }

    if (!bimestre) {
      return NextResponse.json({
        disponivel: false,
        ano,
        message:
          "Nenhum dado de Saúde calculado ainda. Importe o Balancete de Receita e o Balancete de Despesa Geral na página de Upload.",
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

  // Lista todos os registros disponíveis para o histórico
  const historico = await listSiopsRegistros(codIbge);

  const MINIMO_CONSTITUCIONAL = 15;
  const percentualRaw = (r.percentual_aplicado_liquidada as number) || 0;
  const percentual = truncate2(percentualRaw);
  const status = percentual >= MINIMO_CONSTITUCIONAL ? "cumprido" : "descumprido";

  return NextResponse.json({
    disponivel: true,
    ano,
    bimestre,
    municipio: r.municipio,
    dataHomologacao: r.data_homologacao,
    ultimaAtualizacao: r.updated_at,

    // Dados principais do indicador (valores já truncados para bater com SIOPS)
    indicador: {
      percentualAplicado: percentual,
      minimoConstitucional: MINIMO_CONSTITUCIONAL,
      status,
      excedente: truncate2(Math.max(0, percentualRaw - MINIMO_CONSTITUCIONAL)),
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

    // Valor aplicado (após deduções — XIII/XIV/XV = 0)
    valorAplicado: {
      empenhada: r.valor_aplicado_empenhada,
      liquidada: r.valor_aplicado_liquidada,
      paga: r.valor_aplicado_paga,
    },

    // Despesa mínima (15% da receita base)
    despesaMinima: r.despesa_minima,

    // Percentuais (truncados para 2 casas — compatível com SIOPS)
    percentuais: {
      empenhada: truncate2((r.percentual_aplicado_empenhada as number) || 0),
      liquidada: percentual,
      paga: truncate2((r.percentual_aplicado_paga as number) || 0),
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
      percentual: truncate2((h.percentual_aplicado_liquidada as number) || 0),
      dataHomologacao: h.data_homologacao,
    })),
  });
}
