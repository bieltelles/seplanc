export type TaxCategory =
  | "IPTU"
  | "ITBI"
  | "IR"
  | "ISS"
  | "TAXAS"
  | "CONTRIBUICOES"
  | "CONTRIBUICOES_SOCIAIS"
  | "CONTRIBUICAO_ILUMINACAO"
  | "TRANSFERENCIAS"
  | "TRANSFER_UNIAO"
  | "TRANSFER_UNIAO_FPM"
  | "TRANSFER_UNIAO_SUS"
  | "TRANSFER_UNIAO_OUTRAS"
  | "TRANSFER_ESTADO"
  | "TRANSFER_ESTADO_ICMS"
  | "TRANSFER_ESTADO_IPVA"
  | "TRANSFER_ESTADO_OUTROS"
  | "RECEITA_PATRIMONIAL"
  | "RECEITA_SERVICOS"
  | "OUTRAS_RECEITAS_CORRENTES"
  | "RECEITAS_CAPITAL"
  | "DEDUCOES"
  | "OUTROS";

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  IPTU: "IPTU",
  ITBI: "ITBI",
  IR: "Imposto de Renda",
  ISS: "ISS/ISSQN",
  TAXAS: "Taxas",
  CONTRIBUICOES: "Contribuições (total)",
  CONTRIBUICOES_SOCIAIS: "Contribuições Sociais",
  CONTRIBUICAO_ILUMINACAO: "Iluminação Pública (COSIP)",
  TRANSFERENCIAS: "Transferências Correntes (total)",
  TRANSFER_UNIAO: "Transferências da União (total)",
  TRANSFER_UNIAO_FPM: "União - FPM",
  TRANSFER_UNIAO_SUS: "União - SUS",
  TRANSFER_UNIAO_OUTRAS: "União - Outras",
  TRANSFER_ESTADO: "Transferências do Estado (total)",
  TRANSFER_ESTADO_ICMS: "Estado - ICMS",
  TRANSFER_ESTADO_IPVA: "Estado - IPVA",
  TRANSFER_ESTADO_OUTROS: "Estado - Outros",
  RECEITA_PATRIMONIAL: "Receita Patrimonial",
  RECEITA_SERVICOS: "Receita de Serviços",
  OUTRAS_RECEITAS_CORRENTES: "Outras Receitas Correntes",
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
  CONTRIBUICOES_SOCIAIS: "#7c3aed",
  CONTRIBUICAO_ILUMINACAO: "#a78bfa",
  TRANSFERENCIAS: "#b45309",
  TRANSFER_UNIAO: "#f59e0b",
  TRANSFER_UNIAO_FPM: "#d97706",
  TRANSFER_UNIAO_SUS: "#fbbf24",
  TRANSFER_UNIAO_OUTRAS: "#fde68a",
  TRANSFER_ESTADO: "#15803d",
  TRANSFER_ESTADO_ICMS: "#16a34a",
  TRANSFER_ESTADO_IPVA: "#22c55e",
  TRANSFER_ESTADO_OUTROS: "#86efac",
  RECEITA_PATRIMONIAL: "#10b981",
  RECEITA_SERVICOS: "#ec4899",
  OUTRAS_RECEITAS_CORRENTES: "#64748b",
  RECEITAS_CAPITAL: "#f97316",
  DEDUCOES: "#ef4444",
  OUTROS: "#94a3b8",
};

/**
 * Sentinela "Contribuições" no filtro = união de todas as contribuições.
 * Ao filtrar por `CONTRIBUICOES`, o backend expande para todas as categorias
 * deste grupo (Sociais + COSIP + catch-all genérica). Já as chaves específicas
 * `CONTRIBUICOES_SOCIAIS` e `CONTRIBUICAO_ILUMINACAO` filtram apenas cada
 * subcategoria.
 */
export const CONTRIBUICOES_GROUP: readonly TaxCategory[] = [
  "CONTRIBUICOES",
  "CONTRIBUICOES_SOCIAIS",
  "CONTRIBUICAO_ILUMINACAO",
] as const;

/**
 * Grupo "Transferências da União" — FPM + SUS + outras transferências federais.
 */
export const TRANSFER_UNIAO_GROUP: readonly TaxCategory[] = [
  "TRANSFER_UNIAO",
  "TRANSFER_UNIAO_FPM",
  "TRANSFER_UNIAO_SUS",
  "TRANSFER_UNIAO_OUTRAS",
] as const;

/**
 * Grupo "Transferências do Estado" — ICMS + IPVA + outras transferências estaduais.
 */
export const TRANSFER_ESTADO_GROUP: readonly TaxCategory[] = [
  "TRANSFER_ESTADO",
  "TRANSFER_ESTADO_ICMS",
  "TRANSFER_ESTADO_IPVA",
  "TRANSFER_ESTADO_OUTROS",
] as const;

/**
 * Umbrella "Transferências Correntes (total)" — inclui todas as transferências
 * da União e do Estado mais o catch-all genérico.
 */
export const TRANSFERENCIAS_GROUP: readonly TaxCategory[] = [
  "TRANSFERENCIAS",
  ...TRANSFER_UNIAO_GROUP,
  ...TRANSFER_ESTADO_GROUP,
] as const;

/**
 * Expande um valor de filtro para a lista de categorias que o backend deve
 * considerar. Para categorias normais, retorna `[cat]`. Para umbrellas
 * (`CONTRIBUICOES`, `TRANSFERENCIAS`, `TRANSFER_UNIAO`, `TRANSFER_ESTADO`),
 * retorna o grupo completo.
 */
export function expandCategoriaFilter(cat: string): string[] {
  if (cat === "CONTRIBUICOES") return [...CONTRIBUICOES_GROUP];
  if (cat === "TRANSFERENCIAS") return [...TRANSFERENCIAS_GROUP];
  if (cat === "TRANSFER_UNIAO") return [...TRANSFER_UNIAO_GROUP];
  if (cat === "TRANSFER_ESTADO") return [...TRANSFER_ESTADO_GROUP];
  return [cat];
}

/**
 * Classifica um código de receita na categoria tributária correspondente.
 *
 * Suporta três formatos usados pela prefeitura ao longo dos anos:
 *
 * - **Formato antigo (10 dígitos, 2013-2017)** — Portaria STN antiga
 *   - 1112020000 → IPTU (Propriedade Predial e Territorial Urbana)
 *   - 1112040000 → IR  (Renda e Proventos, retido na fonte)
 *   - 1112080000 → ITBI (Transmissão Intervivos)
 *   - 1113050000 → ISS/ISSQN (Serviços de Qualquer Natureza)
 *   - 1210xxxxxx → Contribuições Sociais (RPPS, Outras Contribuições Sociais)
 *   - 1230xxxxxx → COSIP - Iluminação Pública
 *
 * - **Formato intermediário (11 dígitos, 2018-2021)** — prefixo `11180`
 *   - 11180110000 → IPTU
 *   - 11180140000 → ITBI
 *   - 11180230000 → ISS
 *   - 11130xxxxxx → IR (Imposto sobre a Renda - Retido na Fonte)
 *
 * - **Formato novo MCASP (11 dígitos, 2022+)** — prefixos `11125`, `11145`
 *   - 11125 (exceto 111253) → IPTU
 *   - 111253            → ITBI
 *   - 11130              → IR
 *   - 11140 / 11145      → ISS
 *
 * - **Contribuições (11 dígitos, 2018+)**
 *   - 121xxxxxxxx → Contribuições Sociais (RPPS, Outras)
 *   - 124xxxxxxxx → COSIP - Iluminação Pública
 *
 * - **Transferências Correntes - conta 17 (11 dígitos, 2022+ MCASP)**
 *   - 171151xxxxx → FPM (Cota-Parte do Fundo de Participação dos Municípios)
 *   - 1713xxxxxxx → SUS (Transferências de Recursos do SUS)
 *   - 171xxxxxxxx → Outras transferências da União (FNDE, FNAS, CFEM, etc.)
 *   - 172150xxxxx → ICMS (Cota-Parte do ICMS)
 *   - 172151xxxxx → IPVA (Cota-Parte do IPVA)
 *   - 172xxxxxxxx → Outras transferências do Estado
 *
 * - **Transferências Correntes - conta 17 (11 dígitos, 2018-2021)**
 *   - 1718012xxxx → FPM Cota Mensal
 *   - 1718013xxxx → FPM 1% Dezembro
 *   - 1718014xxxx → FPM 1% Julho
 *   - 171803xxxxx → SUS Bloco Custeio
 *   - 171804xxxxx → SUS Bloco Investimentos
 *   - 17180xxxxxx → Outras transferências da União (ITR, CFEM, FEP, IOF-Ouro)
 *   - 1728011xxxx → ICMS
 *   - 1728012xxxx → IPVA
 *   - 17280xxxxxx → Outras transferências do Estado
 *
 * - **Transferências Correntes - conta 17 (10 dígitos, 2013-2017)**
 *   - 17210102xx → FPM
 *   - 172133xxxx → SUS
 *   - 1721xxxxxx → Outras transferências da União
 *   - 17220101xx → ICMS
 *   - 17220102xx → IPVA
 *   - 1722xxxxxx → Outras transferências do Estado
 *
 * - **Outras Receitas Correntes - conta 19**
 *   - 19xxxxxxxxx → Multas, indenizações, restituições, receita da dívida ativa
 *     de outras receitas, etc.
 */
export function classifyRevenue(classificacao: string): TaxCategory {
  const code = classificacao.trim();

  // Deduções: códigos começando com 9
  if (code.startsWith("9")) return "DEDUCOES";

  // Formato 11 dígitos (2018+)
  if (code.length === 11) {
    // ----- 2018-2021 (prefixo 11180) -----
    if (code.startsWith("1118011")) return "IPTU";
    if (code.startsWith("1118014")) return "ITBI";
    if (code.startsWith("1118023")) return "ISS";

    // ----- 2022+ (MCASP) -----
    if (code.startsWith("111253")) return "ITBI";
    if (code.startsWith("11125")) return "IPTU";
    if (code.startsWith("11145") || code.startsWith("11140")) return "ISS";

    // ----- Comum a 2018+ -----
    if (code.startsWith("11130")) return "IR";

    if (code.startsWith("112")) return "TAXAS";

    // Contribuições (subcategorias)
    if (code.startsWith("121")) return "CONTRIBUICOES_SOCIAIS";
    if (code.startsWith("124")) return "CONTRIBUICAO_ILUMINACAO";
    if (code.startsWith("12") || code.startsWith("14")) return "CONTRIBUICOES";

    if (code.startsWith("13")) return "RECEITA_PATRIMONIAL";
    if (code.startsWith("16")) return "RECEITA_SERVICOS";

    // Transferências da União (171xxxxxxxx)
    // ----- 2022+ (MCASP) -----
    if (code.startsWith("171151")) return "TRANSFER_UNIAO_FPM";
    if (code.startsWith("1713")) return "TRANSFER_UNIAO_SUS";
    // ----- 2018-2021 (prefixo 17180) -----
    // FPM: cota mensal (1718012), 1% dezembro (1718013), 1% julho (1718014)
    if (
      code.startsWith("1718012") ||
      code.startsWith("1718013") ||
      code.startsWith("1718014")
    ) {
      return "TRANSFER_UNIAO_FPM";
    }
    // SUS: Bloco Custeio (171803) + Bloco Investimentos (171804)
    if (code.startsWith("171803") || code.startsWith("171804")) {
      return "TRANSFER_UNIAO_SUS";
    }
    // Catch-all União
    if (code.startsWith("171")) return "TRANSFER_UNIAO_OUTRAS";

    // Transferências do Estado (172xxxxxxxx)
    // ----- 2022+ (MCASP) -----
    if (code.startsWith("172150")) return "TRANSFER_ESTADO_ICMS";
    if (code.startsWith("172151")) return "TRANSFER_ESTADO_IPVA";
    // ----- 2018-2021 (prefixo 17280) -----
    if (code.startsWith("1728011")) return "TRANSFER_ESTADO_ICMS";
    if (code.startsWith("1728012")) return "TRANSFER_ESTADO_IPVA";
    // Catch-all Estado
    if (code.startsWith("172")) return "TRANSFER_ESTADO_OUTROS";

    // Transferências Correntes — catch-all (cabeçalho 17000000000)
    if (code.startsWith("17")) return "TRANSFERENCIAS";

    // Outras Receitas Correntes (conta 19)
    if (code.startsWith("19")) return "OUTRAS_RECEITAS_CORRENTES";

    if (code.startsWith("2")) return "RECEITAS_CAPITAL";
  }

  // Formato antigo (10 dígitos, 2013-2017)
  if (code.length === 10) {
    if (code.startsWith("111208")) return "ITBI";
    if (code.startsWith("111202")) return "IPTU";
    if (code.startsWith("111204")) return "IR";
    if (code.startsWith("111305") || code.startsWith("111300")) return "ISS";
    if (code.startsWith("112")) return "TAXAS";

    // Contribuições (subcategorias)
    if (code.startsWith("1210")) return "CONTRIBUICOES_SOCIAIS";
    if (code.startsWith("1230")) return "CONTRIBUICAO_ILUMINACAO";
    if (code.startsWith("12") || code.startsWith("14")) return "CONTRIBUICOES";

    if (code.startsWith("13")) return "RECEITA_PATRIMONIAL";
    if (code.startsWith("16")) return "RECEITA_SERVICOS";

    // Transferências da União (1721xxxxxx)
    if (code.startsWith("17210102")) return "TRANSFER_UNIAO_FPM";
    if (code.startsWith("172133")) return "TRANSFER_UNIAO_SUS";
    if (code.startsWith("1721")) return "TRANSFER_UNIAO_OUTRAS";

    // Transferências do Estado (1722xxxxxx)
    if (code.startsWith("17220101")) return "TRANSFER_ESTADO_ICMS";
    if (code.startsWith("17220102")) return "TRANSFER_ESTADO_IPVA";
    if (code.startsWith("1722")) return "TRANSFER_ESTADO_OUTROS";

    // Transferências Correntes — catch-all (cabeçalho 1700000000 e outras
    // transferências intergovernamentais: 1720, 1723 etc.)
    if (code.startsWith("17")) return "TRANSFERENCIAS";

    // Outras Receitas Correntes (conta 19)
    if (code.startsWith("19")) return "OUTRAS_RECEITAS_CORRENTES";

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
