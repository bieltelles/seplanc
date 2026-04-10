import { NextRequest, NextResponse } from "next/server";
import { getExerciciosWithDetails, getUploadHistory, getAvailableYears, deleteExercicio } from "@/lib/db/queries";

export async function GET() {
  try {
    const exercicios = await getExerciciosWithDetails();
    const uploads = await getUploadHistory();
    const anos = await getAvailableYears();

    return NextResponse.json({
      exercicios,
      uploads,
      anos: anos.map((a) => a.ano),
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anoParam = searchParams.get("ano");
    const ano = anoParam ? parseInt(anoParam, 10) : NaN;

    if (!ano || isNaN(ano)) {
      return NextResponse.json(
        { error: "Parâmetro 'ano' obrigatório e deve ser numérico" },
        { status: 400 },
      );
    }

    await deleteExercicio(ano);

    return NextResponse.json({
      success: true,
      message: `Dados do exercício ${ano} removidos com sucesso`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
