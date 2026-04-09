import { MONTHS } from "@/lib/utils/format";

export interface YearComparison {
  month: string;
  ano1Value: number;
  ano2Value: number;
  variation: number | null;
}

/**
 * Compara dados mensais entre dois anos.
 */
export function compareYears(
  ano1Data: Record<string, number>,
  ano2Data: Record<string, number>,
): YearComparison[] {
  return MONTHS.map((month) => {
    const v1 = ano1Data[month] || 0;
    const v2 = ano2Data[month] || 0;
    return {
      month,
      ano1Value: v1,
      ano2Value: v2,
      variation: v2 !== 0 ? ((v1 - v2) / Math.abs(v2)) * 100 : null,
    };
  });
}

export interface CategoryRanking {
  categoria: string;
  valor: number;
  participacao: number;
}

/**
 * Monta ranking de categorias por valor arrecadado.
 */
export function rankCategories(
  data: { categoria_tributaria: string; total: number }[],
): CategoryRanking[] {
  const total = data.reduce((s, d) => s + Math.abs(d.total), 0);
  return data
    .filter((d) => d.total > 0)
    .map((d) => ({
      categoria: d.categoria_tributaria,
      valor: d.total,
      participacao: total > 0 ? (d.total / total) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}
