import { NextRequest, NextResponse } from "next/server";
import { getRgfAnexos, getRgfData, getRgfQuadrimestresDisponiveis, getAvailableYears } from "@/lib/db/queries";
import { ensureSeeded } from "@/lib/db/seed";

export async function GET(request: NextRequest) {
  try {
    ensureSeeded();

    const searchParams = request.nextUrl.searchParams;
    const ano = parseInt(searchParams.get("ano") || "0");
    const quadrimestre = parseInt(searchParams.get("quadrimestre") || "0");
    const entidade = searchParams.get("entidade") || "prefeitura";
    const anexo = searchParams.get("anexo") || "";

    const anos = getAvailableYears().map((a) => a.ano);

    if (!ano) {
      return NextResponse.json({ anos, data: null });
    }

    const periodos = getRgfQuadrimestresDisponiveis(ano);

    if (!quadrimestre) {
      return NextResponse.json({ anos, periodos, data: null });
    }

    const anexos = getRgfAnexos(ano, quadrimestre, entidade).map((a) => a.anexo);

    if (!anexo) {
      return NextResponse.json({ anos, periodos, anexos, data: null });
    }

    const data = getRgfData(ano, quadrimestre, entidade, anexo);

    const rows = new Map<number, Record<string, string>>();
    for (const d of data as { linha: number; coluna: string; valor: string }[]) {
      if (!rows.has(d.linha)) rows.set(d.linha, {});
      rows.get(d.linha)![d.coluna] = d.valor;
    }

    const columns = [...new Set((data as { coluna: string }[]).map((d) => d.coluna))];
    const tableData = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => row);

    return NextResponse.json({
      anos,
      periodos,
      anexos,
      columns,
      data: tableData,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
