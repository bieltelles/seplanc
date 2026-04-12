import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/dev/siops-probe
 *
 * Endpoint DIAGNÓSTICO — faz um GET no SIOPS (Anexo 12 do RREO) sem parsear
 * nada de verdade, apenas reporta a estrutura do HTML para desenhar depois
 * o parser definitivo.
 *
 * Parâmetros (todos opcionais — defaults apontam para São Luís/MA, 2025, 6º bim):
 *   - uf   : código IBGE da UF      (default 21 = Maranhão)
 *   - mun  : código IBGE-6 do mun.  (default 211130 = São Luís)
 *   - ano  : exercício              (default 2025)
 *   - per  : bimestre 1..6          (default 6)
 *   - raw  : "1" para incluir o HTML completo no payload (cuidado com o tamanho)
 *   - url  : permite sobrescrever a URL inteira — útil para testar variações
 *
 * Exemplo de uso:
 *   GET /api/dev/siops-probe
 *   GET /api/dev/siops-probe?ano=2024&per=6
 *   GET /api/dev/siops-probe?raw=1
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIOPS_BASE = "http://siops.datasus.gov.br/consleirespfiscalstn.php";
const SIOPS_BASE_HTTPS = "https://siops.datasus.gov.br/consleirespfiscalstn.php";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Helpers de inspeção (regex, sem cheerio)
// ---------------------------------------------------------------------------

function countTag(html: string, tag: string): number {
  const re = new RegExp(`<${tag}\\b`, "gi");
  return (html.match(re) || []).length;
}

interface FormInfo {
  action: string;
  method: string;
  inputs: number;
  selects: number;
  hiddenFields: Array<{ name: string; value: string }>;
}

function extractForms(html: string): FormInfo[] {
  const forms: FormInfo[] = [];
  const re = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const open = m[0].match(/<form\b[^>]*>/i)?.[0] || "";
    const action = /action\s*=\s*["']([^"']*)["']/i.exec(open)?.[1] || "";
    const method = (/method\s*=\s*["']([^"']*)["']/i.exec(open)?.[1] || "GET").toUpperCase();
    const body = m[1] || "";
    const inputs = countTag(body, "input");
    const selects = countTag(body, "select");

    // Captura inputs hidden (potenciais CSRF tokens, session ids etc.)
    const hiddenFields: Array<{ name: string; value: string }> = [];
    const hiddenRe = /<input\b([^>]*type\s*=\s*["']hidden["'][^>]*)>/gi;
    let h: RegExpExecArray | null;
    while ((h = hiddenRe.exec(body)) !== null) {
      const attrs = h[1];
      const name = /name\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || "";
      const value = /value\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || "";
      hiddenFields.push({ name, value: value.slice(0, 120) });
    }

    forms.push({ action, method, inputs, selects, hiddenFields });
  }
  return forms;
}

interface SelectInfo {
  name: string;
  optionCount: number;
  firstOptions: Array<{ value: string; label: string }>;
}

function extractSelectOptions(html: string): SelectInfo[] {
  const selects: SelectInfo[] = [];
  const re = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const name = /name\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || "";

    const firstOptions: Array<{ value: string; label: string }> = [];
    const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let o: RegExpExecArray | null;
    let count = 0;
    while ((o = optRe.exec(body)) !== null) {
      count++;
      if (firstOptions.length < 8) {
        const optAttrs = o[1] || "";
        const value = /value\s*=\s*["']([^"']*)["']/i.exec(optAttrs)?.[1] || "";
        const label = (o[2] || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        firstOptions.push({ value, label: label.slice(0, 80) });
      }
    }
    selects.push({ name, optionCount: count, firstOptions });
  }
  return selects;
}

interface TablePreview {
  index: number;
  rows: number;
  cells: number;
  firstCells: string[];
  classNames: string | null;
}

function extractTables(html: string, max: number): TablePreview[] {
  const tables: TablePreview[] = [];
  const re = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(html)) !== null && idx < max) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const rows = countTag(body, "tr");
    const cells = countTag(body, "td") + countTag(body, "th");
    const classNames = /class\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || null;

    const firstCells: string[] = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(body)) !== null && firstCells.length < 20) {
      const text = (c[1] || "")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
      if (text) firstCells.push(text.slice(0, 120));
    }
    tables.push({ index: idx, rows, cells, firstCells, classNames });
    idx++;
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Decoder com detecção de encoding (SIOPS historicamente serve ISO-8859-1)
// ---------------------------------------------------------------------------

function decodeBytes(buffer: ArrayBuffer, encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

interface DecodeResult {
  text: string;
  encoding: string;
  reason: string;
}

function smartDecode(buffer: ArrayBuffer, contentTypeHeader: string): DecodeResult {
  // 1) Respeita charset declarado no header
  const ctMatch = /charset\s*=\s*([^;\s]+)/i.exec(contentTypeHeader);
  if (ctMatch) {
    const enc = ctMatch[1].trim().toLowerCase();
    return {
      text: decodeBytes(buffer, enc),
      encoding: enc,
      reason: "content-type header",
    };
  }

  // 2) Tenta UTF-8 e checa se tem mojibake típico de latin1 lido como utf-8
  const utf8 = decodeBytes(buffer, "utf-8");
  const mojibakeCount = (utf8.match(/Ã[§£©¡³ºª¢]/g) || []).length;
  const hasReplacementChar = utf8.includes("\uFFFD");

  if (mojibakeCount > 3 || hasReplacementChar) {
    return {
      text: decodeBytes(buffer, "iso-8859-1"),
      encoding: "iso-8859-1",
      reason: `auto-detected (${mojibakeCount} mojibake, replacement=${hasReplacementChar})`,
    };
  }

  // 3) Checa meta charset dentro do próprio HTML
  const metaCharset = /<meta[^>]*charset\s*=\s*["']?([^"'>\s]+)/i.exec(utf8.slice(0, 4096));
  if (metaCharset) {
    const enc = metaCharset[1].toLowerCase();
    if (enc !== "utf-8" && enc !== "utf8") {
      return {
        text: decodeBytes(buffer, enc),
        encoding: enc,
        reason: "meta charset",
      };
    }
  }

  return { text: utf8, encoding: "utf-8", reason: "default" };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function probe(targetUrl: string, started: number) {
  const res = await fetch(targetUrl, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
    },
    redirect: "follow",
    cache: "no-store",
  });

  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const buffer = await res.arrayBuffer();
  const contentType = (headers["content-type"] || "").toLowerCase();
  const isHtml =
    contentType.includes("html") ||
    (contentType === "" && !looksLikePdf(buffer)) ||
    contentType.startsWith("text/");
  const isPdf = contentType.includes("pdf") || looksLikePdf(buffer);

  let decoded: DecodeResult = { text: "", encoding: "n/a", reason: "not html" };
  if (isHtml) {
    decoded = smartDecode(buffer, contentType);
  }

  // Inspeção de PDF — SIOPS retorna PDF direto em vez de HTML
  let pdfInfo: PdfInfo | null = null;
  if (isPdf) {
    pdfInfo = inspectPdf(buffer);
  }

  const html = decoded.text;
  const snippetHead = html.slice(0, 6000);
  const snippetTail = html.length > 6000 ? html.slice(-2500) : null;

  const title = /<title\b[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || null;
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]*>/g, "").trim() || null;

  const stats = {
    formCount: countTag(html, "form"),
    tableCount: countTag(html, "table"),
    trCount: countTag(html, "tr"),
    tdCount: countTag(html, "td"),
    thCount: countTag(html, "th"),
    inputCount: countTag(html, "input"),
    selectCount: countTag(html, "select"),
    optionCount: countTag(html, "option"),
    scriptCount: countTag(html, "script"),
    linkCount: countTag(html, "a"),
    imgCount: countTag(html, "img"),
  };

  const forms = extractForms(html);
  const selects = extractSelectOptions(html);
  const tablesPreview = extractTables(html, 5);

  // Heurísticas para detectar erro ou ausência de dados
  const heuristics = {
    semDados: /sem dados|n[aã]o h[aá] dados|nenhum (registro|dado)/i.test(html),
    naoTransmitido: /n[aã]o transmitido|n[aã]o homologa/i.test(html),
    erroExplicito: /<h1[^>]*>\s*erro/i.test(html) || /fatal error|warning/i.test(html),
    pedeJavaScript: /noscript/i.test(html),
    temFrameset: /<frameset|<frame\b/i.test(html),
    temIframe: /<iframe\b/i.test(html),
    mencionaAnexo12: /anexo\s*(12|xii)/i.test(html),
    mencionaSaude: /sa[uú]de/i.test(html),
    mencionaRCL: /receita corrente l[ií]quida|\bRCL\b/i.test(html),
    temSaoLuis: /s[aã]o lu[ií]s/i.test(html),
  };

  return {
    success: true,
    durationMs: Date.now() - started,
    requestUrl: targetUrl,
    response: {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      redirected: res.redirected,
      finalUrl: res.url,
      contentType,
      byteLength: buffer.byteLength,
      encoding: decoded.encoding,
      encodingReason: decoded.reason,
    },
    headers,
    html: {
      title,
      h1,
      totalLength: html.length,
      snippetHeadLength: snippetHead.length,
      snippetHead,
      snippetTail,
    },
    stats,
    forms,
    selects,
    tablesPreview,
    heuristics,
    pdf: pdfInfo,
  };
}

// ---------------------------------------------------------------------------
// Inspeção de PDF (sem dependências externas)
// ---------------------------------------------------------------------------

function looksLikePdf(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const bytes = new Uint8Array(buffer, 0, 5);
  // %PDF-
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

interface PdfInfo {
  magic: string;
  version: string | null;
  hasEof: boolean;
  byteLength: number;
  base64: string;
  base64Truncated: boolean;
  extractedStrings: string[];
  mentionsAnexo12: boolean;
  mentionsSaude: boolean;
  mentionsSaoLuis: boolean;
  mentionsSemDados: boolean;
  mentionsNaoTransmitido: boolean;
  heuristicAnalysis: string;
}

function inspectPdf(buffer: ArrayBuffer): PdfInfo {
  const bytes = new Uint8Array(buffer);
  const raw = new TextDecoder("latin1").decode(bytes);

  const magic = raw.slice(0, 8);
  const versionMatch = /^%PDF-(\d+\.\d+)/.exec(magic);
  const version = versionMatch?.[1] || null;
  const hasEof = raw.includes("%%EOF");

  // Extrai strings de texto visíveis dos content streams do PDF.
  // PDFs usam tokens (texto) Tj/TJ dentro de BT...ET para texto.
  // Aqui pegamos uma heurística simples: strings entre parênteses
  // não-balanceados, que é onde o PDF normalmente guarda texto Tj.
  const extractedSet = new Set<string>();
  const stringRe = /\(((?:[^\\()]|\\[\\()nrtbf]|\\\d{1,3})*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = stringRe.exec(raw)) !== null) {
    let s = m[1];
    // Unescape sequências PDF básicas
    s = s.replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
    s = s.replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    s = s.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
    const trimmed = s.trim();
    if (trimmed.length >= 2 && /\S/.test(trimmed)) {
      extractedSet.add(trimmed.slice(0, 200));
    }
  }
  const extractedStrings = Array.from(extractedSet).slice(0, 200);

  // Busca por hex strings <...> (também usadas em PDFs)
  const hexRe = /<([0-9a-fA-F\s]+)>/g;
  let h: RegExpExecArray | null;
  let hexCount = 0;
  while ((h = hexRe.exec(raw)) !== null && hexCount < 50) {
    try {
      const hex = h[1].replace(/\s+/g, "");
      if (hex.length >= 4 && hex.length % 2 === 0) {
        let decoded = "";
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substring(i, i + 2), 16);
          if (code >= 32 && code < 127) decoded += String.fromCharCode(code);
          else if (code !== 0) decoded += "?";
        }
        if (/[A-Za-z]{3}/.test(decoded)) {
          extractedSet.add(decoded.trim().slice(0, 200));
          hexCount++;
        }
      }
    } catch {
      /* skip */
    }
  }

  // Base64 — PDFs pequenos retornamos inteiros (até 60KB);
  // acima disso só os primeiros 20KB.
  const MAX_BASE64 = 60 * 1024;
  const truncated = bytes.byteLength > MAX_BASE64;
  const slice = truncated ? bytes.subarray(0, 20 * 1024) : bytes;
  // Buffer.from funciona em Node runtime
  const base64 = Buffer.from(slice).toString("base64");

  const joined = extractedStrings.join(" ").toLowerCase();
  const mentionsAnexo12 = /anexo\s*(12|xii)/i.test(joined);
  const mentionsSaude = /sa[uú]de/i.test(joined);
  const mentionsSaoLuis = /s[aã]o lu[ií]s/i.test(joined);
  const mentionsSemDados =
    /sem dados|n[aã]o h[aá] dados|n[aã]o encontrado|nenhum dado|sem informa/i.test(joined);
  const mentionsNaoTransmitido =
    /n[aã]o transmitido|n[aã]o homologa|n[aã]o publicado|prazo/i.test(joined);

  let heuristicAnalysis = "";
  if (bytes.byteLength < 2000) {
    heuristicAnalysis =
      "PDF muito pequeno (<2KB) — provavelmente página de erro, aviso ou 'dados indisponíveis'";
  } else if (bytes.byteLength < 10000) {
    heuristicAnalysis = "PDF pequeno (<10KB) — possivelmente aviso ou conteúdo mínimo";
  } else if (bytes.byteLength < 50000) {
    heuristicAnalysis = "PDF médio — pode ser conteúdo real do Anexo 12";
  } else {
    heuristicAnalysis = "PDF grande — provavelmente Anexo 12 completo";
  }

  return {
    magic,
    version,
    hasEof,
    byteLength: bytes.byteLength,
    base64,
    base64Truncated: truncated,
    extractedStrings,
    mentionsAnexo12,
    mentionsSaude,
    mentionsSaoLuis,
    mentionsSemDados,
    mentionsNaoTransmitido,
    heuristicAnalysis,
  };
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const searchParams = request.nextUrl.searchParams;

  const uf = searchParams.get("uf") || "21";
  const mun = searchParams.get("mun") || "211130";
  const ano = searchParams.get("ano") || "2025";
  const per = searchParams.get("per") || "6";
  const raw = searchParams.get("raw") === "1";
  const multi = searchParams.get("multi") === "1";
  const override = searchParams.get("url");

  // Modo "multi" — varre combinações de (ano, bimestre) para comparar
  // tamanhos de PDF e detectar qual retorna conteúdo real vs. erro.
  if (multi && !override) {
    const combos: Array<{ ano: string; per: string }> = [
      { ano: "2025", per: "6" },
      { ano: "2025", per: "5" },
      { ano: "2025", per: "4" },
      { ano: "2024", per: "6" },
      { ano: "2023", per: "6" },
      { ano: "2022", per: "6" },
      { ano: "2020", per: "6" },
    ];
    const results = await Promise.all(
      combos.map(async (c) => {
        const url = `${SIOPS_BASE}?cmbUF=${uf}&cmbMUNICIPIO=${mun}&cmbANO=${c.ano}&cmbPERIODO=${c.per}`;
        try {
          const r = await probe(url, Date.now());
          return {
            combo: c,
            url,
            status: r.response.status,
            contentType: r.response.contentType,
            byteLength: r.response.byteLength,
            pdfVersion: r.pdf?.version || null,
            pdfHeuristic: r.pdf?.heuristicAnalysis || null,
            mentionsSaoLuis: r.pdf?.mentionsSaoLuis ?? null,
            mentionsAnexo12: r.pdf?.mentionsAnexo12 ?? null,
            mentionsSemDados: r.pdf?.mentionsSemDados ?? null,
            firstStrings: r.pdf?.extractedStrings.slice(0, 15) ?? [],
          };
        } catch (err) {
          return {
            combo: c,
            url,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    return NextResponse.json({
      mode: "multi",
      params: { uf, mun },
      durationMs: Date.now() - started,
      results,
    });
  }

  const qs = `?cmbUF=${uf}&cmbMUNICIPIO=${mun}&cmbANO=${ano}&cmbPERIODO=${per}`;
  const primaryUrl = override || `${SIOPS_BASE}${qs}`;
  const fallbackUrl = override ? null : `${SIOPS_BASE_HTTPS}${qs}`;

  const attempts: Array<{ url: string; error?: string; result?: unknown }> = [];

  // Tentativa 1: URL primária (http:// por padrão)
  try {
    const result = await probe(primaryUrl, started);
    attempts.push({ url: primaryUrl, result });

    const payload: Record<string, unknown> = {
      params: { uf, mun, ano, per },
      attempts,
      primaryUrl,
      fallbackUrl,
    };

    if (raw && result.html?.snippetHead) {
      // Re-faz o fetch guardando o HTML inteiro (evita duplicar memória no happy-path)
      const res = await fetch(primaryUrl, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
        cache: "no-store",
      });
      const buf = await res.arrayBuffer();
      payload.htmlFull = smartDecode(buf, res.headers.get("content-type") || "").text;
    }

    return NextResponse.json(payload);
  } catch (err) {
    attempts.push({
      url: primaryUrl,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }

  // Tentativa 2: fallback para HTTPS caso o HTTP tenha falhado (ex.: Vercel bloqueia egress HTTP puro)
  if (fallbackUrl) {
    try {
      const result = await probe(fallbackUrl, started);
      attempts.push({ url: fallbackUrl, result });
      return NextResponse.json({
        params: { uf, mun, ano, per },
        attempts,
        primaryUrl,
        fallbackUrl,
        note: "HTTP falhou, HTTPS funcionou — use HTTPS no client definitivo.",
      });
    } catch (err) {
      attempts.push({
        url: fallbackUrl,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  }

  return NextResponse.json(
    {
      success: false,
      params: { uf, mun, ano, per },
      attempts,
      durationMs: Date.now() - started,
      message:
        "Ambas tentativas falharam. Cole a saída para diagnóstico. Se ambos os erros mencionarem timeout/ECONNREFUSED, pode ser bloqueio de egress da Vercel para http:// do datasus.",
    },
    { status: 502 },
  );
}
