/**
 * Converte número no formato brasileiro para float.
 * "1.234.567,89" → 1234567.89
 * "1234567,89" → 1234567.89
 * "0" → 0
 * "" → 0
 */
export function parseBRNumber(value: string | undefined | null): number {
  if (!value || value.trim() === "") return 0;
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
