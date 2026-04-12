/**
 * Cliente HTTP para o SIOPS (siops.datasus.gov.br).
 *
 * Estratégia de consulta do Anexo 12:
 *
 * 1ª tentativa — Sessão + POST:
 *    GET consleirespfiscal.php → extrai PHPSESSID
 *    POST com cookies → HTML do demonstrativo
 *
 * 2ª tentativa — GET direto com query params:
 *    GET rel_LRF.php?S=1&UF=...&Municipio=...&Ano=...&Periodo=...
 *
 * Ambas são tentadas em HTTPS primeiro, depois HTTP como fallback.
 * O servidor usa sessões PHP e encoding ISO-8859-15.
 */

import type { SiopsFetchParams } from "./types";

const BASES = [
  "https://siops.datasus.gov.br",
  "http://siops.datasus.gov.br",
];
const TIMEOUT_MS = 20_000;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Decodifica ArrayBuffer de ISO-8859-1/15 para string UTF-8.
 * O SIOPS declara ISO-8859-15 no meta charset.
 */
function decodeIso8859(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
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

/** Valida que o HTML contém dados do Anexo 12 */
function validateSiopsHtml(html: string, expectedBimestre?: number): void {
  if (!html.includes("RECEITA DE IMPOSTOS") && !html.includes("RECEITAS RESULTANTES")) {
    if (html.includes("PASSAGEM DE PAR")) {
      throw new Error("SIOPS: PASSAGEM DE PARÂMETROS INCORRETA");
    }
    throw new Error("SIOPS retornou HTML sem dados do Anexo 12");
  }

  // Valida que o bimestre no HTML corresponde ao solicitado
  if (expectedBimestre) {
    const bimMatch = html.match(/(\d)\s*.?\s*Bimestre\s+de\s+(\d{4})/i);
    if (bimMatch) {
      const returnedBim = parseInt(bimMatch[1], 10);
      if (returnedBim !== expectedBimestre) {
        throw new Error(
          `SIOPS retornou ${returnedBim}º bimestre em vez do ${expectedBimestre}º solicitado. ` +
          `O ${expectedBimestre}º bimestre pode não estar disponível ainda.`,
        );
      }
    }
  }
}

/**
 * Estratégia 1: GET direto com query params.
 * Tenta duas URLs com nomes de parâmetro do formulário SIOPS.
 */
async function tryDirectGet(
  baseUrl: string,
  params: SiopsFetchParams,
): Promise<string> {
  // Nomes de parâmetros iguais ao formulário do SIOPS (cmbUF, cmbPERIODO etc.)
  const cmbParams = new URLSearchParams({
    cmbUF: String(params.uf),
    cmbMUNICIPIO: params.codMunicipio,
    cmbANO: String(params.ano),
    cmbPERIODO: String(params.bimestre),
    opcao: "1",
    btnConsultar: "Consultar",
  });

  // Tenta duas URLs: consleirespfiscal.php (form principal) e rel_LRF.php
  const urls = [
    `${baseUrl}/consleirespfiscal.php?${cmbParams}`,
    `${baseUrl}/rel_LRF.php?${cmbParams}`,
  ];

  let lastError: Error | null = null;

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,*/*",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });

      const buffer = await res.arrayBuffer();
      if (isPdf(buffer)) {
        lastError = new Error("SIOPS retornou PDF via GET direto");
        continue;
      }

      const html = decodeIso8859(buffer);
      validateSiopsHtml(html, params.bimestre);
      return html;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("GET direto falhou");
}

/**
 * Estratégia 2: Sessão PHP + POST (fluxo original do formulário).
 */
async function trySessionPost(
  baseUrl: string,
  params: SiopsFetchParams,
): Promise<string> {
  const formUrl = `${baseUrl}/consleirespfiscal.php`;
  const reportUrl = `${baseUrl}/rel_LRF.php`;

  // Passo 1: GET na página do formulário → cookies
  const controller1 = new AbortController();
  const t1 = setTimeout(() => controller1.abort(), TIMEOUT_MS);
  let cookies: string;
  let formAction: string;

  try {
    const res = await fetch(formUrl, {
      signal: controller1.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });
    cookies = extractCookies(res);
    const buffer = await res.arrayBuffer();
    const html = decodeIso8859(buffer);
    const actionMatch = html.match(/<form[^>]*action="([^"]+)"/i);
    formAction = actionMatch
      ? actionMatch[1].startsWith("http")
        ? actionMatch[1]
        : `${baseUrl}/${actionMatch[1].replace(/^\//, "")}`
      : reportUrl;
  } finally {
    clearTimeout(t1);
  }

  // Passo 2: POST com parâmetros + cookies
  const body = [
    `cmbUF=${params.uf}`,
    `cmbMUNICIPIO=${encodeURIComponent(params.codMunicipio)}`,
    `cmbANO=${params.ano}`,
    `cmbPERIODO=${params.bimestre}`,
    `opcao=1`,
    `btnConsultar=Consultar`,
  ].join("&");

  const controller2 = new AbortController();
  const t2 = setTimeout(() => controller2.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(formAction, {
      method: "POST",
      signal: controller2.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body,
    });

    const buffer = await res.arrayBuffer();
    if (isPdf(buffer)) {
      throw new Error("SIOPS retornou PDF (parâmetros incorretos)");
    }

    const html = decodeIso8859(buffer);
    validateSiopsHtml(html, params.bimestre);
    return html;
  } finally {
    clearTimeout(t2);
  }
}

/**
 * Busca o Anexo 12 do SIOPS para um município/ano/bimestre.
 *
 * Tenta múltiplas estratégias em sequência:
 * 1. GET direto (HTTPS)
 * 2. GET direto (HTTP)
 * 3. Sessão+POST (HTTPS)
 * 4. Sessão+POST (HTTP)
 *
 * @returns HTML do demonstrativo (já decodificado para UTF-8).
 * @throws Se todas as tentativas falharem.
 */
export async function fetchSiopsAnexo12Html(
  params: SiopsFetchParams,
): Promise<string> {
  const errors: string[] = [];

  // Tenta GET direto (mais simples, menos chance de falha de sessão)
  for (const base of BASES) {
    try {
      return await tryDirectGet(base, params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`GET ${base}: ${msg}`);
    }
  }

  // Tenta Sessão + POST (fluxo completo do formulário)
  for (const base of BASES) {
    try {
      return await trySessionPost(base, params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`POST ${base}: ${msg}`);
    }
  }

  throw new Error(
    `Não foi possível acessar o SIOPS após 4 tentativas. ` +
    `Use a opção "Importar HTML" na página de Upload para importar manualmente. ` +
    `Detalhes: ${errors.join(" | ")}`,
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
