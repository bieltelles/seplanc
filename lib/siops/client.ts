/**
 * Cliente HTTP para o SIOPS (http://siops.datasus.gov.br).
 *
 * O fluxo de consulta do Anexo 12 é:
 * 1. GET consleirespfiscal.php — retorna o formulário com selects de UF/Município/Ano/Bimestre.
 * 2. POST consleirespfiscal.php (ou rel_LRF.php) — submete os parâmetros e retorna o HTML.
 *
 * O servidor usa sessões PHP (PHPSESSID). O fluxo precisa:
 * - Preservar cookies entre requests.
 * - Enviar Content-Type: application/x-www-form-urlencoded.
 * - Decodificar ISO-8859-15 → UTF-8.
 *
 * Quando os parâmetros são incorretos, retorna um PDF com
 * "PASSAGEM DE PARÂMETROS INCORRETA" em vez de HTML.
 */

import type { SiopsFetchParams } from "./types";

const BASE_URL = "http://siops.datasus.gov.br";
const FORM_URL = `${BASE_URL}/consleirespfiscal.php`;
const REPORT_URL = `${BASE_URL}/rel_LRF.php`;
const TIMEOUT_MS = 30_000;

/**
 * Decodifica ArrayBuffer de ISO-8859-1/15 para string UTF-8.
 * O SIOPS declara ISO-8859-15 no meta charset.
 */
function decodeIso8859(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // TextDecoder com iso-8859-15 pode não estar disponível em todos os runtimes;
  // fallback para iso-8859-1 que cobre 99% dos caracteres do SIOPS.
  try {
    return new TextDecoder("iso-8859-15").decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

/**
 * Extrai cookies Set-Cookie de um Response e monta o header Cookie.
 */
function extractCookies(response: Response): string {
  const cookies: string[] = [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      const name = value.split(";")[0];
      if (name) cookies.push(name);
    }
  });
  return cookies.join("; ");
}

/**
 * Tenta descobrir os nomes dos campos do formulário fazendo GET na página do form.
 * Retorna os cookies da sessão PHP.
 */
async function initSession(): Promise<{ cookies: string; formAction: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(FORM_URL, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "SEMFAZ-Dashboard/1.0",
        Accept: "text/html",
      },
    });
    const cookies = extractCookies(res);

    // Tentar extrair o form action do HTML
    const buffer = await res.arrayBuffer();
    const html = decodeIso8859(buffer);

    const actionMatch = html.match(/<form[^>]*action="([^"]+)"/i);
    const formAction = actionMatch
      ? actionMatch[1].startsWith("http")
        ? actionMatch[1]
        : `${BASE_URL}/${actionMatch[1].replace(/^\//, "")}`
      : REPORT_URL;

    return { cookies, formAction };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Monta o body do POST com os parâmetros de consulta.
 * Os nomes dos campos são baseados no formulário do SIOPS (consleirespfiscal.php).
 *
 * Nomes conhecidos (podem variar):
 * - cmbUF / cmbMUNICIPIO / cmbANO / cmbPERIODO (schema 2012)
 * - Alternativas: uf / municipio / ano / periodo
 *
 * Tentamos ambos os formatos e o servidor aceita o que reconhecer.
 */
function buildFormBody(params: SiopsFetchParams): string {
  const fields: Record<string, string> = {
    // Schema clássico (SIOPS 2012+)
    cmbUF: String(params.uf),
    cmbMUNICIPIO: params.codMunicipio,
    cmbANO: String(params.ano),
    cmbPERIODO: String(params.bimestre),
    // Alternativas que podem ser necessárias
    opcao: "1", // 1 = município
    btnConsultar: "Consultar",
  };

  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * Busca o Anexo 12 do SIOPS para um município/ano/bimestre.
 *
 * @returns HTML do demonstrativo (já decodificado para UTF-8).
 * @throws Se o servidor retornar erro, PDF, ou timeout.
 */
export async function fetchSiopsAnexo12Html(
  params: SiopsFetchParams,
): Promise<string> {
  // 1. Inicia sessão e obtém cookies
  const { cookies, formAction } = await initSession();

  // 2. POST com parâmetros
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = buildFormBody(params);
    const res = await fetch(formAction, {
      method: "POST",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "SEMFAZ-Dashboard/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body,
    });

    const contentType = res.headers.get("content-type") || "";
    const buffer = await res.arrayBuffer();

    // Se retornou PDF → parâmetros incorretos
    if (
      contentType.includes("application/pdf") ||
      isPdf(buffer)
    ) {
      throw new Error(
        `SIOPS retornou PDF (parâmetros incorretos): UF=${params.uf} MUN=${params.codMunicipio} ANO=${params.ano} BIM=${params.bimestre}`,
      );
    }

    const html = decodeIso8859(buffer);

    // Validação básica: deve conter tabela de receitas
    if (!html.includes("RECEITA DE IMPOSTOS") && !html.includes("RECEITAS RESULTANTES")) {
      // Pode ser página de erro ou formulário novamente
      if (html.includes("PASSAGEM DE PAR")) {
        throw new Error("SIOPS: PASSAGEM DE PARÂMETROS INCORRETA");
      }
      throw new Error(
        `SIOPS retornou HTML sem dados do Anexo 12. Content-Length: ${buffer.byteLength}`,
      );
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

/** Checa se um buffer começa com %PDF- */
function isPdf(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const bytes = new Uint8Array(buffer, 0, 5);
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d    // -
  );
}

/**
 * Configuração padrão para São Luís/MA.
 * Pode ser estendida para outros municípios no futuro.
 */
export const SAO_LUIS_PARAMS = {
  uf: 21,
  codMunicipio: "211130",
} as const;
