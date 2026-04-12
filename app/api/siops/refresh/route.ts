import { NextRequest, NextResponse } from "next/server";
import { fetchSiopsAnexo12Html, SAO_LUIS_PARAMS } from "@/lib/siops/client";
import { parseSiopsAnexo12 } from "@/lib/siops/parser";
import { upsertSiopsAnexo12 } from "@/lib/siops/queries";
import { initializeSchema } from "@/lib/db/schema";
import { setConfiguracao } from "@/lib/db/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/siops/refresh
 *
 * Busca o Anexo 12 (ASPS/Saúde) do SIOPS para São Luís/MA,
 * parseia o HTML e persiste no Turso.
 *
 * Query params (opcionais, defaults = São Luís 2025):
 *   ano=YYYY  — exercício
 *   bimestre=N — bimestre (1-6)
 *
 * Pode ser chamado manualmente (botão na UI) ou pelo cron mensal.
 */
export async function POST(request: NextRequest) {
  try {
    await initializeSchema();

    const sp = request.nextUrl.searchParams;
    const ano = parseInt(sp.get("ano") || String(new Date().getFullYear()), 10);

    // Default: buscar o bimestre mais recente provável
    // Cada bimestre fecha em fev, abr, jun, ago, out, dez
    const currentMonth = new Date().getMonth() + 1;
    const defaultBim = Math.min(6, Math.max(1, Math.ceil(currentMonth / 2)));
    const bimestre = parseInt(sp.get("bimestre") || String(defaultBim), 10);

    if (bimestre < 1 || bimestre > 6) {
      return NextResponse.json(
        { error: "Bimestre deve ser entre 1 e 6." },
        { status: 400 },
      );
    }

    const params = {
      uf: SAO_LUIS_PARAMS.uf,
      codMunicipio: SAO_LUIS_PARAMS.codMunicipio,
      ano,
      bimestre,
    };

    // 1. Busca HTML do SIOPS
    const html = await fetchSiopsAnexo12Html(params);

    // 2. Parseia o HTML
    const data = parseSiopsAnexo12(html, params.codMunicipio, "MA");

    // 3. Persiste no Turso
    const result = await upsertSiopsAnexo12(data);

    // 4. Atualiza timestamp da última atualização
    await setConfiguracao(
      "siops_ultima_atualizacao",
      new Date().toISOString(),
      "Última data/hora em que os dados do SIOPS Anexo 12 foram atualizados",
    );

    return NextResponse.json({
      ...result,
      resumo: {
        municipio: data.municipio,
        ano: data.exercicioAno,
        bimestre: data.bimestre,
        dataHomologacao: data.dataHomologacao,
        totalReceitas: data.receitas.total,
        valorAplicadoLiquidada: data.apuracao.valorAplicado.liquidada,
        percentualAplicado: data.apuracao.percentualAplicado.liquidada,
        despesaMinima: data.apuracao.despesaMinima,
      },
    });
  } catch (error) {
    console.error("[siops/refresh] erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/siops/refresh — permite chamar via browser para debug.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
