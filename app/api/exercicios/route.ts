import { NextResponse } from "next/server";
import { getExerciciosWithDetails, getUploadHistory, getAvailableYears } from "@/lib/db/queries";
import { ensureSeeded } from "@/lib/db/seed";

export async function GET() {
  try {
    ensureSeeded();

    const exercicios = getExerciciosWithDetails();
    const uploads = getUploadHistory();
    const anos = getAvailableYears();

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
