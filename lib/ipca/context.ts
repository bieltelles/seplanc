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
 * - Ano pivô (`anoBase`) e ano-alvo da correção (`anoBase - 1`).
 *
 * Semântica do pivô:
 * - Anos >= anoBase → mantidos em valores correntes.
 * - Anos <  anoBase → corrigidos para 31/12/(anoBase - 1).
 *
 * Se `anoBase` não for fornecido, usa o ano corrente do sistema.
 * Retorna null se a correção não pode ser aplicada (ex: sem IPCA no banco).
 */
export async function loadCorrectionContext(
  anoBase?: number,
): Promise<CorrectionContext | null> {
  const ipcaMap = await loadIpcaMap();
  if (ipcaMap.size === 0) return null;

  const tipoRaw = (await getConfiguracao("correcao_tipo_juros")) || "compostos";
  const tipoJuros: TipoJuros = tipoRaw === "simples" ? "simples" : "compostos";

  const pivo =
    typeof anoBase === "number" && !Number.isNaN(anoBase) && anoBase > 0
      ? anoBase
      : new Date().getFullYear();

  return {
    ipcaMap,
    tipoJuros,
    // `currentYear` aqui representa o pivô (anos < currentYear serão corrigidos).
    // A nomenclatura é mantida para compatibilidade com shouldCorrectYear()/getTargetYear().
    currentYear: pivo,
    targetYear: pivo - 1,
  };
}
