/**
 * Cliente para a API do Banco Central do Brasil - Sistema Gerenciador de Séries Temporais (SGS).
 * Série 433: IPCA - Variação mensal (%)
 * Fonte: https://dadosabertos.bcb.gov.br/dataset/433-indice-nacional-de-precos-ao-consumidor-amplo-ipca
 * Documentação da API: https://www3.bcb.gov.br/sgspub/
 */

export interface BcbIpcaEntry {
  data: string; // Formato DD/MM/YYYY
  valor: string; // Ex: "0.42" (variação mensal em %)
}

export interface IpcaEntry {
  ano: number;
  mes: number;
  variacao: number; // % (ex: 0.42 para 0.42%)
  dataReferencia: string; // DD/MM/YYYY
}

export const BCB_IPCA_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json";

export const IPCA_FONTE_URL =
  "https://dadosabertos.bcb.gov.br/dataset/433-indice-nacional-de-precos-ao-consumidor-amplo-ipca";

export const IPCA_FONTE_NOME =
  "Banco Central do Brasil - Sistema Gerenciador de Séries Temporais (SGS), série 433 (IPCA mensal do IBGE)";

/**
 * Busca a série completa do IPCA mensal no BCB.
 * Opcionalmente filtra a partir de uma data inicial (DD/MM/YYYY).
 */
export async function fetchIpcaFromBcb(dataInicial?: string): Promise<IpcaEntry[]> {
  let url = BCB_IPCA_URL;
  if (dataInicial) {
    url += `&dataInicial=${encodeURIComponent(dataInicial)}`;
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SEMFAZ-Dashboard/1.0",
    },
    // Evita cache agressivo do Next.js
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Erro ao buscar IPCA no BCB: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as BcbIpcaEntry[];

  return data.map((entry) => {
    const [dia, mes, ano] = entry.data.split("/").map((x) => parseInt(x, 10));
    return {
      ano,
      mes,
      variacao: parseFloat(entry.valor),
      dataReferencia: entry.data,
    };
  });
}
