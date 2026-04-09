import { NextRequest, NextResponse } from "next/server";
import { getReceitasSummaryByCategory, getAvailableYears, getCategoryByMonth } from "@/lib/db/queries";
import { MONTHS } from "@/lib/utils/format";
import { calcDescriptiveStats, calcVariation } from "@/lib/analysis/descriptive";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const anosParam = searchParams.get("anos");
    const categoria = searchParams.get("categoria");
    const tipo = searchParams.get("tipo") || "summary";

    const availableYears = (await getAvailableYears()).map((y) => y.ano);
    const anos = anosParam
      ? anosParam.split(",").map(Number).filter((n) => !isNaN(n))
      : availableYears.slice(0, 2);

    if (tipo === "summary") {
      const data = await getReceitasSummaryByCategory(anos);
      return NextResponse.json({
        data,
        anos: availableYears,
        selectedAnos: anos,
      });
    }

    if (tipo === "monthly" && categoria) {
      const results: { ano: number; monthly: Record<string, number>; stats: ReturnType<typeof calcDescriptiveStats>; acumulado: number; orcado: number }[] = [];
      for (const ano of anos) {
        const row = await getCategoryByMonth(ano, categoria) as Record<string, number> | undefined;
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

      // Calculate year-over-year variation
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
      });
    }

    return NextResponse.json({
      data: await getReceitasSummaryByCategory(anos),
      anos: availableYears,
      selectedAnos: anos,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
