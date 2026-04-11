import { NextRequest, NextResponse } from "next/server";
import { getReceitasSummaryByCategory, getAvailableYears, getCategoryByMonth } from "@/lib/db/queries";
import { loadCorrectionContext } from "@/lib/ipca/context";
import { parseDeducoesFromSearchParams, hasAnySubtipoAtivo } from "@/lib/deducoes/context";
import { MONTHS } from "@/lib/utils/format";
import { calcDescriptiveStats, calcVariation } from "@/lib/analysis/descriptive";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const anosParam = searchParams.get("anos");
    const categoria = searchParams.get("categoria");
    const tipo = searchParams.get("tipo") || "summary";
    const correcaoAtiva = searchParams.get("correcao") === "1";
    const anoBaseParam = searchParams.get("anoBase");
    const anoBase = anoBaseParam ? parseInt(anoBaseParam, 10) : undefined;

    const availableYears = (await getAvailableYears()).map((y) => y.ano);
    const anos = anosParam
      ? anosParam.split(",").map(Number).filter((n) => !isNaN(n))
      : availableYears.slice(0, 2);

    const ctx = correcaoAtiva ? await loadCorrectionContext(anoBase) : null;
    const deducoesCtx = parseDeducoesFromSearchParams(searchParams);
    const deducoesAplicadas = hasAnySubtipoAtivo(deducoesCtx);

    if (tipo === "summary") {
      const data = await getReceitasSummaryByCategory(anos, ctx, deducoesCtx);
      return NextResponse.json({
        data,
        anos: availableYears,
        selectedAnos: anos,
        correcaoAplicada: !!ctx,
        deducoesAplicadas,
      });
    }

    if (tipo === "monthly" && categoria) {
      const results: {
        ano: number;
        monthly: Record<string, number>;
        stats: ReturnType<typeof calcDescriptiveStats>;
        acumulado: number;
        orcado: number;
      }[] = [];
      for (const ano of anos) {
        const row = (await getCategoryByMonth(ano, categoria, ctx, deducoesCtx)) as
          | Record<string, number>
          | undefined;
        const monthlyData: Record<string, number> = {};
        for (const m of MONTHS) {
          monthlyData[m] = (row?.[m] as number) || 0;
        }
        const stats = calcDescriptiveStats(monthlyData);
        results.push({
          ano,
          monthly: monthlyData,
          stats,
          acumulado: (row?.acumulado as number) || 0,
          orcado: (row?.orcado as number) || 0,
        });
      }

      const withVariation = results.map((r, i) => ({
        ...r,
        variacao: i < results.length - 1
          ? calcVariation(r.acumulado, results[i + 1].acumulado)
          : null,
      }));

      return NextResponse.json({
        data: withVariation,
        anos: availableYears,
        selectedAnos: anos,
        categoria,
        correcaoAplicada: !!ctx,
        deducoesAplicadas,
      });
    }

    return NextResponse.json({
      data: await getReceitasSummaryByCategory(anos, ctx, deducoesCtx),
      anos: availableYears,
      selectedAnos: anos,
      correcaoAplicada: !!ctx,
      deducoesAplicadas,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
