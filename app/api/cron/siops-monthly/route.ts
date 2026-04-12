import { NextResponse } from "next/server";
import { fetchSiopsAnexo12Html, SAO_LUIS_PARAMS } from "@/lib/siops/client";
import { parseSiopsAnexo12 } from "@/lib/siops/parser";
import { upsertSiopsAnexo12 } from "@/lib/siops/queries";
import { initializeSchema } from "@/lib/db/schema";
import { setConfiguracao } from "@/lib/db/queries";
import type { SiopsUpsertResult } from "@/lib/siops/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/siops-monthly
 *
 * Cron mensal que busca os dados do SIOPS Anexo 12 (Saúde) para São Luís/MA.
 * Tenta os últimos 3 bimestres do ano atual e o 6º bimestre do ano anterior,
 * persistindo qualquer dado novo encontrado.
 *
 * Configurado no vercel.json com schedule "0 10 1 * *" (todo dia 1 às 10h).
 */
export async function GET() {
  try {
    await initializeSchema();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentBim = Math.min(6, Math.max(1, Math.ceil(currentMonth / 2)));

    // Bimestres a tentar: últimos 3 do ano atual + último do ano anterior
    const targets: { ano: number; bimestre: number }[] = [];
    for (let b = currentBim; b >= Math.max(1, currentBim - 2); b--) {
      targets.push({ ano: currentYear, bimestre: b });
    }
    targets.push({ ano: currentYear - 1, bimestre: 6 });

    const results: (SiopsUpsertResult & { error?: string })[] = [];

    for (const target of targets) {
      try {
        const html = await fetchSiopsAnexo12Html({
          uf: SAO_LUIS_PARAMS.uf,
          codMunicipio: SAO_LUIS_PARAMS.codMunicipio,
          ano: target.ano,
          bimestre: target.bimestre,
        });

        const data = parseSiopsAnexo12(
          html,
          SAO_LUIS_PARAMS.codMunicipio,
          "MA",
        );
        const result = await upsertSiopsAnexo12(data);
        results.push(result);
      } catch (err) {
        results.push({
          success: false,
          action: "unchanged",
          exercicioAno: target.ano,
          bimestre: target.bimestre,
          codIbge: SAO_LUIS_PARAMS.codMunicipio,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await setConfiguracao(
      "siops_cron_ultima_execucao",
      new Date().toISOString(),
      "Última execução do cron mensal do SIOPS",
    );

    const anySuccess = results.some((r) => r.success && r.action !== "unchanged");

    return NextResponse.json({
      success: true,
      message: anySuccess
        ? "Dados do SIOPS atualizados com sucesso."
        : "Nenhum dado novo encontrado.",
      results,
      executadoEm: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/siops-monthly] erro:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
