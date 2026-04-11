import type { DeducaoSubtipo } from "@/lib/constants/tax-categories";

/**
 * Contexto para aplicação da toggle "Valores Líquidos de Deduções".
 *
 * Quando `ativa = true`, as queries de agregação de receitas devem
 * subtrair, de cada categoria, o total das deduções (código começando
 * com `9`) cujo subtipo esteja marcado em `subtipos`.
 *
 * Quando `ativa = false`, as receitas são retornadas brutas (deduções
 * ficam como uma rubrica separada `totalDeducoes`, comportamento legado).
 *
 * O mapeamento dedução → categoria é feito em tempo de agregação via
 * `deducaoToReceitaCode()` + `classifyRevenue()`, não requer coluna nova
 * no banco — a classificação `is_deducao` persistida pelo parser basta.
 */
export interface DeducoesContext {
  ativa: boolean;
  subtipos: Record<DeducaoSubtipo, boolean>;
}

export const DEFAULT_DEDUCOES_CONTEXT: DeducoesContext = {
  ativa: false,
  subtipos: {
    FUNDEB: true,
    ABATIMENTO: true,
    INTRA: false,
    OUTRAS: false,
  },
};

/**
 * Parseia o contexto a partir dos query params da request. Formato:
 *   liquido=1&dedFundeb=1&dedAbat=0&dedIntra=0&dedOutras=0
 * Omissões caem nos defaults.
 */
export function parseDeducoesFromSearchParams(
  sp: URLSearchParams,
): DeducoesContext {
  const ativa = sp.get("liquido") === "1";
  // Se a toggle não está ativa, retorna um contexto "inerte" — as queries
  // nem vão consultar os subtipos. Ainda assim preenchemos por consistência.
  if (!ativa) return { ...DEFAULT_DEDUCOES_CONTEXT, ativa: false };

  const flag = (key: string, fallback: boolean): boolean => {
    const v = sp.get(key);
    if (v === null) return fallback;
    return v === "1" || v === "true";
  };

  return {
    ativa: true,
    subtipos: {
      FUNDEB: flag("dedFundeb", true),
      ABATIMENTO: flag("dedAbat", true),
      INTRA: flag("dedIntra", false),
      OUTRAS: flag("dedOutras", false),
    },
  };
}

/**
 * Helper: retorna `true` se pelo menos um subtipo está marcado e a toggle
 * está ativa. Usado pelas queries como short-circuit para não fazer o
 * trabalho extra de juntar deduções quando nada seria subtraído.
 */
export function hasAnySubtipoAtivo(ctx: DeducoesContext | null | undefined): boolean {
  if (!ctx || !ctx.ativa) return false;
  return Object.values(ctx.subtipos).some((v) => v === true);
}
