import { NextRequest, NextResponse } from "next/server";
import { getDashboardSummary, getMonthlyComparison, getYearlyTrend, getAvailableYears } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ano = parseInt(searchParams.get("ano") || "0");
    const anos = await getAvailableYears();

    if (anos.length === 0) {
      return NextResponse.json({ data: null, anos: [] });
    }

    const selectedAno = ano || anos[0].ano;
    const previousAno = anos.find((a) => a.ano === selectedAno - 1)?.ano;

    const summary = await getDashboardSummary(selectedAno);
    const trend = await getYearlyTrend();
    const comparison = previousAno
      ? await getMonthlyComparison(selectedAno, previousAno)
      : null;

    return NextResponse.json({
      data: {
        summary,
        trend,
        comparison,
      },
      anos: anos.map((a) => a.ano),
      selectedAno,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
