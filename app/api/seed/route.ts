import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/db/seed";

export async function POST() {
  try {
    ensureSeeded();
    return NextResponse.json({ success: true, message: "Seed concluído" });
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
    ensureSeeded();
    return NextResponse.json({ success: true, message: "Banco de dados pronto" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
