import { NextRequest, NextResponse } from "next/server";
import { getRreoAnexos, getRreoData, getRreoBimestresDisponiveis, getAvailableYears } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ano = parseInt(searchParams.get("ano") || "0");
    const bimestre = parseInt(searchParams.get("bimestre") || "0");
    const anexo = searchParams.get("anexo") || "";

    const anos = (await getAvailableYears()).map((a) => a.ano);

    if (!ano) {
      return NextResponse.json({ anos, data: null });
    }

    const bimestres = (await getRreoBimestresDisponiveis(ano)).map((b) => b.bimestre);

    if (!bimestre) {
      return NextResponse.json({ anos, bimestres, data: null });
    }

    const anexos = (await getRreoAnexos(ano, bimestre)).map((a) => a.anexo);

    if (!anexo) {
      return NextResponse.json({ anos, bimestres, anexos, data: null });
    }

    const data = await getRreoData(ano, bimestre, anexo);

    // Restructure into table format
    const rows = new Map<number, Record<string, string>>();
    for (const d of data as unknown as { linha: number; coluna: string; valor: string }[]) {
      if (!rows.has(d.linha)) rows.set(d.linha, {});
      rows.get(d.linha)![d.coluna] = d.valor;
    }

    const columns = [...new Set((data as unknown as { coluna: string }[]).map((d) => d.coluna))];
    const tableData = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, row]) => row);

    return NextResponse.json({
      anos,
      bimestres,
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
