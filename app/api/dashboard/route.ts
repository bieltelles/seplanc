import { NextRequest, NextResponse } from "next/server";
import { getDashboardSummary, getMonthlyComparison, getYearlyTrend, getAvailableYears } from "@/lib/db/queries";
import { loadCorrectionContext } from "@/lib/ipca/context";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ano = parseInt(searchParams.get("ano") || "0");
    const correcaoAtiva = searchParams.get("correcao") === "1";

    const anos = await getAvailableYears();

    if (anos.length === 0) {
      return NextResponse.json({ data: null, anos: [], correcaoAplicada: false });
    }

    const selectedAno = ano || anos[0].ano;
    const previousAno = anos.find((a) => a.ano === selectedAno - 1)?.ano;

    const ctx = correcaoAtiva ? await loadCorrectionContext() : null;

    const summary = await getDashboardSummary(selectedAno, ctx);
    const trend = await getYearlyTrend(ctx);
    const comparison = previousAno
      ? await getMonthlyComparison(selectedAno, previousAno, ctx)
      : null;

    return NextResponse.json({
      data: {
        summary,
        trend,
        comparison,
      },
      anos: anos.map((a) => a.ano),
      selectedAno,
      correcaoAplicada: !!ctx,
      correcaoInfo: ctx
        ? {
            tipoJuros: ctx.tipoJuros,
            targetYear: ctx.targetYear,
            currentYear: ctx.currentYear,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
