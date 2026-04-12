/**
 * Tipos para o Anexo 12 — Demonstrativo das Receitas e Despesas com Ações
 * e Serviços Públicos de Saúde (ASPS).
 *
 * Referência: LC 141/2012, Art. 35 — RREO Anexo XII (Saúde).
 *
 * Os valores são calculados a partir dos Balancetes da Receita e da Despesa
 * da prefeitura (tabelas `receitas` e `despesas` no Turso). A estrutura
 * mantém o mesmo nome herdado do SIOPS para compatibilidade com a camada
 * de persistência (`siops_anexo12`).
 */

/** Dados de receita do demonstrativo. */
export interface SiopsReceitas {
  /** RECEITA DE IMPOSTOS (I) — realizada até o bimestre. */
  impostos: number;
  /** Detalhamento dos impostos. */
  iptu: number;
  itbi: number;
  iss: number;
  irrf: number;
  /** RECEITA DE TRANSFERÊNCIAS CONSTITUCIONAIS E LEGAIS (II). */
  transferencias: number;
  /** Detalhamento das transferências. */
  fpm: number;
  itr: number;
  ipva: number;
  icms: number;
  ipiExportacao: number;
  compensacoes: number;
  /** TOTAL (III) = (I) + (II). */
  total: number;
}

/** Despesas ASPS por subfunção (computadas ou não computadas no mínimo). */
export interface SiopsDespesasSubfuncao {
  atencaoBasica: number;
  assistenciaHospitalar: number;
  suporteProfilatico: number;
  vigilanciaSanitaria: number;
  vigilanciaEpidemiologica: number;
  alimentacaoNutricao: number;
  outrasSubfuncoes: number;
  total: number;
}

/** Apuração do cumprimento do limite mínimo de 15%. */
export interface SiopsApuracao {
  /** Total das Despesas com ASPS (XII). */
  totalDespesasAsps: { empenhada: number; liquidada: number; paga: number };
  /** (-) RP Inscritos Indevidamente (XIII). */
  rpInscritosIndevidamente: { empenhada: number; liquidada: number; paga: number };
  /** (-) Despesas custeadas c/ recursos vinculados (XIV). */
  despesasRecursosVinculados: { empenhada: number; liquidada: number; paga: number };
  /** (-) Despesas custeadas c/ disp. caixa de RP cancelados (XV). */
  despesasCaixaRpCancelados: { empenhada: number; liquidada: number; paga: number };
  /** (=) VALOR APLICADO EM ASPS (XVI). */
  valorAplicado: { empenhada: number; liquidada: number; paga: number };
  /** Despesa mínima = (III) × 15% (LC 141/2012) (XVII). */
  despesaMinima: number;
  /** Diferença (XVIII) = (XVI) - (XVII). */
  diferenca: { empenhada: number; liquidada: number; paga: number };
  /** PERCENTUAL APLICADO EM ASPS = (XVI / III) × 100. */
  percentualAplicado: { empenhada: number; liquidada: number; paga: number };
}

/** Receitas adicionais para financiamento da saúde. */
export interface SiopsReceitasAdicionais {
  /** RECEITAS DE TRANSFERÊNCIAS PARA A SAÚDE (XXIX). */
  transferencias: number;
  provenientesUniao: number;
  provenientesEstados: number;
  provenientesOutrosMunicipios: number;
  /** RECEITA DE OPERAÇÕES DE CRÉDITO (XXX). */
  operacoesCredito: number;
  /** OUTRAS RECEITAS (XXXI). */
  outras: number;
  /** TOTAL (XXXII). */
  total: number;
}

/** Despesas totais com saúde (próprios + transferidos). */
export interface SiopsDespesasTotais {
  /** TOTAL DAS DESPESAS COM SAÚDE (XLVIII). */
  totalSaude: { empenhada: number; liquidada: number; paga: number };
  /** TOTAL DAS DESPESAS EXECUTADAS COM RECURSOS PRÓPRIOS (XLIX). */
  totalProprios: { empenhada: number; liquidada: number; paga: number };
}

/** Estrutura completa do Anexo 12 do SIOPS. */
export interface SiopsAnexo12 {
  /** Metadados. */
  uf: string;
  ufSigla: string;
  municipio: string;
  codIbge: string;
  exercicioAno: number;
  bimestre: number;
  dataHomologacao: string;
  /** Receitas resultantes de impostos e transferências. */
  receitas: SiopsReceitas;
  /** Despesas ASPS com recursos próprios (computadas no mínimo). */
  despesasProprias: {
    empenhada: SiopsDespesasSubfuncao;
    liquidada: SiopsDespesasSubfuncao;
  };
  /** Apuração do cumprimento do limite mínimo. */
  apuracao: SiopsApuracao;
  /** Receitas adicionais para financiamento da saúde. */
  receitasAdicionais: SiopsReceitasAdicionais;
  /** Despesas não computadas no mínimo (custeadas com transferências). */
  despesasNaoComputadas: {
    empenhada: SiopsDespesasSubfuncao;
    liquidada: SiopsDespesasSubfuncao;
  };
  /** Despesas totais consolidadas. */
  despesasTotais: SiopsDespesasTotais;
}

/** Resultado da persistência no banco. */
export interface SiopsUpsertResult {
  success: boolean;
  action: "inserted" | "updated" | "unchanged";
  exercicioAno: number;
  bimestre: number;
  codIbge: string;
}
