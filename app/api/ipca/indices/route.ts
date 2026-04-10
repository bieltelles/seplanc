import { NextResponse } from "next/server";
import { getAllIpcaIndices } from "@/lib/db/queries";

/**
 * GET /api/ipca/indices
 * Retorna todos os índices do IPCA armazenados no banco.
 */
export async function GET() {
  try {
    const rows = await getAllIpcaIndices();
    return NextResponse.json({
      total: rows.length,
      indices: rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
