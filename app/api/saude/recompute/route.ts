import { NextRequest, NextResponse } from "next/server";
import {
  computeAndUpsertAnexo12,
  computeAllBimestres,
  inferBimestreDoExercicio,
} from "@/lib/saude/compute-anexo12";
import { initializeSchema } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/saude/recompute?ano=YYYY[&bimestre=N|all]
 *
 * Recalcula o Anexo 12 (Saúde) a partir dos Balancetes internos já
 * importados no Turso (tabelas `receitas` e `despesas`).
 *
 *   ano=2025              exercício (default: ano atual)
 *   bimestre=N            recalcula somente o bimestre N (default:
 *                         inferido do exercício)
 *   bimestre=all          recalcula os 6 bimestres
 */
export async function POST(request: NextRequest) {
  try {
    await initializeSchema();

    const sp = request.nextUrl.searchParams;
    const ano = sp.get("ano")
      ? parseInt(sp.get("ano")!, 10)
      : new Date().getFullYear();
    const bimParam = sp.get("bimestre");

    if (bimParam === "all") {
      const results = await computeAllBimestres(ano);
      return NextResponse.json({ success: true, ano, results });
    }

    const bimestre = bimParam
      ? parseInt(bimParam, 10)
      : inferBimestreDoExercicio(ano);

    const result = await computeAndUpsertAnexo12(ano, bimestre);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[saude/recompute] erro:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
