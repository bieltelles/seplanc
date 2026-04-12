import { NextRequest, NextResponse } from "next/server";
import { parseSiopsAnexo12 } from "@/lib/siops/parser";
import { upsertSiopsAnexo12 } from "@/lib/siops/queries";
import { initializeSchema } from "@/lib/db/schema";
import { setConfiguracao } from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * POST /api/siops/import-html
 *
 * Importa dados do SIOPS Anexo 12 a partir de HTML colado/enviado pelo usuário.
 * Útil quando a busca automática no DATASUS não funciona (ex: bloqueio de IP).
 *
 * Body: raw HTML (text/html ou text/plain)
 * Query params opcionais:
 *   cod_ibge=211130  — código IBGE do município (default São Luís)
 *   uf=MA            — sigla da UF (default MA)
 */
export async function POST(request: NextRequest) {
  try {
    await initializeSchema();

    const sp = request.nextUrl.searchParams;
    const codIbge = sp.get("cod_ibge") || "211130";
    const uf = sp.get("uf") || "MA";

    const html = await request.text();
    if (!html || html.length < 500) {
      return NextResponse.json(
        { error: "HTML vazio ou muito curto. Cole o HTML completo do demonstrativo SIOPS." },
        { status: 400 },
      );
    }

    const data = parseSiopsAnexo12(html, codIbge, uf);
    const result = await upsertSiopsAnexo12(data);

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
    console.error("[siops/import-html] erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
