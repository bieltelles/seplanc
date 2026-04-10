import { NextRequest, NextResponse } from "next/server";
import { getReceitasFiltered, getAvailableYears } from "@/lib/db/queries";
import { loadCorrectionContext } from "@/lib/ipca/context";
import { MONTHS } from "@/lib/utils/format";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const anosParam = searchParams.get("anos");
    const categoria = searchParams.get("categoria");
    const correcaoAtiva = searchParams.get("correcao") === "1";
    const anoBaseParam = searchParams.get("anoBase");
    const anoBase = anoBaseParam ? parseInt(anoBaseParam, 10) : undefined;

    const availableYears = (await getAvailableYears()).map((y) => y.ano);
    const anos = anosParam
      ? anosParam.split(",").map(Number).filter((n) => !isNaN(n))
      : availableYears;

    const ctx = correcaoAtiva ? await loadCorrectionContext(anoBase) : null;

    const data = (await getReceitasFiltered(
      {
        anos,
        categoria: categoria || undefined,
        apenasDetalhes: true,
      },
      ctx,
    )) as Record<string, unknown>[];

    const headers = [
      "Exercício", "Rubrica", "Fonte", "Classificação", "Descrição",
      "Categoria", "Orçado", ...MONTHS.map((m) => m.charAt(0).toUpperCase() + m.slice(1)),
      "Acumulado",
    ];

    const csvRows = [headers.join(";")];
    for (const row of data) {
      const values = [
        row.exercicio_ano,
        row.rubrica || "",
        row.fonte || "",
        row.classificacao,
        `"${(row.descricao as string || "").replace(/"/g, '""')}"`,
        row.categoria_tributaria || "",
        row.orcado,
        ...MONTHS.map((m) => row[m] || 0),
        row.acumulado,
      ];
      csvRows.push(values.join(";"));
    }

    const csvContent = csvRows.join("\n");
    const suffix = ctx ? `_constantes_31-12-${ctx.targetYear}` : "_correntes";

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="receitas_${anos.join("-")}${suffix}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
