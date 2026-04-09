import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/db/seed";
import { getAvailableYears } from "@/lib/db/queries";

export async function POST() {
  try {
    await seedDatabase();
    const anos = await getAvailableYears();
    return NextResponse.json({
      success: true,
      message: "Seed concluído",
      anos: anos.map((a) => a.ano),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}

// Also seed on GET for convenience during setup
export async function GET() {
  try {
    const anos = await getAvailableYears();
    if (anos.length === 0) {
      await seedDatabase();
      const anosAfterSeed = await getAvailableYears();
      return NextResponse.json({
        success: true,
        message: "Banco vazio detectado. Seed executado automaticamente.",
        anos: anosAfterSeed.map((a) => a.ano),
      });
    }
    return NextResponse.json({
      success: true,
      message: "Banco de dados já contém dados.",
      anos: anos.map((a) => a.ano),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
