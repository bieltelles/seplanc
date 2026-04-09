export type TaxCategory =
  | "IPTU"
  | "ITBI"
  | "IR"
  | "ISS"
  | "TAXAS"
  | "CONTRIBUICOES"
  | "TRANSFERENCIAS"
  | "RECEITA_PATRIMONIAL"
  | "RECEITA_SERVICOS"
  | "RECEITAS_CAPITAL"
  | "DEDUCOES"
  | "OUTROS";

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  IPTU: "IPTU",
  ITBI: "ITBI",
  IR: "Imposto de Renda",
  ISS: "ISS/ISSQN",
  TAXAS: "Taxas",
  CONTRIBUICOES: "Contribuições",
  TRANSFERENCIAS: "Transferências",
  RECEITA_PATRIMONIAL: "Receita Patrimonial",
  RECEITA_SERVICOS: "Receita de Serviços",
  RECEITAS_CAPITAL: "Receitas de Capital",
  DEDUCOES: "Deduções",
  OUTROS: "Outros",
};

export const TAX_CATEGORY_COLORS: Record<TaxCategory, string> = {
  IPTU: "#1e40af",
  ITBI: "#3b82f6",
  IR: "#6366f1",
  ISS: "#0ea5e9",
  TAXAS: "#14b8a6",
  CONTRIBUICOES: "#8b5cf6",
  TRANSFERENCIAS: "#f59e0b",
  RECEITA_PATRIMONIAL: "#10b981",
  RECEITA_SERVICOS: "#ec4899",
  RECEITAS_CAPITAL: "#f97316",
  DEDUCOES: "#ef4444",
  OUTROS: "#94a3b8",
};

/**
 * Classifica um código de receita na categoria tributária correspondente.
 * Suporta formato antigo (10 dígitos, 2013-2018) e novo (11 dígitos, 2019+).
 */
export function classifyRevenue(classificacao: string): TaxCategory {
  const code = classificacao.trim();

  // Deduções: códigos começando com 9
  if (code.startsWith("9")) return "DEDUCOES";

  // Formato novo (11 dígitos, 2019+)
  if (code.length === 11) {
    if (code.startsWith("11125") && !code.startsWith("111253")) return "IPTU";
    if (code.startsWith("111253")) return "ITBI";
    if (code.startsWith("11130")) return "IR";
    if (code.startsWith("11145") || code.startsWith("11140")) return "ISS";
    if (code.startsWith("112")) return "TAXAS";
    if (code.startsWith("12") || code.startsWith("14")) return "CONTRIBUICOES";
    if (code.startsWith("13")) return "RECEITA_PATRIMONIAL";
    if (code.startsWith("16")) return "RECEITA_SERVICOS";
    if (code.startsWith("17")) return "TRANSFERENCIAS";
    if (code.startsWith("2")) return "RECEITAS_CAPITAL";
  }

  // Formato antigo (10 dígitos, 2013-2018)
  if (code.length === 10) {
    if (code.startsWith("111202") || code.startsWith("111208")) return "IPTU";
    if (code.startsWith("111208")) return "ITBI";
    if (code.startsWith("111204")) return "IR";
    if (code.startsWith("111305") || code.startsWith("111300")) return "ISS";
    if (code.startsWith("112")) return "TAXAS";
    if (code.startsWith("12") || code.startsWith("14")) return "CONTRIBUICOES";
    if (code.startsWith("13")) return "RECEITA_PATRIMONIAL";
    if (code.startsWith("16")) return "RECEITA_SERVICOS";
    if (code.startsWith("17")) return "TRANSFERENCIAS";
    if (code.startsWith("2")) return "RECEITAS_CAPITAL";
  }

  return "OUTROS";
}

/**
 * Determina o nível hierárquico baseado nos zeros à direita do código.
 * Mais zeros = nível mais alto (mais agregado).
 */
export function getClassificationLevel(classificacao: string): number {
  const code = classificacao.trim();
  let trailingZeros = 0;
  for (let i = code.length - 1; i >= 0; i--) {
    if (code[i] === "0") trailingZeros++;
    else break;
  }
  // Nível 0 = mais alto (ex: 10000000000), nível maior = mais detalhado
  const maxLen = code.length;
  return maxLen - trailingZeros;
}
