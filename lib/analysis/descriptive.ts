import { MONTHS } from "@/lib/utils/format";

export interface DescriptiveStats {
  total: number;
  media: number;
  mediana: number;
  min: number;
  max: number;
  mesMin: string;
  mesMax: string;
}

/**
 * Calcula estatísticas descritivas dos valores mensais.
 */
export function calcDescriptiveStats(monthlyValues: Record<string, number>): DescriptiveStats {
  const values = MONTHS.map((m) => monthlyValues[m] || 0).filter((v) => v !== 0);

  if (values.length === 0) {
    return { total: 0, media: 0, mediana: 0, min: 0, max: 0, mesMin: "-", mesMax: "-" };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((s, v) => s + v, 0);
  const media = total / values.length;
  const mediana = values.length % 2 === 0
    ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
    : sorted[Math.floor(values.length / 2)];

  let minVal = Infinity;
  let maxVal = -Infinity;
  let mesMin = "";
  let mesMax = "";

  for (const m of MONTHS) {
    const v = monthlyValues[m] || 0;
    if (v === 0) continue;
    if (v < minVal) { minVal = v; mesMin = m; }
    if (v > maxVal) { maxVal = v; mesMax = m; }
  }

  return {
    total,
    media,
    mediana,
    min: minVal === Infinity ? 0 : minVal,
    max: maxVal === -Infinity ? 0 : maxVal,
    mesMin,
    mesMax,
  };
}

/**
 * Calcula a variação percentual entre dois valores.
 */
export function calcVariation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Calcula a participação percentual.
 */
export function calcParticipation(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}
