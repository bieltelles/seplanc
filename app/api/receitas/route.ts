import { NextRequest, NextResponse } from "next/server";
import { getReceitasSummaryByCategory, getAvailableYears, getCategoryByMonth } from "@/lib/db/queries";
import { ensureSeeded } from "@/lib/db/seed";
import { MONTHS } from "@/lib/utils/format";
import { calcDescriptiveStats, calcVariation } from "@/lib/analysis/descriptive";

export async function GET(request: NextRequest) {
  try {
    ensureSeeded();

    const searchParams = request.nextUrl.searchParams;
    const anosParam = searchParams.get("anos");
    const categoria = searchParams.get("categoria");
    const tipo = searchParams.get("tipo") || "summary";

    const availableYears = getAvailableYears().map((y) => y.ano);
    const anos = anosParam
      ? anosParam.split(",").map(Number).filter((n) => !isNaN(n))
      : availableYears.slice(0, 2);

    if (tipo === "summary") {
      const data = getReceitasSummaryByCategory(anos);
      return NextResponse.json({
        data,
        anos: availableYears,
        selectedAnos: anos,
      });
    }

    if (tipo === "monthly" && categoria) {
      const results = anos.map((ano) => {
        const row = getCategoryByMonth(ano, categoria) as Record<string, number> | undefined;
        const monthlyData: Record<string, number> = {};
        for (const m of MONTHS) {
          monthlyData[m] = row?.[m] || 0;
        }
        const stats = calcDescriptiveStats(monthlyData);
        return {
          ano,
          monthly: monthlyData,
          stats,
          acumulado: row?.acumulado || 0,
          orcado: row?.orcado || 0,
        };
      });

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
      data: getReceitasSummaryByCategory(anos),
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
