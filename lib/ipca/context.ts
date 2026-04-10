import { loadIpcaMap, getConfiguracao } from "@/lib/db/queries";
import type { TipoJuros } from "./correction";

export interface CorrectionContext {
  ipcaMap: Map<string, number>;
  tipoJuros: TipoJuros;
  currentYear: number;
  targetYear: number;
}

/**
 * Carrega o contexto de correção monetária:
 * - Mapa de índices IPCA mensais
 * - Tipo de juros configurado (compostos ou simples)
 * - Ano corrente e ano-alvo da correção (currentYear - 1)
 *
 * Retorna null se a correção não deve ser aplicada (ex: sem dados de IPCA no banco).
 */
export async function loadCorrectionContext(): Promise<CorrectionContext | null> {
  const ipcaMap = await loadIpcaMap();
  if (ipcaMap.size === 0) return null;

  const tipoRaw = (await getConfiguracao("correcao_tipo_juros")) || "compostos";
  const tipoJuros: TipoJuros = tipoRaw === "simples" ? "simples" : "compostos";
  const currentYear = new Date().getFullYear();

  return {
    ipcaMap,
    tipoJuros,
    currentYear,
    targetYear: currentYear - 1,
  };
}
