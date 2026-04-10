/**
 * Tipos para geração de apresentação de Audiência Pública LRF.
 *
 * As audiências são trimestralmente obrigatórias (LC 101/2000, Art. 9º, § 4º)
 * e ocorrem ao final de MAI (1Q), SET (2Q) e FEV (3Q do ano anterior).
 *
 * Premissas:
 * - 1Q e 2Q: valores **parciais** (jan-abr / jan-ago). Despesas **liquidadas**
 *   para cálculo de índices. Histórico comparado nos mesmos meses dos anos
 *   anteriores.
 * - 3Q: valores **totais** (jan-dez). Despesas **empenhadas** para cálculo
 *   de índices. Histórico comparado ano a ano completo.
 * - Valores dos anos anteriores ao "ano da audiência" são corrigidos pelo
 *   IPCA até 31/12 do ano anterior (pivô configurável).
 * - Valores do próprio exercício da audiência: moeda corrente (SICONFI).
 * - Líquidos de FUNDEB e Intraorçamentárias.
 */

export type Quadrimestre = 1 | 2 | 3;

export interface AudienciaParams {
  /** Ano do exercício da audiência. */
  ano: number;
  /** Qual quadrimestre está sendo apresentado. */
  quadrimestre: Quadrimestre;
  /** Data da apresentação (dd/mm/yyyy). */
  dataApresentacao: string;
  /** Nome do apresentador. */
  apresentador: string;
  /** Cargo do apresentador. */
  cargoApresentador: string;
  /** Número do Ofício Expedido SEMFAZ→CMSL com data (ex: "102/2026 (05.02.2026)"). */
  oficioSemfaz?: string;
  /** Número do Ofício Expedido CMSL→SEMFAZ com data. */
  oficioCamara?: string;
  /** Ano base/pivô da correção monetária (valores deste ano e posteriores ficam em moeda corrente). Padrão = `ano`. */
  anoBaseCorrecao?: number;
}

// ========== Receitas por categoria (slides 8-27) ==========

export interface CategoriaReceitaDetalhe {
  categoria: string;
  label: string;
  valorArrecadado: number;
  /** Valores por ano de cada um dos 5 anos (exercicio-4 .. exercicio). */
  historicoAnual: { ano: number; valor: number }[];
  /** Crescimento percentual no horizonte de 5 anos (ex-4 → ex). */
  crescimento5a: number;
  /** Crescimento percentual ano-a-ano (ex-1 → ex). */
  crescimentoAnual: number;
}

// ========== Dependência Financeira (slide 28) ==========

export interface DependenciaFinanceiraAno {
  ano: number;
  proprios: number;
  transferidos: number;
  percentProprios: number;
  percentTransferidos: number;
}

// ========== Balanço Orçamentário (slides 30-32) ==========

export interface BalancoOrcamentarioLinha {
  rotulo: string;
  anoAnterior: number;
  anoAtual: number;
  diferenca: number;
}

export interface BalancoOrcamentarioData {
  receitas: BalancoOrcamentarioLinha[]; // Correntes, Capital, Intra, SUBTOTAL
  despesas: BalancoOrcamentarioLinha[]; // Correntes, Capital, Reserva, Intra, SUBTOTAL
  resultadoSuperavit: {
    anoAnterior: number;
    anoAtual: number;
  };
}

// ========== RCL (slide 34) ==========

export interface RclData {
  /** RCL (soma dos últimos 12 meses da col. TOTAL). */
  valorTotal: number;
  /** RCL ajustada para cálculo dos limites de endividamento. */
  ajustadaEndividamento: number;
  /** RCL ajustada para cálculo dos limites de despesa com pessoal. */
  ajustadaPessoal: number;
}

// ========== Resultado Primário e Nominal (slide 35) ==========

export interface ResultadosData {
  resultadoPrimario: number;
  /** DCL do quadrimestre do ano anterior. */
  dclAnterior: number;
  /** DCL do quadrimestre do ano atual. */
  dclAtual: number;
  /** Diferença = dclAtual - dclAnterior (resultado nominal). */
  resultadoNominal: number;
}

// ========== Indicadores Educação (slide 36) ==========

export interface IndicadorEducacaoData {
  receitaImpostos: number;
  receitaTransferencias: number;
  receitaTotal: number;
  minimoMde: number; // 25% da receita total
  aplicadoMde: number;
  percentualMde: number;
  destinadoFundeb: number; // 20%
  retornoFundeb: number;
  resultadoLiquidoFundeb: number;
  fundebProfissionaisMinimo: number; // 70%
  fundebProfissionaisAplicado: number;
  fundebProfissionaisPercentual: number;
}

// ========== Indicadores Saúde (slide 37) ==========

export interface IndicadorSaudeData {
  receitaImpostos: number;
  receitaTransferencias: number;
  receitaTotal: number;
  minimoAsps: number; // 15%
  aplicadoAsps: number;
  percentualAsps: number;
}

// ========== RGF: Despesas de Pessoal (slide 39) ==========

export interface PessoalData {
  dtp: number; // Despesa total com pessoal
  rclAjustada: number; // RCL ajustada para pessoal
  percentualDtp: number; // % DTP / RCL ajustada
  limiteMaximo: number; // 54% RCL
  limitePrudencial: number; // 51,3% RCL
  limiteAlerta: number; // 48,6% RCL
}

// ========== RGF: Dívida Consolidada (slide 40) ==========

export interface DividaConsolidadaData {
  dc: number;
  deducoesTotal: number;
  dcl: number;
  rclAjustada: number; // RCL ajustada p/ endividamento
  percentualDc: number;
  percentualDcl: number;
  limiteMaximo: number; // 120% RCL
  disponibilidadeCaixa: number;
  restosAPagar: number;
  depositosRestituiveis: number;
  demaisHaveres: number;
}

// ========== RGF: Composição da Dívida (slide 41) ==========

export interface ComposicaoDividaLinha {
  tipo: string;
  anoAnterior: number;
  anoAtual: number;
}

// ========== RGF: Operações de Crédito (slide 43) ==========

export interface OperacoesCreditoData {
  rclAjustada: number;
  limiteGeral: number; // 16% RCL
  limiteAlerta: number; // 14,4% RCL
  valorRealizado: number;
}

// ========== Master: dados completos para gerar a apresentação ==========

export interface AudienciaData {
  params: AudienciaParams;
  /** Período referente (ex: "jan-dez/2025" ou "jan-abr/2025"). */
  periodoRef: string;
  /** Rótulo curto do quadrimestre (ex: "3º Quadrimestre - 2025"). */
  tituloQuadrimestre: string;

  // Tributárias (slides 8-13)
  tributarias: {
    iss: CategoriaReceitaDetalhe;
    iptu: CategoriaReceitaDetalhe;
    itbi: CategoriaReceitaDetalhe;
    ir: CategoriaReceitaDetalhe;
    taxas: CategoriaReceitaDetalhe;
    total: number;
  };

  // Contribuições (slides 14-15)
  contribuicoes: {
    sociais: CategoriaReceitaDetalhe;
    cosip: CategoriaReceitaDetalhe;
  };

  // Patrimoniais, Outras Correntes (slides 16-17)
  receitaPatrimonial: CategoriaReceitaDetalhe;
  outrasReceitasCorrentes: CategoriaReceitaDetalhe;

  // Transferências (slides 19-27)
  transferencias: {
    total: CategoriaReceitaDetalhe;
    uniaoFpm: CategoriaReceitaDetalhe;
    uniaoSus: CategoriaReceitaDetalhe;
    uniaoOutras: CategoriaReceitaDetalhe;
    estadoIcms: CategoriaReceitaDetalhe;
    estadoIpva: CategoriaReceitaDetalhe;
    estadoOutras: CategoriaReceitaDetalhe;
  };

  dependenciaFinanceira: DependenciaFinanceiraAno[];

  balancoOrcamentario: BalancoOrcamentarioData | null;
  rcl: RclData | null;
  resultados: ResultadosData | null;
  indicadorEducacao: IndicadorEducacaoData | null;
  indicadorSaude: IndicadorSaudeData | null;
  pessoal: PessoalData | null;
  dividaConsolidada: DividaConsolidadaData | null;
  composicaoDivida: ComposicaoDividaLinha[];
  operacoesCredito: OperacoesCreditoData | null;
}
