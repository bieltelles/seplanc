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

// ============================================================================
// DEDUÇÕES (conta 9) — subtipos aplicáveis na toggle de valores líquidos
// ============================================================================

/**
 * Subtipo de dedução, usado para permitir ao usuário escolher **quais
 * categorias de dedução** devem ser subtraídas das receitas ao exibir
 * "valores líquidos".
 *
 * - `FUNDEB`: retenção constitucional sobre FPM, ITR, LC 87/96, ICMS,
 *   IPVA, IPI-Exportação. Historicamente é a única dedução automática
 *   sobre transferências correntes (EC 108/2020).
 * - `ABATIMENTO`: deduções de receita própria — restituições, devoluções,
 *   cancelamentos e abatimentos de IPTU, ISS, ITBI, taxas, contribuições,
 *   dívida ativa, receita patrimonial, etc.
 * - `INTRA`: deduções de receitas intraorçamentárias (prefixo `97`).
 *   Tipicamente usado para eliminar dupla contagem em consolidações.
 * - `OUTRAS`: catch-all (ex: deduções de transferências que não entram
 *   no FUNDEB, como SUS, convênios específicos, etc.).
 */
export type DeducaoSubtipo = "FUNDEB" | "ABATIMENTO" | "INTRA" | "OUTRAS";

export const DEDUCAO_SUBTIPO_LABELS: Record<DeducaoSubtipo, string> = {
  FUNDEB: "FUNDEB (retenção constitucional sobre transferências)",
  ABATIMENTO: "Abatimentos, restituições e devoluções de receita própria",
  INTRA: "Intraorçamentárias (eliminação de dupla contagem)",
  OUTRAS: "Outras deduções",
};

/**
 * Classifica uma linha de dedução (código `9...`) em seu subtipo funcional.
 *
 * A regra combina dois sinais:
 *  1. A **descrição** — se contiver a palavra "FUNDEB", é dedução FUNDEB.
 *     Esse é o sinal mais confiável, porque os CSVs da prefeitura anotam
 *     explicitamente as retenções constitucionais com "DEDUÇÃO DA RECEITA
 *     PARA FORMAÇÃO DO FUNDEB - FPM/ICMS/IPVA/ITR/..." em várias eras.
 *  2. O **código** — fallback para linhas de detalhe (MCASP 2022+) que
 *     não repetem "FUNDEB" no nome porque herdam do pai. Os prefixos
 *     cobrem as três eras (STN 10d, intermediário 11d, MCASP 11d/12d).
 *
 * Para códigos que não começam com `9` a função retorna `"OUTRAS"`, mas
 * o consumidor deve evitar chamá-la para receitas positivas.
 */
export function classifyDeducaoSubtipo(
  classificacao: string,
  descricao: string = "",
): DeducaoSubtipo {
  const code = classificacao.trim();
  const desc = descricao.trim().toUpperCase();

  if (!code.startsWith("9")) return "OUTRAS";

  // Intraorçamentárias: prefixo `97` (dedução de receitas intra, quando existir).
  if (code.startsWith("97")) return "INTRA";

  // FUNDEB por descrição (sinal mais confiável).
  if (desc.includes("FUNDEB")) return "FUNDEB";

  // FUNDEB por código — prefixos específicos nas três eras.
  // STN antigo (2013-2017) e intermediário (2018-2021):
  //   91700xxxxx           → header "DEDUÇÃO DA RECEITA PARA FORMAÇÃO DO FUNDEB"
  //   91721010xxx / 91721... → DEDUÇÃO transferências União (FPM/ITR/LC87/IOF-Ouro)
  //   91722010xxx / 91722... → DEDUÇÃO transferências Estado (ICMS/IPVA/IPI-Exportação)
  if (code.startsWith("91700")) return "FUNDEB";
  if (code.startsWith("91721")) return "FUNDEB";
  if (code.startsWith("91722")) return "FUNDEB";
  // MCASP (2022+): dedução por cota-parte específica do FUNDEB
  //   917115xxxxxx → FPE/FPM, ITR, LC 87/96 (União)
  //   917215xxxxxx → ICMS, IPVA, IPI-Exportação (Estado)
  if (code.startsWith("917115")) return "FUNDEB";
  if (code.startsWith("917215")) return "FUNDEB";

  // Abatimentos/restituições/devoluções de receita própria.
  // Qualquer 911x (impostos/taxas), 912x (contribuições), 913x (patrimonial),
  // 914x (agropecuária), 916x (serviços), 919x (outras correntes/dívida ativa).
  // Usa regex para cobrir todos os não-7 do segundo dígito (o segundo dígito
  // 7 é reservado para transferências correntes, já tratado acima).
  if (/^91[012346689]/.test(code)) return "ABATIMENTO";

  // Resto: deduções de transferências que não são FUNDEB (ex: SUS, convênios,
  // transferências específicas do MA, etc.) e deduções de capital (92...).
  return "OUTRAS";
}

/**
 * Converte um código de dedução (`9xxx...`) para o código da receita
 * "positiva" equivalente, removendo o primeiro dígito `9`. Usado para
 * descobrir em **qual categoria** (IPTU, ISS, FPM, ICMS, ...) a dedução
 * deve ser aplicada ao calcular valores líquidos.
 *
 * Exemplos:
 * - `911125000000` (dedução IPTU MCASP) → `11125000000` → IPTU
 * - `91721010200` (FUNDEB sobre FPM STN) → `1721010200`  → TRANSFER_UNIAO_FPM
 * - `917215001001` (FUNDEB sobre ICMS MCASP) → `17215001001` → TRANSFER_ESTADO_ICMS
 */
export function deducaoToReceitaCode(codigoDeducao: string): string {
  const code = codigoDeducao.trim();
  return code.startsWith("9") ? code.substring(1) : code;
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
