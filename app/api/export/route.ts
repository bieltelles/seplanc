import { NextRequest, NextResponse } from "next/server";
import { getReceitasFiltered, getAvailableYears } from "@/lib/db/queries";
import { ensureSeeded } from "@/lib/db/seed";
import { MONTHS } from "@/lib/utils/format";

export async function GET(request: NextRequest) {
  try {
    ensureSeeded();

    const searchParams = request.nextUrl.searchParams;
    const anosParam = searchParams.get("anos");
    const categoria = searchParams.get("categoria");

    const availableYears = getAvailableYears().map((y) => y.ano);
    const anos = anosParam
      ? anosParam.split(",").map(Number).filter((n) => !isNaN(n))
      : availableYears;

    const data = getReceitasFiltered({
      anos,
      categoria: categoria || undefined,
      apenasDetalhes: true,
    }) as Record<string, unknown>[];

    // Build CSV
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

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="receitas_${anos.join("-")}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
