import { NextRequest, NextResponse } from "next/server";
import { fetchIpcaFromBcb } from "@/lib/ipca/fetch-bcb";
import { upsertIpcaIndices, setConfiguracao, getIpcaCount } from "@/lib/db/queries";

/**
 * Endpoint chamado automaticamente pelo Vercel Cron para atualizar os índices do IPCA.
 *
 * Segurança: se a env var CRON_SECRET estiver definida, exige header
 * "Authorization: Bearer <secret>". O Vercel envia isso automaticamente quando
 * CRON_SECRET está configurada.
 *
 * Schedule configurado em vercel.json.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const entries = await fetchIpcaFromBcb("01/01/2010");
    const processed = await upsertIpcaIndices(entries);
    await setConfiguracao(
      "ipca_ultima_atualizacao",
      new Date().toISOString(),
      "Última data/hora em que os índices do IPCA foram atualizados pelo BCB",
    );
    const total = await getIpcaCount();

    return NextResponse.json({
      success: true,
      processed,
      totalRegistros: total,
      atualizadoEm: new Date().toISOString(),
      fonte: "BCB SGS série 433",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
