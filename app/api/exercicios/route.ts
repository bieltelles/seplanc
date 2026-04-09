import { NextResponse } from "next/server";
import { getExerciciosWithDetails, getUploadHistory, getAvailableYears } from "@/lib/db/queries";

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
