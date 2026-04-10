import { NextResponse } from "next/server";
import { fetchIpcaFromBcb } from "@/lib/ipca/fetch-bcb";
import {
  upsertIpcaIndices,
  setConfiguracao,
  getIpcaCount,
  getLatestIpcaEntry,
} from "@/lib/db/queries";

/**
 * GET/POST /api/ipca/refresh
 * Busca o IPCA atualizado do Banco Central e persiste no Turso.
 * Pode ser chamado manualmente ou via cron.
 */
async function refresh() {
  const entries = await fetchIpcaFromBcb("01/01/2010");
  const inserted = await upsertIpcaIndices(entries);
  await setConfiguracao(
    "ipca_ultima_atualizacao",
    new Date().toISOString(),
    "Última data/hora em que os índices do IPCA foram atualizados pelo BCB",
  );

  const latest = await getLatestIpcaEntry();
  const total = await getIpcaCount();

  return {
    success: true,
    message: `IPCA atualizado: ${inserted} registros processados`,
    totalRegistros: total,
    ultimoMes: latest
      ? { ano: latest.ano, mes: latest.mes, variacao: latest.variacao_mensal, data: latest.data_referencia }
      : null,
    atualizadoEm: new Date().toISOString(),
  };
}

export async function POST() {
  try {
    const result = await refresh();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const result = await refresh();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
