/**
 * Correção monetária baseada em IPCA.
 *
 * Convenção:
 * - A variação mensal do IPCA do mês M representa a inflação ocorrida DURANTE o mês M.
 * - Um valor com competência no mês M/Y está expresso ao final do mês M/Y.
 * - Para trazer esse valor para o final do mês T/Y2 (T > M em Y2 >= Y), aplicamos
 *   a inflação dos meses (M+1)/Y, (M+2)/Y, ..., T/Y2.
 *
 * Juros compostos (padrão IBGE/oficial):
 *   fator = (1 + r1/100) * (1 + r2/100) * ... * (1 + rn/100)
 *
 * Juros simples:
 *   fator = 1 + (r1 + r2 + ... + rn) / 100
 */

export type TipoJuros = "compostos" | "simples";

export interface IpcaMap {
  // chave "YYYY-MM" (ex: "2024-01") → variação mensal em %
  get(key: string): number | undefined;
}

function ipcaKey(ano: number, mes: number): string {
  return `${ano}-${mes}`;
}

/**
 * Calcula o fator de correção entre duas datas (fim do mês fromYear/fromMonth → fim do mês toYear/toMonth).
 * Retorna 1 se as datas forem iguais ou toDate anterior a fromDate.
 */
export function getCorrectionFactor(
  ipca: IpcaMap,
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
  tipo: TipoJuros = "compostos",
): number {
  // Se destino <= origem, não há correção
  if (toYear < fromYear || (toYear === fromYear && toMonth <= fromMonth)) {
    return 1;
  }

  let year = fromYear;
  let month = fromMonth + 1;
  if (month > 12) {
    month = 1;
    year++;
  }

  if (tipo === "compostos") {
    let factor = 1;
    while (year < toYear || (year === toYear && month <= toMonth)) {
      const v = ipca.get(ipcaKey(year, month));
      if (v !== undefined) {
        factor *= 1 + v / 100;
      }
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    return factor;
  } else {
    let sum = 0;
    while (year < toYear || (year === toYear && month <= toMonth)) {
      const v = ipca.get(ipcaKey(year, month));
      if (v !== undefined) {
        sum += v;
      }
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    return 1 + sum / 100;
  }
}

/**
 * Calcula o ano-alvo da correção (31/12 do exercício anterior ao corrente).
 * Retorna o ano para o qual os valores devem ser corrigidos.
 */
export function getTargetYear(currentYear?: number): number {
  const year = currentYear ?? new Date().getFullYear();
  return year - 1;
}

/**
 * Verifica se um exercício deve ser corrigido.
 * O exercício corrente (currentYear) nunca é corrigido.
 */
export function shouldCorrectYear(exercicioAno: number, currentYear?: number): boolean {
  const cy = currentYear ?? new Date().getFullYear();
  return exercicioAno < cy;
}

/**
 * Corrige um valor monetário de uma competência mensal para o fim do ano-alvo.
 * Para valores do ano-alvo, aplica IPCA apenas dos meses seguintes até dezembro.
 * Para valores do exercício corrente, retorna o valor sem alteração.
 */
export function correctMonthlyValue(
  value: number,
  exercicioAno: number,
  mes: number, // 1-12
  ipca: IpcaMap,
  options: { tipoJuros?: TipoJuros; currentYear?: number } = {},
): number {
  const { tipoJuros = "compostos", currentYear } = options;
  if (!shouldCorrectYear(exercicioAno, currentYear)) return value;

  const targetYear = getTargetYear(currentYear);
  const factor = getCorrectionFactor(
    ipca,
    exercicioAno,
    mes,
    targetYear,
    12,
    tipoJuros,
  );
  return value * factor;
}

/**
 * Corrige um valor orçado de um exercício.
 * Convenção: o orçado é considerado expresso em valores de 31/12 do ano anterior
 * ao exercício (data típica de aprovação da LOA). Logo, corrigimos a partir de dezembro/(ano-1).
 */
export function correctOrcado(
  value: number,
  exercicioAno: number,
  ipca: IpcaMap,
  options: { tipoJuros?: TipoJuros; currentYear?: number } = {},
): number {
  const { tipoJuros = "compostos", currentYear } = options;
  if (!shouldCorrectYear(exercicioAno, currentYear)) return value;

  const targetYear = getTargetYear(currentYear);
  // Base: dezembro do ano anterior ao exercício
  const factor = getCorrectionFactor(
    ipca,
    exercicioAno - 1,
    12,
    targetYear,
    12,
    tipoJuros,
  );
  return value * factor;
}

/**
 * Representa uma linha com valores mensais já corrigidos.
 */
export interface MonthlyCorrected {
  janeiro: number;
  fevereiro: number;
  marco: number;
  abril: number;
  maio: number;
  junho: number;
  julho: number;
  agosto: number;
  setembro: number;
  outubro: number;
  novembro: number;
  dezembro: number;
  acumulado: number;
  orcado: number;
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/**
 * Corrige um conjunto de valores mensais de um exercício.
 * Retorna objeto com os mesmos campos, mas corrigidos.
 * Acumulado é recalculado como soma dos meses corrigidos.
 */
export function correctMonthlyRow(
  row: Record<string, unknown>,
  exercicioAno: number,
  ipca: IpcaMap,
  options: { tipoJuros?: TipoJuros; currentYear?: number } = {},
): MonthlyCorrected {
  const getNum = (key: string): number => {
    const v = row[key];
    return typeof v === "number" ? v : 0;
  };

  if (!shouldCorrectYear(exercicioAno, options.currentYear)) {
    return {
      janeiro: getNum("janeiro"),
      fevereiro: getNum("fevereiro"),
      marco: getNum("marco"),
      abril: getNum("abril"),
      maio: getNum("maio"),
      junho: getNum("junho"),
      julho: getNum("julho"),
      agosto: getNum("agosto"),
      setembro: getNum("setembro"),
      outubro: getNum("outubro"),
      novembro: getNum("novembro"),
      dezembro: getNum("dezembro"),
      acumulado: getNum("acumulado"),
      orcado: getNum("orcado"),
    };
  }

  const corrected: MonthlyCorrected = {
    janeiro: 0, fevereiro: 0, marco: 0, abril: 0, maio: 0, junho: 0,
    julho: 0, agosto: 0, setembro: 0, outubro: 0, novembro: 0, dezembro: 0,
    acumulado: 0, orcado: 0,
  };

  let acumuladoCorrigido = 0;
  for (let i = 0; i < 12; i++) {
    const name = MONTH_NAMES[i];
    const v = getNum(name);
    const c = correctMonthlyValue(v, exercicioAno, i + 1, ipca, options);
    corrected[name] = c;
    acumuladoCorrigido += c;
  }

  corrected.acumulado = acumuladoCorrigido;
  corrected.orcado = correctOrcado(getNum("orcado"), exercicioAno, ipca, options);

  return corrected;
}
