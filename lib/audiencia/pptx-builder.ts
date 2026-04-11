/**
 * Gerador de apresentação PPTX para Audiências Públicas LRF.
 *
 * Recebe um `AudienciaData` já pronto (vindo de `gatherAudienciaData`) e
 * produz um arquivo .pptx com os 44 slides exigidos pelo rito da Câmara
 * Municipal de São Luís:
 *
 * 1 a 7     — capa, apresentador, objetivo, ofícios, RREO intro/notas
 * 8 a 17    — receitas tributárias, contribuições, patrimoniais, outras
 * 18        — resumo das receitas próprias
 * 19 a 26   — transferências correntes + resumo
 * 27 a 28   — receita total e dependência financeira
 * 29 a 32   — balanço orçamentário (intro, receitas, despesas, resultado)
 * 33 a 35   — RCL e resultados primário/nominal
 * 36 a 37   — indicadores constitucionais (educação e saúde)
 * 38 a 43   — RGF: intro, pessoal, dívida, composição, garantias, operações
 * 44        — fechamento
 */

import PptxGenJS from "pptxgenjs";

import type {
  AudienciaData,
  BalancoOrcamentarioLinha,
  CategoriaReceitaDetalhe,
} from "./types";

// =========================================================================
// Constantes de layout
// =========================================================================

/** Largura do slide em LAYOUT_WIDE (polegadas, 16:9). */
const SLIDE_W = 13.333;
/** Altura do slide em LAYOUT_WIDE (polegadas, 16:9). */
const SLIDE_H = 7.5;

/** Paleta inspirada nos slides originais da SEMFAZ (azul institucional). */
const COLORS = {
  primary: "1F3864", // azul marinho institucional
  accent: "2E75B6", // azul médio
  dark: "0B1B34", // azul quase preto
  light: "D9E1F2", // azul claro / fundo de destaque
  white: "FFFFFF",
  gold: "FFC000", // destaque em valores
  success: "70AD47", // crescimento positivo
  danger: "C00000", // crescimento negativo
  muted: "595959", // cinza texto secundário
  bg: "F2F2F2", // cinza fundo de tabela
} as const;

/** Família tipográfica padrão dos slides. */
const FONT = "Calibri";

type Pptx = InstanceType<typeof PptxGenJS>;
type Slide = ReturnType<Pptx["addSlide"]>;

// =========================================================================
// Formatadores
// =========================================================================

/**
 * Formata um valor em reais de modo compacto, escolhendo a unidade
 * (mil/mi/bi) conforme a magnitude.
 * Ex: 1.181.150.000 → "R$ 1,18 bi"; 186.062.000 → "R$ 186,06 mi".
 */
function fmtMi(n: number): string {
  const abs = Math.abs(n);
  const toBR = (v: number) =>
    v.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (abs >= 1e9) return `R$ ${toBR(n / 1e9)} bi`;
  if (abs >= 1e6) return `R$ ${toBR(n / 1e6)} mi`;
  if (abs >= 1e3) return `R$ ${toBR(n / 1e3)} mil`;
  return `R$ ${toBR(n)}`;
}

/**
 * Formata uma fração decimal como percentual BR com sinal explícito.
 * Ex: 0.3651 → "+36,51%"; -0.0113 → "-1,13%".
 */
function fmtPctSign(frac: number): string {
  const pct = frac * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/** Cor a usar para valores de crescimento (verde positivo, vermelho negativo). */
function growthColor(frac: number): string {
  return frac >= 0 ? COLORS.success : COLORS.danger;
}

/** Formata uma fração decimal como percentual BR sem sinal explícito. */
function fmtPct(frac: number): string {
  const pct = frac * 100;
  return `${pct.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * Agrega uma lista de `CategoriaReceitaDetalhe` somando os históricos
 * anuais por ano e recalculando os percentuais de crescimento sobre a
 * série agregada. Usado em slides de resumo (18, 27) quando precisamos
 * mostrar um "total por grupo" com crescimento coerente.
 */
function aggregateDetalhes(
  dets: CategoriaReceitaDetalhe[],
): { valor: number; cresc5a: number; crescAnual: number } {
  if (dets.length === 0) return { valor: 0, cresc5a: 0, crescAnual: 0 };

  const anoMap = new Map<number, number>();
  for (const d of dets) {
    for (const h of d.historicoAnual) {
      anoMap.set(h.ano, (anoMap.get(h.ano) ?? 0) + h.valor);
    }
  }
  const sorted = [...anoMap.entries()].sort((a, b) => a[0] - b[0]);

  const valorAtual = sorted[sorted.length - 1]?.[1] ?? 0;
  const valorInicio = sorted[0]?.[1] ?? 0;
  const valorAnterior = sorted[sorted.length - 2]?.[1] ?? 0;

  const cresc5a =
    valorInicio > 0 ? (valorAtual - valorInicio) / valorInicio : 0;
  const crescAnual =
    valorAnterior > 0 ? (valorAtual - valorAnterior) / valorAnterior : 0;

  return { valor: valorAtual, cresc5a, crescAnual };
}

// =========================================================================
// Chrome comum (faixa inferior com metadados da audiência)
// =========================================================================

/**
 * Aplica a faixa inferior escura com título curto da audiência, data
 * e numeração da página.
 */
function addFooterBar(
  pres: Pptx,
  slide: Slide,
  data: AudienciaData,
  pageNum: number,
): void {
  const footerY = SLIDE_H - 0.38;

  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: footerY,
    w: SLIDE_W,
    h: 0.38,
    fill: { color: COLORS.dark },
    line: { color: COLORS.dark },
  });

  slide.addText(
    `AUDIÊNCIA PÚBLICA  •  ${data.tituloQuadrimestre}  •  ${data.params.dataApresentacao}`,
    {
      x: 0.4,
      y: footerY + 0.02,
      w: SLIDE_W - 1.2,
      h: 0.34,
      fontFace: FONT,
      fontSize: 10,
      color: COLORS.white,
      align: "left",
      valign: "middle",
    },
  );

  slide.addText(String(pageNum), {
    x: SLIDE_W - 0.8,
    y: footerY + 0.02,
    w: 0.4,
    h: 0.34,
    fontFace: FONT,
    fontSize: 10,
    color: COLORS.white,
    align: "right",
    valign: "middle",
  });
}

/**
 * Aplica a faixa superior azul com o título da seção.
 */
function addHeaderBar(pres: Pptx, slide: Slide, titulo: string): void {
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.7,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });

  slide.addText(titulo, {
    x: 0.5,
    y: 0.1,
    w: SLIDE_W - 1.0,
    h: 0.5,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: COLORS.white,
    align: "left",
    valign: "middle",
    charSpacing: 2,
  });
}

/**
 * Desenha um aviso central informando que determinado bloco de dados
 * ainda não foi coletado (os anexos do RREO/RGF que alimentam os slides
 * podem estar indisponíveis para alguns períodos). Usado como fallback
 * nos slides 30, 31, 32, 34, 35, 36 e 37.
 */
function addDadosNaoDisponiveis(
  pres: Pptx,
  slide: Slide,
  message: string,
): void {
  slide.addShape(pres.ShapeType.rect, {
    x: 1.8,
    y: 2.6,
    w: SLIDE_W - 3.6,
    h: 2.0,
    fill: { color: COLORS.bg },
    line: { color: COLORS.muted, width: 1 },
  });
  slide.addText("DADOS NÃO DISPONÍVEIS", {
    x: 1.8,
    y: 2.8,
    w: SLIDE_W - 3.6,
    h: 0.6,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLORS.muted,
    align: "center",
    charSpacing: 3,
  });
  slide.addText(message, {
    x: 2.2,
    y: 3.5,
    w: SLIDE_W - 4.4,
    h: 1.0,
    fontFace: FONT,
    fontSize: 13,
    color: COLORS.dark,
    align: "center",
    valign: "middle",
  });
}

// =========================================================================
// Slide 1 — Capa
// =========================================================================

function addSlide01Capa(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.primary };

  // Faixa decorativa lateral dourada
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.35,
    h: SLIDE_H,
    fill: { color: COLORS.gold },
    line: { color: COLORS.gold },
  });

  // Título principal
  slide.addText("AUDIÊNCIA PÚBLICA", {
    x: 1.0,
    y: 2.2,
    w: SLIDE_W - 2.0,
    h: 1.2,
    fontFace: FONT,
    fontSize: 60,
    bold: true,
    color: COLORS.white,
    align: "center",
    charSpacing: 4,
  });

  // Subtítulo: quadrimestre e ano
  slide.addText(data.tituloQuadrimestre.toUpperCase(), {
    x: 1.0,
    y: 3.6,
    w: SLIDE_W - 2.0,
    h: 0.8,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: COLORS.gold,
    align: "center",
  });

  // Data da apresentação
  slide.addText(data.params.dataApresentacao, {
    x: 1.0,
    y: 4.7,
    w: SLIDE_W - 2.0,
    h: 0.5,
    fontFace: FONT,
    fontSize: 22,
    color: COLORS.light,
    align: "center",
  });

  // Rodapé institucional
  slide.addText("SECRETARIA MUNICIPAL DA FAZENDA  —  SEMFAZ", {
    x: 1.0,
    y: 6.4,
    w: SLIDE_W - 2.0,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    italic: true,
    color: COLORS.light,
    align: "center",
  });
}

// =========================================================================
// Slide 2 — Capa com apresentador
// =========================================================================

function addSlide02CapaApresentador(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.primary };

  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.35,
    h: SLIDE_H,
    fill: { color: COLORS.gold },
    line: { color: COLORS.gold },
  });

  slide.addText("AUDIÊNCIA PÚBLICA", {
    x: 1.0,
    y: 1.4,
    w: SLIDE_W - 2.0,
    h: 1.0,
    fontFace: FONT,
    fontSize: 48,
    bold: true,
    color: COLORS.white,
    align: "center",
    charSpacing: 3,
  });

  slide.addText(data.tituloQuadrimestre.toUpperCase(), {
    x: 1.0,
    y: 2.5,
    w: SLIDE_W - 2.0,
    h: 0.7,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: COLORS.gold,
    align: "center",
  });

  slide.addText(data.params.dataApresentacao, {
    x: 1.0,
    y: 3.2,
    w: SLIDE_W - 2.0,
    h: 0.5,
    fontFace: FONT,
    fontSize: 18,
    color: COLORS.light,
    align: "center",
  });

  // Linha separadora dourada
  slide.addShape(pres.ShapeType.line, {
    x: 3.5,
    y: 4.2,
    w: SLIDE_W - 7.0,
    h: 0,
    line: { color: COLORS.gold, width: 2 },
  });

  slide.addText("APRESENTAÇÃO", {
    x: 1.0,
    y: 4.4,
    w: SLIDE_W - 2.0,
    h: 0.4,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: COLORS.light,
    align: "center",
    charSpacing: 4,
  });

  slide.addText(data.params.apresentador, {
    x: 1.0,
    y: 4.85,
    w: SLIDE_W - 2.0,
    h: 0.7,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: COLORS.white,
    align: "center",
  });

  slide.addText(data.params.cargoApresentador, {
    x: 1.0,
    y: 5.6,
    w: SLIDE_W - 2.0,
    h: 0.5,
    fontFace: FONT,
    fontSize: 16,
    italic: true,
    color: COLORS.light,
    align: "center",
  });

  slide.addText("SECRETARIA MUNICIPAL DA FAZENDA  —  SEMFAZ", {
    x: 1.0,
    y: 6.4,
    w: SLIDE_W - 2.0,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    italic: true,
    color: COLORS.light,
    align: "center",
  });
}

// =========================================================================
// Slide 3 — Objetivo
// =========================================================================

function addSlide03Objetivo(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "OBJETIVO");

  // Bloco principal: texto do objetivo em rich-text
  slide.addText(
    [
      {
        text: "Demonstrar e avaliar ",
        options: { fontSize: 28, color: COLORS.dark },
      },
      {
        text: "o cumprimento das metas fiscais ",
        options: { fontSize: 28, bold: true, color: COLORS.primary },
      },
      {
        text: "do ",
        options: { fontSize: 28, color: COLORS.dark },
      },
      {
        text: data.tituloQuadrimestre,
        options: { fontSize: 28, bold: true, color: COLORS.accent },
      },
      {
        text: " na ",
        options: { fontSize: 28, color: COLORS.dark },
      },
      {
        text: "Casa Legislativa Municipal",
        options: { fontSize: 28, bold: true, color: COLORS.primary },
      },
      {
        text: ".",
        options: { fontSize: 28, color: COLORS.dark },
      },
    ],
    {
      x: 1.2,
      y: 2.2,
      w: SLIDE_W - 2.4,
      h: 2.8,
      fontFace: FONT,
      align: "center",
      valign: "middle",
    },
  );

  // Caixa com base legal
  slide.addShape(pres.ShapeType.rect, {
    x: 2.5,
    y: 5.5,
    w: SLIDE_W - 5.0,
    h: 0.75,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 1.5 },
  });
  slide.addText("LC 101/2000, Art. 9º, § 4º — Lei de Responsabilidade Fiscal", {
    x: 2.5,
    y: 5.5,
    w: SLIDE_W - 5.0,
    h: 0.75,
    fontFace: FONT,
    fontSize: 14,
    italic: true,
    bold: true,
    color: COLORS.primary,
    align: "center",
    valign: "middle",
  });

  addFooterBar(pres, slide, data, 3);
}

// =========================================================================
// Slides 4 e 5 — Ofícios (compartilham o mesmo layout)
// =========================================================================

interface OficioArgs {
  pageNum: number;
  titulo: string;
  direcao: string;
  oficio: string;
}

function addOficioSlide(
  pres: Pptx,
  data: AudienciaData,
  args: OficioArgs,
): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, args.titulo);

  // Moldura central
  const boxX = 1.5;
  const boxY = 1.6;
  const boxW = SLIDE_W - 3.0;
  const boxH = 4.6;

  slide.addShape(pres.ShapeType.rect, {
    x: boxX,
    y: boxY,
    w: boxW,
    h: boxH,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 2 },
  });

  // Label
  slide.addText("OFÍCIO EXPEDIDO Nº", {
    x: boxX,
    y: boxY + 0.45,
    w: boxW,
    h: 0.5,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    color: COLORS.primary,
    align: "center",
    charSpacing: 4,
  });

  // Número grande
  slide.addText(args.oficio, {
    x: boxX,
    y: boxY + 1.15,
    w: boxW,
    h: 1.1,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: COLORS.dark,
    align: "center",
    valign: "middle",
  });

  // Tramitação
  slide.addText(args.direcao, {
    x: boxX,
    y: boxY + 2.5,
    w: boxW,
    h: 0.5,
    fontFace: FONT,
    fontSize: 18,
    bold: true,
    color: COLORS.accent,
    align: "center",
  });

  // Linha separadora interna
  slide.addShape(pres.ShapeType.line, {
    x: boxX + 1.0,
    y: boxY + 3.1,
    w: boxW - 2.0,
    h: 0,
    line: { color: COLORS.accent, width: 1 },
  });

  // Assunto
  slide.addText("Assunto:", {
    x: boxX + 0.8,
    y: boxY + 3.3,
    w: 1.7,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: COLORS.muted,
    align: "left",
  });
  slide.addText(
    `Envio do RREO e RGF — ${data.tituloQuadrimestre}`,
    {
      x: boxX + 2.4,
      y: boxY + 3.3,
      w: boxW - 3.2,
      h: 0.4,
      fontFace: FONT,
      fontSize: 14,
      color: COLORS.dark,
      align: "left",
    },
  );

  // Referência
  slide.addText("Referência:", {
    x: boxX + 0.8,
    y: boxY + 3.8,
    w: 1.7,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: COLORS.muted,
    align: "left",
  });
  slide.addText("LC 101/2000 — Lei de Responsabilidade Fiscal", {
    x: boxX + 2.4,
    y: boxY + 3.8,
    w: boxW - 3.2,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    color: COLORS.dark,
    align: "left",
  });

  addFooterBar(pres, slide, data, args.pageNum);
}

function addSlide04OficioSemfaz(pres: Pptx, data: AudienciaData): void {
  addOficioSlide(pres, data, {
    pageNum: 4,
    titulo: "OFÍCIO EXPEDIDO — SEMFAZ  →  CÂMARA MUNICIPAL",
    direcao: "SEMFAZ  →  CÂMARA MUNICIPAL DE SÃO LUÍS",
    oficio: data.params.oficioSemfaz ?? "— a preencher —",
  });
}

function addSlide05OficioCamara(pres: Pptx, data: AudienciaData): void {
  addOficioSlide(pres, data, {
    pageNum: 5,
    titulo: "OFÍCIO RECEBIDO — CÂMARA MUNICIPAL  →  SEMFAZ",
    direcao: "CÂMARA MUNICIPAL DE SÃO LUÍS  →  SEMFAZ",
    oficio: data.params.oficioCamara ?? "— a preencher —",
  });
}

// =========================================================================
// Slide 6 — RREO: texto institucional
// =========================================================================

function addSlide06RreoIntro(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RREO  —  RELATÓRIO RESUMIDO DE EXECUÇÃO ORÇAMENTÁRIA");

  slide.addText("Relatório Resumido de Execução Orçamentária", {
    x: 1.0,
    y: 1.15,
    w: SLIDE_W - 2.0,
    h: 0.8,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  slide.addText(
    "O Relatório Resumido de Execução Orçamentária (RREO) é um documento " +
      "bimestral, definido pelo Tesouro Nacional e elaborado por todos os " +
      "entes federados, que permite o acompanhamento e análise do " +
      "desempenho das ações governamentais estabelecidas na Lei de " +
      "Diretrizes Orçamentárias (LDO) e na Lei Orçamentária Anual (LOA).",
    {
      x: 1.5,
      y: 2.3,
      w: SLIDE_W - 3.0,
      h: 3.0,
      fontFace: FONT,
      fontSize: 18,
      color: COLORS.dark,
      align: "justify",
      valign: "top",
      paraSpaceAfter: 10,
    },
  );

  // Caixa com base legal
  slide.addShape(pres.ShapeType.rect, {
    x: 3.5,
    y: 5.8,
    w: SLIDE_W - 7.0,
    h: 0.75,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 1.5 },
  });
  slide.addText("CF/88, Art. 165, § 3º", {
    x: 3.5,
    y: 5.8,
    w: SLIDE_W - 7.0,
    h: 0.75,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    italic: true,
    color: COLORS.primary,
    align: "center",
    valign: "middle",
  });

  addFooterBar(pres, slide, data, 6);
}

// =========================================================================
// Slide 7 — RREO: notas metodológicas
// =========================================================================

function addSlide07RreoNotas(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RREO  —  NOTAS METODOLÓGICAS");

  slide.addText("Notas Importantes", {
    x: 1.0,
    y: 1.15,
    w: SLIDE_W - 2.0,
    h: 0.8,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  const anoRef = data.params.ano;
  const anoBase = data.params.anoBaseCorrecao ?? anoRef;
  const anoInicio = anoRef - 4;

  slide.addText(
    [
      {
        text:
          `Os valores apresentados de ${anoInicio} a ${anoRef - 1} estão ` +
          `atualizados conforme o IPCA até ${anoBase}`,
        options: { bullet: { code: "25CF" }, breakLine: true },
      },
      {
        text:
          `Os valores apresentados referentes a ${anoRef} estão em moeda ` +
          `corrente, conforme relatório homologado no SICONFI`,
        options: { bullet: { code: "25CF" }, breakLine: true },
      },
      {
        text:
          "Todos os valores apresentados estão LÍQUIDOS do FUNDEB e de " +
          "receitas INTRA-ORÇAMENTÁRIAS",
        options: { bullet: { code: "25CF" } },
      },
    ],
    {
      x: 1.2,
      y: 2.5,
      w: SLIDE_W - 2.4,
      h: 3.8,
      fontFace: FONT,
      fontSize: 20,
      color: COLORS.dark,
      valign: "top",
      paraSpaceAfter: 14,
    },
  );

  addFooterBar(pres, slide, data, 7);
}

// =========================================================================
// Slides 8-12 — Receita tributária detalhada (gráfico 5 anos + KPIs)
// =========================================================================

/**
 * Renderiza um slide com o histórico de 5 anos de uma categoria de receita,
 * o valor arrecadado no exercício e os percentuais de crescimento.
 * Reaproveitado para ISS, IPTU, ITBI, IR, Taxas e mais adiante para
 * contribuições, patrimoniais e transferências.
 */
function addReceitaDetalheSlide(
  pres: Pptx,
  data: AudienciaData,
  detalhe: CategoriaReceitaDetalhe,
  titulo: string,
  pageNum: number,
): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, titulo.toUpperCase());

  // Período referente + rótulo da categoria (destaques)
  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 6.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
    valign: "middle",
  });

  slide.addText(detalhe.label, {
    x: 0.5,
    y: 1.25,
    w: SLIDE_W - 1.0,
    h: 0.75,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: COLORS.primary,
    align: "left",
  });

  // Gráfico de barras — 5 anos (valores em R$ milhões)
  const labels = detalhe.historicoAnual.map((h) => String(h.ano));
  const values = detalhe.historicoAnual.map((h) => h.valor / 1e6);

  slide.addChart(
    pres.ChartType.bar,
    [{ name: "Arrecadação (R$ mi)", labels, values }],
    {
      x: 0.5,
      y: 2.15,
      w: 7.8,
      h: 4.65,
      barDir: "col",
      barGrouping: "standard",
      showLegend: false,
      showTitle: false,
      showValue: true,
      dataLabelFontSize: 11,
      dataLabelFontFace: FONT,
      dataLabelFormatCode: "#,##0.00",
      dataLabelColor: COLORS.dark,
      chartColors: [COLORS.accent],
      catAxisLabelFontSize: 12,
      catAxisLabelFontFace: FONT,
      catAxisLabelColor: COLORS.dark,
      valAxisLabelFontSize: 10,
      valAxisLabelFontFace: FONT,
      valAxisLabelColor: COLORS.muted,
      valAxisLabelFormatCode: "#,##0",
    },
  );

  // Painel de KPIs à direita
  const boxX = 8.7;
  const boxY = 2.15;
  const boxW = 4.1;
  const boxH = 4.65;

  slide.addShape(pres.ShapeType.rect, {
    x: boxX,
    y: boxY,
    w: boxW,
    h: boxH,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 1 },
  });

  // Valor arrecadado
  slide.addText("VALOR ARRECADADO", {
    x: boxX + 0.2,
    y: boxY + 0.25,
    w: boxW - 0.4,
    h: 0.35,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    charSpacing: 2,
    color: COLORS.muted,
    align: "center",
  });
  slide.addText(fmtMi(detalhe.valorArrecadado), {
    x: boxX + 0.2,
    y: boxY + 0.6,
    w: boxW - 0.4,
    h: 0.9,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: COLORS.primary,
    align: "center",
    valign: "middle",
  });

  // Separador
  slide.addShape(pres.ShapeType.line, {
    x: boxX + 0.4,
    y: boxY + 1.7,
    w: boxW - 0.8,
    h: 0,
    line: { color: COLORS.accent, width: 1 },
  });

  const anoInicial = detalhe.historicoAnual[0]?.ano ?? data.params.ano - 4;
  const anoFinal = data.params.ano;
  const anoAnterior = anoFinal - 1;
  const sufInicio = String(anoInicial).slice(-2);
  const sufFinal = String(anoFinal).slice(-2);
  const sufAnterior = String(anoAnterior).slice(-2);

  // Crescimento 5 anos
  slide.addText(`Crescimento ${sufInicio}–${sufFinal}`, {
    x: boxX + 0.2,
    y: boxY + 1.9,
    w: boxW - 0.4,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: COLORS.muted,
    align: "center",
  });
  slide.addText(fmtPctSign(detalhe.crescimento5a), {
    x: boxX + 0.2,
    y: boxY + 2.25,
    w: boxW - 0.4,
    h: 0.7,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: growthColor(detalhe.crescimento5a),
    align: "center",
    valign: "middle",
  });

  // Crescimento anual
  slide.addText(`Crescimento ${sufAnterior}–${sufFinal}`, {
    x: boxX + 0.2,
    y: boxY + 3.1,
    w: boxW - 0.4,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: COLORS.muted,
    align: "center",
  });
  slide.addText(fmtPctSign(detalhe.crescimentoAnual), {
    x: boxX + 0.2,
    y: boxY + 3.45,
    w: boxW - 0.4,
    h: 0.7,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: growthColor(detalhe.crescimentoAnual),
    align: "center",
    valign: "middle",
  });

  addFooterBar(pres, slide, data, pageNum);
}

// =========================================================================
// Slide 13 — Total das Receitas Tributárias
// =========================================================================

function addSlide13TotalTributarias(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RECEITAS MUNICIPAIS  —  TOTAL DAS TRIBUTÁRIAS");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 6.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  // Banner superior com o total
  slide.addShape(pres.ShapeType.rect, {
    x: 1.5,
    y: 1.4,
    w: SLIDE_W - 3.0,
    h: 1.4,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText("TOTAL DAS RECEITAS TRIBUTÁRIAS", {
    x: 1.5,
    y: 1.45,
    w: SLIDE_W - 3.0,
    h: 0.45,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    charSpacing: 4,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText(fmtMi(data.tributarias.total), {
    x: 1.5,
    y: 1.9,
    w: SLIDE_W - 3.0,
    h: 0.9,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });

  // Tabela de breakdown por categoria
  const headerCellOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.primary },
    align: "center" as const,
    valign: "middle" as const,
  };

  const headerRow = [
    { text: "Categoria", options: { ...headerCellOpts, align: "left" as const } },
    { text: "Arrecadado", options: headerCellOpts },
    { text: "Cresc. 5 anos", options: headerCellOpts },
    { text: "Cresc. Anual", options: headerCellOpts },
  ];

  const cats: CategoriaReceitaDetalhe[] = [
    data.tributarias.iss,
    data.tributarias.iptu,
    data.tributarias.itbi,
    data.tributarias.ir,
    data.tributarias.taxas,
  ];

  const bodyRows = cats.map((c) => [
    {
      text: c.label,
      options: { color: COLORS.dark, align: "left" as const, valign: "middle" as const },
    },
    {
      text: fmtMi(c.valorArrecadado),
      options: { color: COLORS.dark, align: "right" as const, valign: "middle" as const },
    },
    {
      text: fmtPctSign(c.crescimento5a),
      options: {
        color: growthColor(c.crescimento5a),
        bold: true,
        align: "right" as const,
        valign: "middle" as const,
      },
    },
    {
      text: fmtPctSign(c.crescimentoAnual),
      options: {
        color: growthColor(c.crescimentoAnual),
        bold: true,
        align: "right" as const,
        valign: "middle" as const,
      },
    },
  ]);

  const totalRowOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.accent },
    valign: "middle" as const,
  };
  const totalRow = [
    { text: "TOTAL", options: { ...totalRowOpts, align: "left" as const } },
    {
      text: fmtMi(data.tributarias.total),
      options: { ...totalRowOpts, align: "right" as const },
    },
    { text: "", options: totalRowOpts },
    { text: "", options: totalRowOpts },
  ];

  slide.addTable([headerRow, ...bodyRows, totalRow], {
    x: 1.5,
    y: 3.2,
    w: SLIDE_W - 3.0,
    h: 3.6,
    fontFace: FONT,
    fontSize: 14,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [4.333, 2.5, 1.75, 1.75],
  });

  addFooterBar(pres, slide, data, 13);
}

// =========================================================================
// Slides 18 e 26 — Resumo tabulado (próprias e transferências)
// =========================================================================

interface ResumoRow {
  label: string;
  valor: number;
  cresc5a: number;
  crescAnual: number;
}

/**
 * Renderiza um slide de resumo com um banner de total, uma tabela de
 * categorias com crescimentos e um rodapé. Reaproveitado pelos slides
 * 18 (Receitas Próprias) e 26 (Transferências Correntes).
 */
function addResumoTabelaSlide(
  pres: Pptx,
  data: AudienciaData,
  args: {
    titulo: string;
    bannerLabel: string;
    totalLabel: string;
    totalValor: number;
    rows: ResumoRow[];
    pageNum: number;
  },
): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, args.titulo);

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 6.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  // Banner com total
  slide.addShape(pres.ShapeType.rect, {
    x: 1.5,
    y: 1.4,
    w: SLIDE_W - 3.0,
    h: 1.4,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText(args.bannerLabel, {
    x: 1.5,
    y: 1.45,
    w: SLIDE_W - 3.0,
    h: 0.45,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    charSpacing: 4,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText(fmtMi(args.totalValor), {
    x: 1.5,
    y: 1.9,
    w: SLIDE_W - 3.0,
    h: 0.9,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });

  // Tabela
  const headerCellOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.primary },
    align: "center" as const,
    valign: "middle" as const,
  };

  const headerRow = [
    { text: "Categoria", options: { ...headerCellOpts, align: "left" as const } },
    { text: "Arrecadado", options: headerCellOpts },
    { text: "Cresc. 5 anos", options: headerCellOpts },
    { text: "Cresc. Anual", options: headerCellOpts },
  ];

  const bodyRows = args.rows.map((r) => [
    {
      text: r.label,
      options: {
        color: COLORS.dark,
        align: "left" as const,
        valign: "middle" as const,
      },
    },
    {
      text: fmtMi(r.valor),
      options: {
        color: COLORS.dark,
        align: "right" as const,
        valign: "middle" as const,
      },
    },
    {
      text: fmtPctSign(r.cresc5a),
      options: {
        color: growthColor(r.cresc5a),
        bold: true,
        align: "right" as const,
        valign: "middle" as const,
      },
    },
    {
      text: fmtPctSign(r.crescAnual),
      options: {
        color: growthColor(r.crescAnual),
        bold: true,
        align: "right" as const,
        valign: "middle" as const,
      },
    },
  ]);

  const totalRowOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.accent },
    valign: "middle" as const,
  };
  const totalRow = [
    { text: args.totalLabel, options: { ...totalRowOpts, align: "left" as const } },
    {
      text: fmtMi(args.totalValor),
      options: { ...totalRowOpts, align: "right" as const },
    },
    { text: "", options: totalRowOpts },
    { text: "", options: totalRowOpts },
  ];

  slide.addTable([headerRow, ...bodyRows, totalRow], {
    x: 1.5,
    y: 3.2,
    w: SLIDE_W - 3.0,
    h: 3.6,
    fontFace: FONT,
    fontSize: 14,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [4.333, 2.5, 1.75, 1.75],
  });

  addFooterBar(pres, slide, data, args.pageNum);
}

// =========================================================================
// Slide 18 — Resumo das Receitas Próprias Municipais
// =========================================================================

function addSlide18ResumoProprias(pres: Pptx, data: AudienciaData): void {
  const tributariasAgg = aggregateDetalhes([
    data.tributarias.iss,
    data.tributarias.iptu,
    data.tributarias.itbi,
    data.tributarias.ir,
    data.tributarias.taxas,
  ]);

  const propriasAgg = aggregateDetalhes([
    data.tributarias.iss,
    data.tributarias.iptu,
    data.tributarias.itbi,
    data.tributarias.ir,
    data.tributarias.taxas,
    data.contribuicoes.sociais,
    data.contribuicoes.cosip,
    data.receitaPatrimonial,
    data.outrasReceitasCorrentes,
  ]);

  const rows: ResumoRow[] = [
    {
      label: "Tributárias (total)",
      valor: tributariasAgg.valor,
      cresc5a: tributariasAgg.cresc5a,
      crescAnual: tributariasAgg.crescAnual,
    },
    {
      label: data.contribuicoes.sociais.label,
      valor: data.contribuicoes.sociais.valorArrecadado,
      cresc5a: data.contribuicoes.sociais.crescimento5a,
      crescAnual: data.contribuicoes.sociais.crescimentoAnual,
    },
    {
      label: data.contribuicoes.cosip.label,
      valor: data.contribuicoes.cosip.valorArrecadado,
      cresc5a: data.contribuicoes.cosip.crescimento5a,
      crescAnual: data.contribuicoes.cosip.crescimentoAnual,
    },
    {
      label: data.receitaPatrimonial.label,
      valor: data.receitaPatrimonial.valorArrecadado,
      cresc5a: data.receitaPatrimonial.crescimento5a,
      crescAnual: data.receitaPatrimonial.crescimentoAnual,
    },
    {
      label: data.outrasReceitasCorrentes.label,
      valor: data.outrasReceitasCorrentes.valorArrecadado,
      cresc5a: data.outrasReceitasCorrentes.crescimento5a,
      crescAnual: data.outrasReceitasCorrentes.crescimentoAnual,
    },
  ];

  addResumoTabelaSlide(pres, data, {
    titulo: "RECEITAS PRÓPRIAS MUNICIPAIS",
    bannerLabel: "TOTAL DAS RECEITAS PRÓPRIAS",
    totalLabel: "TOTAL DAS PRÓPRIAS",
    totalValor: propriasAgg.valor,
    rows,
    pageNum: 18,
  });
}

// =========================================================================
// Slide 26 — Resumo das Transferências Correntes
// =========================================================================

function addSlide26ResumoTransferencias(pres: Pptx, data: AudienciaData): void {
  const rows: ResumoRow[] = [
    {
      label: data.transferencias.uniaoFpm.label,
      valor: data.transferencias.uniaoFpm.valorArrecadado,
      cresc5a: data.transferencias.uniaoFpm.crescimento5a,
      crescAnual: data.transferencias.uniaoFpm.crescimentoAnual,
    },
    {
      label: data.transferencias.uniaoSus.label,
      valor: data.transferencias.uniaoSus.valorArrecadado,
      cresc5a: data.transferencias.uniaoSus.crescimento5a,
      crescAnual: data.transferencias.uniaoSus.crescimentoAnual,
    },
    {
      label: data.transferencias.uniaoOutras.label,
      valor: data.transferencias.uniaoOutras.valorArrecadado,
      cresc5a: data.transferencias.uniaoOutras.crescimento5a,
      crescAnual: data.transferencias.uniaoOutras.crescimentoAnual,
    },
    {
      label: data.transferencias.estadoIcms.label,
      valor: data.transferencias.estadoIcms.valorArrecadado,
      cresc5a: data.transferencias.estadoIcms.crescimento5a,
      crescAnual: data.transferencias.estadoIcms.crescimentoAnual,
    },
    {
      label: data.transferencias.estadoIpva.label,
      valor: data.transferencias.estadoIpva.valorArrecadado,
      cresc5a: data.transferencias.estadoIpva.crescimento5a,
      crescAnual: data.transferencias.estadoIpva.crescimentoAnual,
    },
    {
      label: data.transferencias.estadoOutras.label,
      valor: data.transferencias.estadoOutras.valorArrecadado,
      cresc5a: data.transferencias.estadoOutras.crescimento5a,
      crescAnual: data.transferencias.estadoOutras.crescimentoAnual,
    },
  ];

  addResumoTabelaSlide(pres, data, {
    titulo: "RESUMO DAS TRANSFERÊNCIAS CORRENTES",
    bannerLabel: "TOTAL DAS TRANSFERÊNCIAS",
    totalLabel: "TOTAL DAS TRANSFERÊNCIAS",
    totalValor: data.transferencias.total.valorArrecadado,
    rows,
    pageNum: 26,
  });
}

// =========================================================================
// Slide 27 — Receita Total (destaque próprias vs transferidos)
// =========================================================================

function addSlide27ReceitaTotal(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RECEITA TOTAL ARRECADADA");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 6.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  // Uso o ano mais recente da dependência financeira (5 anos coletados)
  const dep = data.dependenciaFinanceira;
  const latest = dep.length > 0 ? dep[dep.length - 1] : null;
  const proprios = latest?.proprios ?? 0;
  const transferidos = latest?.transferidos ?? 0;
  const total = proprios + transferidos;
  const pctProp = latest?.percentProprios ?? 0;
  const pctTransf = latest?.percentTransferidos ?? 0;

  // Banner grande com o valor total
  slide.addShape(pres.ShapeType.rect, {
    x: 1.5,
    y: 1.4,
    w: SLIDE_W - 3.0,
    h: 1.6,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText("RECEITA TOTAL ARRECADADA", {
    x: 1.5,
    y: 1.5,
    w: SLIDE_W - 3.0,
    h: 0.5,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    charSpacing: 4,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText(fmtMi(total), {
    x: 1.5,
    y: 2.0,
    w: SLIDE_W - 3.0,
    h: 1.0,
    fontFace: FONT,
    fontSize: 46,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });

  // Dois cards lado a lado: Próprias vs Transferidos
  const cardY = 3.4;
  const cardH = 3.3;
  const cardW = 5.6;
  const cardGap = 0.333;
  const totalCardsW = 2 * cardW + cardGap;
  const card1X = (SLIDE_W - totalCardsW) / 2;
  const card2X = card1X + cardW + cardGap;

  const drawCard = (
    x: number,
    label: string,
    valor: number,
    pct: number,
  ): void => {
    slide.addShape(pres.ShapeType.rect, {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: COLORS.light },
      line: { color: COLORS.accent, width: 2 },
    });
    slide.addText(label, {
      x,
      y: cardY + 0.2,
      w: cardW,
      h: 0.45,
      fontFace: FONT,
      fontSize: 14,
      bold: true,
      charSpacing: 3,
      color: COLORS.primary,
      align: "center",
    });
    slide.addText(fmtMi(valor), {
      x,
      y: cardY + 0.75,
      w: cardW,
      h: 0.85,
      fontFace: FONT,
      fontSize: 28,
      bold: true,
      color: COLORS.dark,
      align: "center",
      valign: "middle",
    });
    slide.addShape(pres.ShapeType.line, {
      x: x + 1.0,
      y: cardY + 1.75,
      w: cardW - 2.0,
      h: 0,
      line: { color: COLORS.accent, width: 1 },
    });
    slide.addText(fmtPct(pct), {
      x,
      y: cardY + 1.95,
      w: cardW,
      h: 0.9,
      fontFace: FONT,
      fontSize: 42,
      bold: true,
      color: COLORS.accent,
      align: "center",
      valign: "middle",
    });
    slide.addText("do total arrecadado", {
      x,
      y: cardY + 2.85,
      w: cardW,
      h: 0.35,
      fontFace: FONT,
      fontSize: 12,
      italic: true,
      color: COLORS.muted,
      align: "center",
    });
  };

  drawCard(card1X, "RECEITAS PRÓPRIAS", proprios, pctProp);
  drawCard(card2X, "RECEITAS TRANSFERIDAS", transferidos, pctTransf);

  addFooterBar(pres, slide, data, 27);
}

// =========================================================================
// Slide 28 — Dependência Financeira (evolução 5 anos)
// =========================================================================

/**
 * Mostra a evolução da participação das receitas próprias × transferidas
 * ao longo dos últimos 5 exercícios. Contém um banner azul com a evolução
 * percentual (ano-base → ano-atual, com delta em p.p.) e uma tabela com
 * uma linha por ano cobrindo valores e percentuais.
 */
function addSlide28DependenciaFinanceira(
  pres: Pptx,
  data: AudienciaData,
): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(
    pres,
    slide,
    "Receitas Municipais  —  Dependência Financeira",
  );

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: SLIDE_W - 1.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  const dep = data.dependenciaFinanceira;

  if (dep.length === 0) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "A série histórica de receitas próprias × transferidas não pôde " +
        "ser montada para este período.",
    );
    addFooterBar(pres, slide, data, 28);
    return;
  }

  const first = dep[0];
  const last = dep[dep.length - 1];
  const ppDelta = (last.percentProprios - first.percentProprios) * 100;
  const sinal = ppDelta >= 0 ? "+" : "";
  const deltaStr = `${sinal}${ppDelta.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} p.p.`;
  const corDelta = ppDelta >= 0 ? COLORS.gold : "FFA0A0";

  // Banner com a evolução da participação das próprias
  slide.addShape(pres.ShapeType.rect, {
    x: 0.6,
    y: 1.35,
    w: SLIDE_W - 1.2,
    h: 1.2,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText("EVOLUÇÃO DA PARTICIPAÇÃO DAS RECEITAS PRÓPRIAS", {
    x: 0.6,
    y: 1.42,
    w: SLIDE_W - 1.2,
    h: 0.42,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 4,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText(
    [
      {
        text: `${fmtPct(first.percentProprios)} (${first.ano})`,
        options: { bold: true, color: COLORS.white, fontSize: 22 },
      },
      {
        text: "     →     ",
        options: { color: COLORS.white, fontSize: 22 },
      },
      {
        text: `${fmtPct(last.percentProprios)} (${last.ano})`,
        options: { bold: true, color: COLORS.white, fontSize: 22 },
      },
      {
        text: "          ",
        options: { fontSize: 22, color: COLORS.white },
      },
      {
        text: deltaStr,
        options: { bold: true, color: corDelta, fontSize: 24 },
      },
    ],
    {
      x: 0.6,
      y: 1.88,
      w: SLIDE_W - 1.2,
      h: 0.6,
      fontFace: FONT,
      align: "center",
      valign: "middle",
    },
  );

  // Tabela: Ano | Próprias | Transferidas | % Próprias | % Transferidas
  const headerOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.primary },
    align: "center" as const,
    valign: "middle" as const,
  };
  const headerRow = [
    { text: "ANO", options: headerOpts },
    { text: "RECEITAS PRÓPRIAS", options: headerOpts },
    { text: "RECEITAS TRANSFERIDAS", options: headerOpts },
    { text: "% PRÓPRIAS", options: headerOpts },
    { text: "% TRANSFERIDAS", options: headerOpts },
  ];

  const bodyRows = dep.map((d, idx) => {
    const isLast = idx === dep.length - 1;
    const cellFill = isLast
      ? COLORS.light
      : idx % 2 === 0
        ? COLORS.bg
        : COLORS.white;
    const cellColor = isLast ? COLORS.primary : COLORS.dark;
    const base = {
      bold: isLast,
      color: cellColor,
      fill: { color: cellFill },
      valign: "middle" as const,
    };
    return [
      {
        text: String(d.ano),
        options: { ...base, align: "center" as const },
      },
      {
        text: fmtMi(d.proprios),
        options: { ...base, align: "right" as const },
      },
      {
        text: fmtMi(d.transferidos),
        options: { ...base, align: "right" as const },
      },
      {
        text: fmtPct(d.percentProprios),
        options: { ...base, align: "center" as const },
      },
      {
        text: fmtPct(d.percentTransferidos),
        options: { ...base, align: "center" as const },
      },
    ];
  });

  slide.addTable([headerRow, ...bodyRows], {
    x: 0.6,
    y: 2.8,
    w: SLIDE_W - 1.2,
    rowH: 0.55,
    fontFace: FONT,
    fontSize: 13,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [1.2, 2.9, 3.0, 2.5, 2.533],
  });

  slide.addText(
    "Valores nominais do SICONFI (sem correção monetária), refletindo a " +
      "dependência financeira real do ente municipal no momento da " +
      "arrecadação.",
    {
      x: 0.6,
      y: SLIDE_H - 1.1,
      w: SLIDE_W - 1.2,
      h: 0.55,
      fontFace: FONT,
      fontSize: 11,
      italic: true,
      color: COLORS.muted,
      align: "left",
    },
  );

  addFooterBar(pres, slide, data, 28);
}

// =========================================================================
// Slide 29 — Balanço Orçamentário (introdução)
// =========================================================================

/**
 * Slide de abertura da seção de Balanço Orçamentário. Texto descritivo
 * conforme LC 101/2000 Art. 52, I, que trata da demonstração da
 * execução das receitas e despesas do exercício.
 */
function addSlide29BalancoIntro(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "BALANÇO ORÇAMENTÁRIO");

  slide.addText("Balanço Orçamentário", {
    x: 1.0,
    y: 1.15,
    w: SLIDE_W - 2.0,
    h: 0.8,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  slide.addText(
    "O Balanço Orçamentário demonstra, em conformidade com a Lei de " +
      "Responsabilidade Fiscal, a execução das receitas e das despesas " +
      "do exercício, comparando o que foi previsto com o que efetivamente " +
      "foi arrecadado e executado. Por meio desse instrumento é possível " +
      "apurar o resultado orçamentário (superávit ou déficit) do ente " +
      "municipal e avaliar a aderência entre a LOA e sua execução.",
    {
      x: 1.5,
      y: 2.3,
      w: SLIDE_W - 3.0,
      h: 3.0,
      fontFace: FONT,
      fontSize: 18,
      color: COLORS.dark,
      align: "justify",
      valign: "top",
      paraSpaceAfter: 10,
    },
  );

  // Caixa com base legal
  slide.addShape(pres.ShapeType.rect, {
    x: 3.5,
    y: 5.8,
    w: SLIDE_W - 7.0,
    h: 0.75,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 1.5 },
  });
  slide.addText("LC 101/2000, Art. 52, I  —  RREO Anexo 01", {
    x: 3.5,
    y: 5.8,
    w: SLIDE_W - 7.0,
    h: 0.75,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    italic: true,
    color: COLORS.primary,
    align: "center",
    valign: "middle",
  });

  addFooterBar(pres, slide, data, 29);
}

// =========================================================================
// Slides 30 e 31 — Balanço: tabelas de receitas e despesas
// =========================================================================

/**
 * Renderiza um slide de balanço com uma tabela de 4 colunas
 * (Categoria, Ano Anterior, Ano Atual, Diferença). Linhas cujo rótulo
 * começa com "SUBTOTAL" ou "TOTAL" ficam destacadas em azul. A coluna
 * "Diferença" é colorida verde/vermelho conforme o sinal.
 *
 * Reaproveitado pelos slides 30 (Receitas) e 31 (Despesas).
 */
function addBalancoTabelaSlide(
  pres: Pptx,
  data: AudienciaData,
  args: {
    pageNum: number;
    titulo: string;
    subtitulo: string;
    linhas: BalancoOrcamentarioLinha[];
  },
): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, args.titulo);

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  slide.addText(args.subtitulo, {
    x: 0.5,
    y: 1.3,
    w: SLIDE_W - 1.0,
    h: 0.5,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  const anoAtual = data.params.ano;
  const anoAnterior = anoAtual - 1;
  const colLabelAtual = periodoColunaLabel(
    data.params.quadrimestre,
    anoAtual,
  );
  const colLabelAnterior = periodoColunaLabel(
    data.params.quadrimestre,
    anoAnterior,
  );

  if (args.linhas.length === 0) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados do RREO Anexo 01 não puderam ser carregados para este " +
        "período.",
    );
    addFooterBar(pres, slide, data, args.pageNum);
    return;
  }

  // Cabeçalho
  const headerOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.primary },
    align: "center" as const,
    valign: "middle" as const,
  };
  const headerRow = [
    { text: "CATEGORIA", options: { ...headerOpts, align: "left" as const } },
    { text: colLabelAnterior, options: headerOpts },
    { text: colLabelAtual, options: headerOpts },
    { text: "DIFERENÇA", options: headerOpts },
  ];

  // Corpo
  const bodyRows = args.linhas.map((l, idx) => {
    const rot = l.rotulo.toUpperCase();
    const isSubtotal = rot.startsWith("SUBTOTAL") || rot.startsWith("TOTAL");
    const fill = isSubtotal
      ? COLORS.accent
      : idx % 2 === 0
        ? COLORS.bg
        : COLORS.white;
    const baseColor = isSubtotal ? COLORS.white : COLORS.dark;
    const bold = isSubtotal;
    const diffColor = isSubtotal
      ? COLORS.white
      : l.diferenca >= 0
        ? COLORS.success
        : COLORS.danger;
    return [
      {
        text: l.rotulo,
        options: {
          bold,
          color: baseColor,
          fill: { color: fill },
          align: "left" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(l.anoAnterior),
        options: {
          bold,
          color: baseColor,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(l.anoAtual),
        options: {
          bold,
          color: baseColor,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(l.diferenca),
        options: {
          bold: true,
          color: diffColor,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
    ];
  });

  slide.addTable([headerRow, ...bodyRows], {
    x: 0.8,
    y: 2.0,
    w: SLIDE_W - 1.6,
    rowH: 0.55,
    fontFace: FONT,
    fontSize: 13,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [4.733, 2.4, 2.4, 2.2],
  });

  slide.addText(
    "Valores corrigidos pelo IPCA até 31/12 do ano anterior. " +
      "Fonte: RREO Anexo 01 (SICONFI / STN).",
    {
      x: 0.8,
      y: SLIDE_H - 1.0,
      w: SLIDE_W - 1.6,
      h: 0.45,
      fontFace: FONT,
      fontSize: 11,
      italic: true,
      color: COLORS.muted,
      align: "left",
    },
  );

  addFooterBar(pres, slide, data, args.pageNum);
}

/** Rótulo curto "jan–dez/YY" para coluna de tabela. */
function periodoColunaLabel(q: 1 | 2 | 3, ano: number): string {
  const yy = String(ano).slice(-2);
  if (q === 1) return `jan–abr/${yy}`;
  if (q === 2) return `jan–ago/${yy}`;
  return `jan–dez/${yy}`;
}

// =========================================================================
// Slide 30 — Balanço Orçamentário: Receitas
// =========================================================================

function addSlide30BalancoReceitas(pres: Pptx, data: AudienciaData): void {
  addBalancoTabelaSlide(pres, data, {
    pageNum: 30,
    titulo: "BALANÇO ORÇAMENTÁRIO  —  RECEITAS",
    subtitulo: "Execução das Receitas",
    linhas: data.balancoOrcamentario?.receitas ?? [],
  });
}

// =========================================================================
// Slide 31 — Balanço Orçamentário: Despesas
// =========================================================================

function addSlide31BalancoDespesas(pres: Pptx, data: AudienciaData): void {
  // No 3º quadrimestre a LRF exige despesas empenhadas; no 1º e 2º,
  // empenhadas e liquidadas — a apresentação histórica da SEMFAZ usa
  // "liquidadas" como referência nos quadrimestres parciais.
  const q = data.params.quadrimestre;
  const subtitulo =
    q === 3 ? "Execução das Despesas Empenhadas" : "Execução das Despesas Liquidadas";

  addBalancoTabelaSlide(pres, data, {
    pageNum: 31,
    titulo: "BALANÇO ORÇAMENTÁRIO  —  DESPESAS",
    subtitulo,
    linhas: data.balancoOrcamentario?.despesas ?? [],
  });
}

// =========================================================================
// Slide 32 — Balanço Orçamentário: Resultado do exercício
// =========================================================================

/**
 * Compara o resultado orçamentário (superávit/déficit) do ano anterior
 * com o do ano atual em dois cards lado a lado. Valor positivo é
 * superávit (verde) e negativo é déficit (vermelho).
 */
function addSlide32BalancoResultado(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "BALANÇO ORÇAMENTÁRIO  —  RESULTADO");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  slide.addText("Resultado Orçamentário do Exercício", {
    x: 0.5,
    y: 1.3,
    w: SLIDE_W - 1.0,
    h: 0.55,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  const res = data.balancoOrcamentario?.resultadoSuperavit;
  if (!res) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "O resultado do Balanço Orçamentário não pôde ser calculado " +
        "para este período.",
    );
    addFooterBar(pres, slide, data, 32);
    return;
  }

  const anoAtual = data.params.ano;
  const anoAnterior = anoAtual - 1;

  // Dois cards lado a lado
  const cardY = 2.3;
  const cardH = 3.6;
  const cardW = 5.6;
  const cardGap = 0.333;
  const totalCardsW = 2 * cardW + cardGap;
  const card1X = (SLIDE_W - totalCardsW) / 2;
  const card2X = card1X + cardW + cardGap;

  const drawResultadoCard = (
    x: number,
    ano: number,
    valor: number,
  ): void => {
    const isSuperavit = valor >= 0;
    const corValor = isSuperavit ? COLORS.success : COLORS.danger;
    const tipo = isSuperavit ? "SUPERÁVIT" : "DÉFICIT";
    const periodoLabel = periodoColunaLabel(data.params.quadrimestre, ano);

    slide.addShape(pres.ShapeType.rect, {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: COLORS.light },
      line: { color: COLORS.accent, width: 2 },
    });

    slide.addText(periodoLabel.toUpperCase(), {
      x,
      y: cardY + 0.25,
      w: cardW,
      h: 0.45,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      charSpacing: 4,
      color: COLORS.primary,
      align: "center",
    });

    slide.addShape(pres.ShapeType.line, {
      x: x + 1.0,
      y: cardY + 0.8,
      w: cardW - 2.0,
      h: 0,
      line: { color: COLORS.accent, width: 1 },
    });

    slide.addText(tipo, {
      x,
      y: cardY + 0.95,
      w: cardW,
      h: 0.5,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      charSpacing: 3,
      color: corValor,
      align: "center",
    });

    slide.addText(fmtMi(Math.abs(valor)), {
      x,
      y: cardY + 1.55,
      w: cardW,
      h: 1.2,
      fontFace: FONT,
      fontSize: 40,
      bold: true,
      color: COLORS.dark,
      align: "center",
      valign: "middle",
    });

    slide.addText(
      isSuperavit
        ? "Receita executada > Despesa executada"
        : "Despesa executada > Receita executada",
      {
        x,
        y: cardY + 2.85,
        w: cardW,
        h: 0.45,
        fontFace: FONT,
        fontSize: 12,
        italic: true,
        color: COLORS.muted,
        align: "center",
      },
    );
  };

  drawResultadoCard(card1X, anoAnterior, res.anoAnterior);
  drawResultadoCard(card2X, anoAtual, res.anoAtual);

  addFooterBar(pres, slide, data, 32);
}

// =========================================================================
// Slide 33 — RCL (introdução)
// =========================================================================

/**
 * Slide de abertura da seção de RCL (Receita Corrente Líquida).
 * Descreve o conceito conforme LC 101/2000 Art. 2º, IV e detalha as
 * deduções legais previstas em lei.
 */
function addSlide33RclIntro(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RECEITA CORRENTE LÍQUIDA  —  RCL");

  slide.addText("Receita Corrente Líquida", {
    x: 1.0,
    y: 1.15,
    w: SLIDE_W - 2.0,
    h: 0.8,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  slide.addText(
    "A Receita Corrente Líquida (RCL) é o somatório das receitas " +
      "correntes do ente municipal — tributárias, de contribuições, " +
      "patrimoniais, industriais, agropecuárias, de serviços, " +
      "transferências correntes e outras receitas correntes — " +
      "apurada nos últimos doze meses, deduzidas as contribuições " +
      "dos servidores para o custeio do seu sistema de previdência " +
      "e assistência social e as receitas provenientes da " +
      "compensação financeira referida no § 9º do art. 201 da " +
      "Constituição Federal. A RCL é a base de cálculo dos limites " +
      "de despesa com pessoal e de endividamento previstos na LRF.",
    {
      x: 1.0,
      y: 2.2,
      w: SLIDE_W - 2.0,
      h: 3.5,
      fontFace: FONT,
      fontSize: 16,
      color: COLORS.dark,
      align: "justify",
      valign: "top",
      paraSpaceAfter: 8,
    },
  );

  // Caixa com base legal
  slide.addShape(pres.ShapeType.rect, {
    x: 3.0,
    y: 5.95,
    w: SLIDE_W - 6.0,
    h: 0.75,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 1.5 },
  });
  slide.addText("LC 101/2000, Art. 2º, IV  —  RREO Anexo 03", {
    x: 3.0,
    y: 5.95,
    w: SLIDE_W - 6.0,
    h: 0.75,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    italic: true,
    color: COLORS.primary,
    align: "center",
    valign: "middle",
  });

  addFooterBar(pres, slide, data, 33);
}

// =========================================================================
// Slide 34 — RCL: valor apurado e RCL ajustada
// =========================================================================

/**
 * Apresenta o valor da RCL dos últimos 12 meses em um banner central
 * e, abaixo, dois cards com a RCL ajustada para os limites de
 * endividamento e de despesa com pessoal.
 */
function addSlide34RclValor(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RECEITA CORRENTE LÍQUIDA  —  APURAÇÃO");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  const rcl = data.rcl;
  if (!rcl) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados do RREO Anexo 03 não puderam ser carregados para este " +
        "período.",
    );
    addFooterBar(pres, slide, data, 34);
    return;
  }

  // Banner com a RCL total
  slide.addShape(pres.ShapeType.rect, {
    x: 1.5,
    y: 1.4,
    w: SLIDE_W - 3.0,
    h: 1.8,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText("RECEITA CORRENTE LÍQUIDA  —  ÚLTIMOS 12 MESES", {
    x: 1.5,
    y: 1.55,
    w: SLIDE_W - 3.0,
    h: 0.5,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    charSpacing: 4,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText(fmtMi(rcl.valorTotal), {
    x: 1.5,
    y: 2.05,
    w: SLIDE_W - 3.0,
    h: 1.15,
    fontFace: FONT,
    fontSize: 46,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });

  // Dois cards abaixo: RCL ajustada (endividamento) e RCL ajustada (pessoal)
  const cardY = 3.65;
  const cardH = 2.9;
  const cardW = 5.6;
  const cardGap = 0.333;
  const totalCardsW = 2 * cardW + cardGap;
  const card1X = (SLIDE_W - totalCardsW) / 2;
  const card2X = card1X + cardW + cardGap;

  const drawRclAjustadaCard = (
    x: number,
    label: string,
    finalidade: string,
    valor: number,
  ): void => {
    slide.addShape(pres.ShapeType.rect, {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: COLORS.light },
      line: { color: COLORS.accent, width: 2 },
    });
    slide.addText(label, {
      x,
      y: cardY + 0.25,
      w: cardW,
      h: 0.5,
      fontFace: FONT,
      fontSize: 14,
      bold: true,
      charSpacing: 3,
      color: COLORS.primary,
      align: "center",
    });
    slide.addShape(pres.ShapeType.line, {
      x: x + 1.0,
      y: cardY + 0.85,
      w: cardW - 2.0,
      h: 0,
      line: { color: COLORS.accent, width: 1 },
    });
    slide.addText(fmtMi(valor), {
      x,
      y: cardY + 1.0,
      w: cardW,
      h: 1.1,
      fontFace: FONT,
      fontSize: 32,
      bold: true,
      color: COLORS.dark,
      align: "center",
      valign: "middle",
    });
    slide.addText(finalidade, {
      x: x + 0.3,
      y: cardY + 2.25,
      w: cardW - 0.6,
      h: 0.5,
      fontFace: FONT,
      fontSize: 12,
      italic: true,
      color: COLORS.muted,
      align: "center",
    });
  };

  drawRclAjustadaCard(
    card1X,
    "RCL AJUSTADA  —  ENDIVIDAMENTO",
    "Base para cálculo dos limites de dívida consolidada e operações de crédito",
    rcl.ajustadaEndividamento,
  );
  drawRclAjustadaCard(
    card2X,
    "RCL AJUSTADA  —  PESSOAL",
    "Base para cálculo do limite de despesa total com pessoal",
    rcl.ajustadaPessoal,
  );

  addFooterBar(pres, slide, data, 34);
}

// =========================================================================
// Slide 35 — Resultado Primário e Nominal
// =========================================================================

/**
 * Apresenta, em dois cards lado a lado, o Resultado Primário
 * (capacidade de pagamento) e o Resultado Nominal (grau de
 * endividamento), este último com as DCLs do quadrimestre anterior
 * e atual. Atenção à inversão semântica no nominal: valor positivo
 * representa aumento da DCL (desfavorável — vermelho) e valor
 * negativo representa redução da DCL (favorável — verde).
 */
function addSlide35Resultados(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RESULTADO PRIMÁRIO E NOMINAL");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  const res = data.resultados;
  if (!res) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados do RREO Anexo 06 não puderam ser carregados para este " +
        "período.",
    );
    addFooterBar(pres, slide, data, 35);
    return;
  }

  // Dois cards
  const cardY = 1.55;
  const cardH = 5.0;
  const cardW = 5.6;
  const cardGap = 0.333;
  const totalCardsW = 2 * cardW + cardGap;
  const card1X = (SLIDE_W - totalCardsW) / 2;
  const card2X = card1X + cardW + cardGap;

  // --------- Card 1: Resultado Primário ---------
  const primario = res.resultadoPrimario;
  const primarioSuperavit = primario >= 0;
  const corPrimario = primarioSuperavit ? COLORS.success : COLORS.danger;

  slide.addShape(pres.ShapeType.rect, {
    x: card1X,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 2 },
  });
  slide.addText("RESULTADO PRIMÁRIO", {
    x: card1X,
    y: cardY + 0.3,
    w: cardW,
    h: 0.5,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    charSpacing: 4,
    color: COLORS.primary,
    align: "center",
  });
  slide.addText("Capacidade de pagamento do ente", {
    x: card1X,
    y: cardY + 0.85,
    w: cardW,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "center",
  });
  slide.addShape(pres.ShapeType.line, {
    x: card1X + 1.0,
    y: cardY + 1.3,
    w: cardW - 2.0,
    h: 0,
    line: { color: COLORS.accent, width: 1 },
  });
  slide.addText(primarioSuperavit ? "SUPERÁVIT" : "DÉFICIT", {
    x: card1X,
    y: cardY + 1.5,
    w: cardW,
    h: 0.55,
    fontFace: FONT,
    fontSize: 18,
    bold: true,
    charSpacing: 3,
    color: corPrimario,
    align: "center",
  });
  slide.addText(fmtMi(Math.abs(primario)), {
    x: card1X,
    y: cardY + 2.1,
    w: cardW,
    h: 1.4,
    fontFace: FONT,
    fontSize: 38,
    bold: true,
    color: COLORS.dark,
    align: "center",
    valign: "middle",
  });
  slide.addText(
    primarioSuperavit
      ? "Receitas primárias > despesas primárias"
      : "Despesas primárias > receitas primárias",
    {
      x: card1X + 0.3,
      y: cardY + 3.65,
      w: cardW - 0.6,
      h: 0.4,
      fontFace: FONT,
      fontSize: 11,
      italic: true,
      color: COLORS.muted,
      align: "center",
    },
  );
  slide.addText("RREO Anexo 06", {
    x: card1X,
    y: cardY + 4.25,
    w: cardW,
    h: 0.4,
    fontFace: FONT,
    fontSize: 10,
    italic: true,
    color: COLORS.primary,
    align: "center",
  });

  // --------- Card 2: Resultado Nominal ---------
  // Atenção: semântica INVERTIDA — aumento da DCL é desfavorável.
  const nominal = res.resultadoNominal;
  const nominalFavoravel = nominal <= 0;
  const corNominal = nominalFavoravel ? COLORS.success : COLORS.danger;

  slide.addShape(pres.ShapeType.rect, {
    x: card2X,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 2 },
  });
  slide.addText("RESULTADO NOMINAL", {
    x: card2X,
    y: cardY + 0.3,
    w: cardW,
    h: 0.5,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    charSpacing: 4,
    color: COLORS.primary,
    align: "center",
  });
  slide.addText("Variação da Dívida Consolidada Líquida (DCL)", {
    x: card2X,
    y: cardY + 0.85,
    w: cardW,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "center",
  });
  slide.addShape(pres.ShapeType.line, {
    x: card2X + 1.0,
    y: cardY + 1.3,
    w: cardW - 2.0,
    h: 0,
    line: { color: COLORS.accent, width: 1 },
  });
  slide.addText(nominalFavoravel ? "REDUÇÃO DA DCL" : "AUMENTO DA DCL", {
    x: card2X,
    y: cardY + 1.5,
    w: cardW,
    h: 0.55,
    fontFace: FONT,
    fontSize: 18,
    bold: true,
    charSpacing: 3,
    color: corNominal,
    align: "center",
  });
  slide.addText(fmtMi(Math.abs(nominal)), {
    x: card2X,
    y: cardY + 2.1,
    w: cardW,
    h: 1.4,
    fontFace: FONT,
    fontSize: 38,
    bold: true,
    color: COLORS.dark,
    align: "center",
    valign: "middle",
  });

  // Linhas com DCL anterior e atual
  slide.addText(
    [
      {
        text: "DCL anterior: ",
        options: { color: COLORS.muted, fontSize: 11, italic: true },
      },
      {
        text: fmtMi(res.dclAnterior),
        options: { color: COLORS.dark, fontSize: 11, bold: true },
      },
      { text: "     ", options: { fontSize: 11 } },
      {
        text: "DCL atual: ",
        options: { color: COLORS.muted, fontSize: 11, italic: true },
      },
      {
        text: fmtMi(res.dclAtual),
        options: { color: COLORS.dark, fontSize: 11, bold: true },
      },
    ],
    {
      x: card2X + 0.2,
      y: cardY + 3.65,
      w: cardW - 0.4,
      h: 0.4,
      fontFace: FONT,
      align: "center",
    },
  );
  slide.addText("RREO Anexo 06", {
    x: card2X,
    y: cardY + 4.25,
    w: cardW,
    h: 0.4,
    fontFace: FONT,
    fontSize: 10,
    italic: true,
    color: COLORS.primary,
    align: "center",
  });

  addFooterBar(pres, slide, data, 35);
}

// =========================================================================
// Slides 36 e 37 — Indicadores constitucionais (educação e saúde)
// =========================================================================

/**
 * Desenha um card de indicador (mínimo × aplicado × percentual) com
 * cores semáforo baseadas no cumprimento do limite mínimo.
 */
function drawIndicadorCard(
  pres: Pptx,
  slide: Slide,
  args: {
    x: number;
    y: number;
    w: number;
    h: number;
    titulo: string;
    minimoLabel: string;
    minimoValor: string;
    aplicadoLabel: string;
    aplicadoValor: string;
    percentual: number;
    limiteMinimo: number;
    fonte: string;
  },
): void {
  const atingido = args.percentual >= args.limiteMinimo;
  const corStatus = atingido ? COLORS.success : COLORS.danger;

  slide.addShape(pres.ShapeType.rect, {
    x: args.x,
    y: args.y,
    w: args.w,
    h: args.h,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 2 },
  });

  slide.addText(args.titulo, {
    x: args.x,
    y: args.y + 0.15,
    w: args.w,
    h: 0.45,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: COLORS.primary,
    align: "center",
  });

  slide.addShape(pres.ShapeType.line, {
    x: args.x + 0.5,
    y: args.y + 0.65,
    w: args.w - 1.0,
    h: 0,
    line: { color: COLORS.accent, width: 1 },
  });

  // Mínimo
  slide.addText(args.minimoLabel, {
    x: args.x + 0.2,
    y: args.y + 0.8,
    w: args.w - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });
  slide.addText(args.minimoValor, {
    x: args.x + 0.2,
    y: args.y + 0.8,
    w: args.w - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: COLORS.dark,
    align: "right",
  });

  // Aplicado
  slide.addText(args.aplicadoLabel, {
    x: args.x + 0.2,
    y: args.y + 1.15,
    w: args.w - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });
  slide.addText(args.aplicadoValor, {
    x: args.x + 0.2,
    y: args.y + 1.15,
    w: args.w - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: COLORS.dark,
    align: "right",
  });

  // Percentual grande
  slide.addText(fmtPct(args.percentual), {
    x: args.x,
    y: args.y + 1.6,
    w: args.w,
    h: 1.1,
    fontFace: FONT,
    fontSize: 42,
    bold: true,
    color: corStatus,
    align: "center",
    valign: "middle",
  });

  slide.addText(atingido ? "LIMITE ATINGIDO" : "LIMITE NÃO ATINGIDO", {
    x: args.x,
    y: args.y + args.h - 0.75,
    w: args.w,
    h: 0.35,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    charSpacing: 2,
    color: corStatus,
    align: "center",
  });

  slide.addText(args.fonte, {
    x: args.x,
    y: args.y + args.h - 0.4,
    w: args.w,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    italic: true,
    color: COLORS.muted,
    align: "center",
  });
}

/**
 * Desenha o bloco superior dos slides 36/37 com as três linhas de
 * receita (Impostos, Transferências, Total) que servem de base para
 * os percentuais constitucionais.
 */
function drawReceitaBaseBlock(
  pres: Pptx,
  slide: Slide,
  args: {
    impostos: number;
    transferencias: number;
    total: number;
  },
): void {
  const blockX = 0.8;
  const blockY = 1.4;
  const blockW = SLIDE_W - 1.6;
  const blockH = 0.95;

  slide.addShape(pres.ShapeType.rect, {
    x: blockX,
    y: blockY,
    w: blockW,
    h: blockH,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });

  slide.addText("RECEITA-BASE PARA O INDICADOR CONSTITUCIONAL", {
    x: blockX,
    y: blockY + 0.08,
    w: blockW,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    charSpacing: 3,
    color: COLORS.gold,
    align: "center",
  });

  slide.addText(
    [
      {
        text: "Impostos: ",
        options: { color: COLORS.light, fontSize: 14, italic: true },
      },
      {
        text: fmtMi(args.impostos),
        options: { color: COLORS.white, fontSize: 15, bold: true },
      },
      { text: "      +      ", options: { color: COLORS.gold, fontSize: 15 } },
      {
        text: "Transferências: ",
        options: { color: COLORS.light, fontSize: 14, italic: true },
      },
      {
        text: fmtMi(args.transferencias),
        options: { color: COLORS.white, fontSize: 15, bold: true },
      },
      { text: "      =      ", options: { color: COLORS.gold, fontSize: 15 } },
      {
        text: "Total: ",
        options: { color: COLORS.light, fontSize: 14, italic: true },
      },
      {
        text: fmtMi(args.total),
        options: { color: COLORS.gold, fontSize: 16, bold: true },
      },
    ],
    {
      x: blockX,
      y: blockY + 0.4,
      w: blockW,
      h: 0.5,
      fontFace: FONT,
      align: "center",
      valign: "middle",
    },
  );
}

// =========================================================================
// Slide 36 — Indicador de Educação (MDE 25% + FUNDEB)
// =========================================================================

function addSlide36IndicadorEducacao(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "INDICADORES CONSTITUCIONAIS  —  EDUCAÇÃO");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  const edu = data.indicadorEducacao;
  if (!edu) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados do RREO Anexo 08 (Educação / FUNDEB) não puderam ser " +
        "carregados para este período.",
    );
    addFooterBar(pres, slide, data, 36);
    return;
  }

  // Linha superior com a receita-base
  drawReceitaBaseBlock(pres, slide, {
    impostos: edu.receitaImpostos,
    transferencias: edu.receitaTransferencias,
    total: edu.receitaTotal,
  });

  // Três cards lado a lado
  const cardY = 2.65;
  const cardH = 4.0;
  const cardW = 4.05;
  const cardGap = 0.25;
  const totalCardsW = 3 * cardW + 2 * cardGap;
  const card1X = (SLIDE_W - totalCardsW) / 2;
  const card2X = card1X + cardW + cardGap;
  const card3X = card2X + cardW + cardGap;

  // Card 1 — MDE 25%
  drawIndicadorCard(pres, slide, {
    x: card1X,
    y: cardY,
    w: cardW,
    h: cardH,
    titulo: "MDE  —  MÍNIMO 25%",
    minimoLabel: "Mínimo (25%):",
    minimoValor: fmtMi(edu.minimoMde),
    aplicadoLabel: "Aplicado:",
    aplicadoValor: fmtMi(edu.aplicadoMde),
    percentual: edu.percentualMde,
    limiteMinimo: 0.25,
    fonte: "CF/88 Art. 212  •  RREO Anexo 08",
  });

  // Card 2 — FUNDEB Resultado Líquido
  const fundebLiquido = edu.resultadoLiquidoFundeb;
  const fundebPositivo = fundebLiquido >= 0;
  const corFundeb = fundebPositivo ? COLORS.success : COLORS.danger;

  slide.addShape(pres.ShapeType.rect, {
    x: card2X,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 2 },
  });
  slide.addText("FUNDEB  —  RESULTADO LÍQUIDO", {
    x: card2X,
    y: cardY + 0.15,
    w: cardW,
    h: 0.45,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: COLORS.primary,
    align: "center",
  });
  slide.addShape(pres.ShapeType.line, {
    x: card2X + 0.5,
    y: cardY + 0.65,
    w: cardW - 1.0,
    h: 0,
    line: { color: COLORS.accent, width: 1 },
  });
  slide.addText("Destinado (20%):", {
    x: card2X + 0.2,
    y: cardY + 0.8,
    w: cardW - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });
  slide.addText(fmtMi(edu.destinadoFundeb), {
    x: card2X + 0.2,
    y: cardY + 0.8,
    w: cardW - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: COLORS.dark,
    align: "right",
  });
  slide.addText("Retorno:", {
    x: card2X + 0.2,
    y: cardY + 1.15,
    w: cardW - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });
  slide.addText(fmtMi(edu.retornoFundeb), {
    x: card2X + 0.2,
    y: cardY + 1.15,
    w: cardW - 0.4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: COLORS.dark,
    align: "right",
  });
  slide.addText(fmtMi(Math.abs(fundebLiquido)), {
    x: card2X,
    y: cardY + 1.6,
    w: cardW,
    h: 1.1,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: corFundeb,
    align: "center",
    valign: "middle",
  });
  slide.addText(fundebPositivo ? "SUPERÁVIT" : "DÉFICIT", {
    x: card2X,
    y: cardY + 2.7,
    w: cardW,
    h: 0.4,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: corFundeb,
    align: "center",
  });
  slide.addText(
    fundebPositivo
      ? "Retorno > destinado ao fundo"
      : "Destinado > retorno do fundo",
    {
      x: card2X + 0.2,
      y: cardY + cardH - 0.75,
      w: cardW - 0.4,
      h: 0.3,
      fontFace: FONT,
      fontSize: 10,
      italic: true,
      color: COLORS.muted,
      align: "center",
    },
  );
  slide.addText("RREO Anexo 08", {
    x: card2X,
    y: cardY + cardH - 0.4,
    w: cardW,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    italic: true,
    color: COLORS.muted,
    align: "center",
  });

  // Card 3 — FUNDEB Profissionais 70%
  drawIndicadorCard(pres, slide, {
    x: card3X,
    y: cardY,
    w: cardW,
    h: cardH,
    titulo: "FUNDEB PROFISSIONAIS  —  MÍNIMO 70%",
    minimoLabel: "Mínimo (70%):",
    minimoValor: fmtMi(edu.fundebProfissionaisMinimo),
    aplicadoLabel: "Aplicado:",
    aplicadoValor: fmtMi(edu.fundebProfissionaisAplicado),
    percentual: edu.fundebProfissionaisPercentual,
    limiteMinimo: 0.7,
    fonte: "Lei 14.113/2020 Art. 26  •  RREO Anexo 08",
  });

  addFooterBar(pres, slide, data, 36);
}

// =========================================================================
// Slide 37 — Indicador de Saúde (ASPS 15%)
// =========================================================================

function addSlide37IndicadorSaude(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "INDICADORES CONSTITUCIONAIS  —  SAÚDE");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  const saude = data.indicadorSaude;
  if (!saude) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados do RREO Anexo 12 (Saúde / ASPS) não puderam ser " +
        "carregados para este período.",
    );
    addFooterBar(pres, slide, data, 37);
    return;
  }

  // Linha superior com a receita-base
  drawReceitaBaseBlock(pres, slide, {
    impostos: saude.receitaImpostos,
    transferencias: saude.receitaTransferencias,
    total: saude.receitaTotal,
  });

  // Um card central grande
  const cardW = 6.5;
  const cardH = 4.0;
  const cardX = (SLIDE_W - cardW) / 2;
  const cardY = 2.75;

  drawIndicadorCard(pres, slide, {
    x: cardX,
    y: cardY,
    w: cardW,
    h: cardH,
    titulo: "ASPS  —  AÇÕES E SERVIÇOS PÚBLICOS DE SAÚDE  —  MÍNIMO 15%",
    minimoLabel: "Mínimo (15%):",
    minimoValor: fmtMi(saude.minimoAsps),
    aplicadoLabel: "Aplicado:",
    aplicadoValor: fmtMi(saude.aplicadoAsps),
    percentual: saude.percentualAsps,
    limiteMinimo: 0.15,
    fonte: "CF/88 Art. 198, § 2º, III  •  LC 141/2012  •  RREO Anexo 12",
  });

  addFooterBar(pres, slide, data, 37);
}

// =========================================================================
// Slide 38 — RGF (introdução)
// =========================================================================

/**
 * Slide de abertura da seção do Relatório de Gestão Fiscal. Texto
 * descritivo conforme LC 101/2000 Arts. 54 e 55, que instituem o RGF
 * como instrumento quadrimestral de demonstração do cumprimento dos
 * limites de pessoal, dívida, garantias, operações de crédito e
 * inscrição em restos a pagar.
 */
function addSlide38RgfIntro(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RGF  —  RELATÓRIO DE GESTÃO FISCAL");

  slide.addText("Relatório de Gestão Fiscal", {
    x: 1.0,
    y: 1.15,
    w: SLIDE_W - 2.0,
    h: 0.8,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  slide.addText(
    "O Relatório de Gestão Fiscal (RGF) é o instrumento de " +
      "transparência fiscal exigido pela Lei de Responsabilidade " +
      "Fiscal. Publicado ao final de cada quadrimestre, ele demonstra " +
      "a posição do ente federado perante os limites e condições " +
      "previstos em lei para a despesa total com pessoal, a dívida " +
      "consolidada, a concessão de garantias, as operações de crédito " +
      "e a inscrição em restos a pagar, consolidando todos os poderes " +
      "e órgãos do município.",
    {
      x: 1.0,
      y: 2.2,
      w: SLIDE_W - 2.0,
      h: 3.4,
      fontFace: FONT,
      fontSize: 16,
      color: COLORS.dark,
      align: "justify",
      valign: "top",
      paraSpaceAfter: 8,
    },
  );

  // Caixa com base legal
  slide.addShape(pres.ShapeType.rect, {
    x: 3.0,
    y: 5.95,
    w: SLIDE_W - 6.0,
    h: 0.75,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 1.5 },
  });
  slide.addText("LC 101/2000, Arts. 54 e 55  —  RGF Anexos 01 a 06", {
    x: 3.0,
    y: 5.95,
    w: SLIDE_W - 6.0,
    h: 0.75,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    italic: true,
    color: COLORS.primary,
    align: "center",
    valign: "middle",
  });

  addFooterBar(pres, slide, data, 38);
}

// =========================================================================
// Slide 39 — RGF: Despesa Total com Pessoal
// =========================================================================

/**
 * Demonstra a Despesa Total com Pessoal (DTP) em percentual da RCL
 * ajustada e compara contra os três limites legais: alerta (48,6%),
 * prudencial (51,3%) e máximo (54%). O banner superior mostra o
 * percentual DTP/RCL em destaque com um rótulo de situação colorido.
 * A tabela inferior lista os três limites com o status individual.
 */
function addSlide39Pessoal(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RGF  —  DESPESA TOTAL COM PESSOAL");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  const pessoal = data.pessoal;
  if (!pessoal) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados do RGF Anexo 01 (despesas com pessoal) não puderam " +
        "ser carregados para este período.",
    );
    addFooterBar(pres, slide, data, 39);
    return;
  }

  const pct = pessoal.percentualDtp;
  const limMaxRcl = 0.54;
  const limPruRcl = 0.513;
  const limAlertaRcl = 0.486;
  const ultrapassouMaximo = pct > limMaxRcl;
  const ultrapassouPrudencial = pct > limPruRcl;
  const ultrapassouAlerta = pct > limAlertaRcl;

  const statusLabel = ultrapassouMaximo
    ? "LIMITE MÁXIMO ULTRAPASSADO"
    : ultrapassouPrudencial
      ? "LIMITE PRUDENCIAL ULTRAPASSADO"
      : ultrapassouAlerta
        ? "LIMITE DE ALERTA ULTRAPASSADO"
        : "ABAIXO DO LIMITE DE ALERTA";
  const statusColor = ultrapassouMaximo
    ? "FFA0A0"
    : ultrapassouPrudencial
      ? "FFCE9E"
      : COLORS.gold;

  // Banner com o % DTP / RCL ajustada
  slide.addShape(pres.ShapeType.rect, {
    x: 1.5,
    y: 1.4,
    w: SLIDE_W - 3.0,
    h: 2.0,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText("DESPESA TOTAL COM PESSOAL  /  RCL AJUSTADA", {
    x: 1.5,
    y: 1.5,
    w: SLIDE_W - 3.0,
    h: 0.45,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    charSpacing: 4,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText(fmtPct(pct), {
    x: 1.5,
    y: 1.95,
    w: SLIDE_W - 3.0,
    h: 1.05,
    fontFace: FONT,
    fontSize: 44,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });
  slide.addText(statusLabel, {
    x: 1.5,
    y: 3.0,
    w: SLIDE_W - 3.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: statusColor,
    align: "center",
  });

  // Linha DTP / RCL Ajustada em rich-text
  slide.addText(
    [
      {
        text: "DTP: ",
        options: { color: COLORS.muted, fontSize: 12, italic: true },
      },
      {
        text: fmtMi(pessoal.dtp),
        options: { color: COLORS.dark, fontSize: 13, bold: true },
      },
      { text: "          ", options: { fontSize: 13 } },
      {
        text: "RCL Ajustada: ",
        options: { color: COLORS.muted, fontSize: 12, italic: true },
      },
      {
        text: fmtMi(pessoal.rclAjustada),
        options: { color: COLORS.dark, fontSize: 13, bold: true },
      },
    ],
    {
      x: 1.5,
      y: 3.55,
      w: SLIDE_W - 3.0,
      h: 0.35,
      fontFace: FONT,
      align: "center",
    },
  );

  // Tabela com os 3 limites
  const headerOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.primary },
    align: "center" as const,
    valign: "middle" as const,
  };
  const headerRow = [
    { text: "LIMITE", options: { ...headerOpts, align: "left" as const } },
    { text: "% RCL", options: headerOpts },
    { text: "VALOR", options: headerOpts },
    { text: "STATUS", options: headerOpts },
  ];

  const makeLimiteRow = (
    label: string,
    limitePct: number,
    limiteValor: number,
    ultrapassou: boolean,
    idx: number,
  ) => {
    const fill = idx % 2 === 0 ? COLORS.bg : COLORS.white;
    const statusCor = ultrapassou ? COLORS.danger : COLORS.success;
    return [
      {
        text: label,
        options: {
          bold: true,
          color: COLORS.dark,
          fill: { color: fill },
          align: "left" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtPct(limitePct),
        options: {
          color: COLORS.dark,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(limiteValor),
        options: {
          color: COLORS.dark,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
      {
        text: ultrapassou ? "ULTRAPASSADO" : "OK",
        options: {
          bold: true,
          color: statusCor,
          fill: { color: fill },
          align: "center" as const,
          valign: "middle" as const,
        },
      },
    ];
  };

  const bodyRows = [
    makeLimiteRow(
      "Limite Máximo  —  54% RCL",
      limMaxRcl,
      pessoal.limiteMaximo,
      ultrapassouMaximo,
      0,
    ),
    makeLimiteRow(
      "Limite Prudencial  —  51,3% RCL",
      limPruRcl,
      pessoal.limitePrudencial,
      ultrapassouPrudencial,
      1,
    ),
    makeLimiteRow(
      "Limite de Alerta  —  48,6% RCL",
      limAlertaRcl,
      pessoal.limiteAlerta,
      ultrapassouAlerta,
      2,
    ),
  ];

  slide.addTable([headerRow, ...bodyRows], {
    x: 0.8,
    y: 4.1,
    w: SLIDE_W - 1.6,
    rowH: 0.55,
    fontFace: FONT,
    fontSize: 13,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [5.633, 1.9, 2.4, 1.8],
  });

  slide.addText(
    "LC 101/2000, Art. 20, III, b (Municípios)  •  RGF Anexo 01",
    {
      x: 0.8,
      y: SLIDE_H - 1.05,
      w: SLIDE_W - 1.6,
      h: 0.4,
      fontFace: FONT,
      fontSize: 11,
      italic: true,
      color: COLORS.muted,
      align: "left",
    },
  );

  addFooterBar(pres, slide, data, 39);
}

// =========================================================================
// Slide 40 — RGF: Dívida Consolidada
// =========================================================================

/**
 * Mostra a Dívida Consolidada Líquida (DCL) em percentual da RCL
 * ajustada, comparando-a com o limite máximo do Senado (120% RCL).
 * Banner superior com o percentual em destaque; duas tabelas lado a
 * lado abaixo — a da esquerda apresenta a composição da DCL
 * (DC − deduções = DCL) junto da RCL ajustada e do limite; a da
 * direita detalha os componentes das deduções totais.
 */
function addSlide40DividaConsolidada(
  pres: Pptx,
  data: AudienciaData,
): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RGF  —  DÍVIDA CONSOLIDADA LÍQUIDA");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  const dc = data.dividaConsolidada;
  if (!dc) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados do RGF Anexo 02 (dívida consolidada) não puderam " +
        "ser carregados para este período.",
    );
    addFooterBar(pres, slide, data, 40);
    return;
  }

  const pctDcl = dc.percentualDcl;
  const limMaxRcl = 1.2;
  const ultrapassou = pctDcl > limMaxRcl;
  const statusLabel = ultrapassou
    ? "LIMITE MÁXIMO ULTRAPASSADO"
    : "ABAIXO DO LIMITE MÁXIMO";
  const statusColor = ultrapassou ? "FFA0A0" : COLORS.gold;

  // Banner com o % DCL / RCL ajustada
  slide.addShape(pres.ShapeType.rect, {
    x: 1.5,
    y: 1.4,
    w: SLIDE_W - 3.0,
    h: 1.85,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText("DÍVIDA CONSOLIDADA LÍQUIDA  /  RCL AJUSTADA", {
    x: 1.5,
    y: 1.5,
    w: SLIDE_W - 3.0,
    h: 0.45,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    charSpacing: 4,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText(fmtPct(pctDcl), {
    x: 1.5,
    y: 1.95,
    w: SLIDE_W - 3.0,
    h: 0.9,
    fontFace: FONT,
    fontSize: 42,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });
  slide.addText(statusLabel, {
    x: 1.5,
    y: 2.85,
    w: SLIDE_W - 3.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: statusColor,
    align: "center",
  });

  // Duas tabelas lado a lado
  const tblW = 6.0;
  const tblGap = 0.2;
  const tblTotalW = 2 * tblW + tblGap;
  const tblX1 = (SLIDE_W - tblTotalW) / 2;
  const tblX2 = tblX1 + tblW + tblGap;
  const tblY = 3.5;

  // ---- Tabela esquerda: Composição da DCL ----
  slide.addText("COMPOSIÇÃO DA DCL", {
    x: tblX1,
    y: tblY,
    w: tblW,
    h: 0.4,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: COLORS.primary,
    align: "center",
  });

  const makeCompRow = (
    label: string,
    valor: number,
    opts: {
      bold?: boolean;
      highlight?: boolean;
      color?: string;
      idx: number;
    },
  ) => {
    const fill = opts.highlight
      ? COLORS.light
      : opts.idx % 2 === 0
        ? COLORS.bg
        : COLORS.white;
    const color = opts.color ?? COLORS.dark;
    return [
      {
        text: label,
        options: {
          bold: opts.bold ?? false,
          color,
          fill: { color: fill },
          align: "left" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(valor),
        options: {
          bold: opts.bold ?? false,
          color,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
    ];
  };

  const compBody = [
    makeCompRow("Dívida Consolidada  (DC)", dc.dc, { idx: 0 }),
    makeCompRow("(−) Deduções Totais", -Math.abs(dc.deducoesTotal), {
      idx: 1,
      color: COLORS.danger,
    }),
    makeCompRow("(=) DCL", dc.dcl, {
      idx: 2,
      bold: true,
      highlight: true,
      color: COLORS.primary,
    }),
    makeCompRow("RCL Ajustada (base)", dc.rclAjustada, { idx: 3 }),
    makeCompRow("Limite Máximo  —  120% RCL", dc.limiteMaximo, {
      idx: 4,
      bold: true,
      color: COLORS.primary,
    }),
  ];

  slide.addTable(compBody, {
    x: tblX1,
    y: tblY + 0.45,
    w: tblW,
    rowH: 0.48,
    fontFace: FONT,
    fontSize: 12,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [3.8, 2.2],
  });

  // ---- Tabela direita: Detalhamento das deduções ----
  slide.addText("DETALHAMENTO DAS DEDUÇÕES", {
    x: tblX2,
    y: tblY,
    w: tblW,
    h: 0.4,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: COLORS.primary,
    align: "center",
  });

  const makeDedRow = (
    label: string,
    valor: number,
    opts: { bold?: boolean; highlight?: boolean; idx: number },
  ) => {
    const fill = opts.highlight
      ? COLORS.light
      : opts.idx % 2 === 0
        ? COLORS.bg
        : COLORS.white;
    const color = opts.highlight ? COLORS.primary : COLORS.dark;
    return [
      {
        text: label,
        options: {
          bold: opts.bold ?? false,
          color,
          fill: { color: fill },
          align: "left" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(valor),
        options: {
          bold: opts.bold ?? false,
          color,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
    ];
  };

  const dedBody = [
    makeDedRow("Disponibilidade de Caixa", dc.disponibilidadeCaixa, { idx: 0 }),
    makeDedRow("(−) Restos a Pagar", -Math.abs(dc.restosAPagar), { idx: 1 }),
    makeDedRow(
      "(−) Depósitos Restituíveis",
      -Math.abs(dc.depositosRestituiveis),
      { idx: 2 },
    ),
    makeDedRow("Demais Haveres", dc.demaisHaveres, { idx: 3 }),
    makeDedRow("(=) Total das Deduções", dc.deducoesTotal, {
      idx: 4,
      bold: true,
      highlight: true,
    }),
  ];

  slide.addTable(dedBody, {
    x: tblX2,
    y: tblY + 0.45,
    w: tblW,
    rowH: 0.48,
    fontFace: FONT,
    fontSize: 12,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [3.8, 2.2],
  });

  slide.addText(
    "LC 101/2000 Art. 3º  •  Resolução SF nº 40/2001  •  RGF Anexo 02",
    {
      x: 0.8,
      y: SLIDE_H - 1.05,
      w: SLIDE_W - 1.6,
      h: 0.4,
      fontFace: FONT,
      fontSize: 11,
      italic: true,
      color: COLORS.muted,
      align: "left",
    },
  );

  addFooterBar(pres, slide, data, 40);
}

// =========================================================================
// Slide 41 — RGF: Composição da Dívida
// =========================================================================

/**
 * Detalha a composição da dívida consolidada por tipo, comparando os
 * saldos do quadrimestre anterior com os do quadrimestre atual e
 * mostrando a diferença (colorida verde quando reduziu e vermelho
 * quando aumentou — redução é favorável).
 */
function addSlide41ComposicaoDivida(
  pres: Pptx,
  data: AudienciaData,
): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RGF  —  COMPOSIÇÃO DA DÍVIDA");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  slide.addText("Composição da Dívida Consolidada por Tipo", {
    x: 0.5,
    y: 1.3,
    w: SLIDE_W - 1.0,
    h: 0.5,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  const linhas = data.composicaoDivida;
  if (linhas.length === 0) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados detalhados da composição da dívida não puderam ser " +
        "carregados para este período.",
    );
    addFooterBar(pres, slide, data, 41);
    return;
  }

  const anoAtual = data.params.ano;
  const anoAnterior = anoAtual - 1;
  const colLabelAtual = periodoColunaLabel(
    data.params.quadrimestre,
    anoAtual,
  );
  const colLabelAnterior = periodoColunaLabel(
    data.params.quadrimestre,
    anoAnterior,
  );

  // Cabeçalho
  const headerOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.primary },
    align: "center" as const,
    valign: "middle" as const,
  };
  const headerRow = [
    { text: "TIPO", options: { ...headerOpts, align: "left" as const } },
    { text: colLabelAnterior, options: headerOpts },
    { text: colLabelAtual, options: headerOpts },
    { text: "DIFERENÇA", options: headerOpts },
  ];

  // Totais
  const totalAnterior = linhas.reduce((s, l) => s + l.anoAnterior, 0);
  const totalAtual = linhas.reduce((s, l) => s + l.anoAtual, 0);
  const totalDiferenca = totalAtual - totalAnterior;

  const bodyRows = linhas.map((l, idx) => {
    const diferenca = l.anoAtual - l.anoAnterior;
    const fill = idx % 2 === 0 ? COLORS.bg : COLORS.white;
    // Atenção: para dívida, aumento é desfavorável (vermelho).
    const diffColor = diferenca <= 0 ? COLORS.success : COLORS.danger;
    return [
      {
        text: l.tipo,
        options: {
          color: COLORS.dark,
          fill: { color: fill },
          align: "left" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(l.anoAnterior),
        options: {
          color: COLORS.dark,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(l.anoAtual),
        options: {
          color: COLORS.dark,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(diferenca),
        options: {
          bold: true,
          color: diffColor,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
    ];
  });

  const totalRowOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.accent },
    valign: "middle" as const,
  };
  const totalRow = [
    { text: "TOTAL", options: { ...totalRowOpts, align: "left" as const } },
    {
      text: fmtMi(totalAnterior),
      options: { ...totalRowOpts, align: "right" as const },
    },
    {
      text: fmtMi(totalAtual),
      options: { ...totalRowOpts, align: "right" as const },
    },
    {
      text: fmtMi(totalDiferenca),
      options: { ...totalRowOpts, align: "right" as const },
    },
  ];

  slide.addTable([headerRow, ...bodyRows, totalRow], {
    x: 0.8,
    y: 1.95,
    w: SLIDE_W - 1.6,
    rowH: 0.55,
    fontFace: FONT,
    fontSize: 13,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [4.733, 2.4, 2.4, 2.2],
  });

  slide.addText(
    "Redução dos saldos é favorável (verde) e aumento é desfavorável " +
      "(vermelho). Fonte: RGF Anexo 02 — Demonstrativo da Dívida " +
      "Consolidada Líquida.",
    {
      x: 0.8,
      y: SLIDE_H - 1.05,
      w: SLIDE_W - 1.6,
      h: 0.4,
      fontFace: FONT,
      fontSize: 11,
      italic: true,
      color: COLORS.muted,
      align: "left",
    },
  );

  addFooterBar(pres, slide, data, 41);
}

// =========================================================================
// Slide 42 — RGF: Garantias e Contragarantias
// =========================================================================

/**
 * Slide explicativo sobre o limite legal de concessão de garantias
 * previsto na Resolução SF nº 43/2001 e no art. 40 da LRF. Os dados
 * do RGF Anexo 03 ainda não estão contemplados no `AudienciaData`,
 * portanto este slide apresenta apenas o enquadramento legal e a
 * base normativa.
 */
function addSlide42Garantias(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RGF  —  GARANTIAS E CONTRAGARANTIAS");

  slide.addText("Garantias e Contragarantias", {
    x: 1.0,
    y: 1.15,
    w: SLIDE_W - 2.0,
    h: 0.7,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: COLORS.primary,
    align: "center",
  });

  slide.addText(
    "A concessão de garantias por entes federados está sujeita aos " +
      "limites previstos na Resolução do Senado Federal nº 43/2001 " +
      "e ao regramento do art. 40 da LRF, que exige contrapartida " +
      "em contragarantias de valor igual ou superior. O saldo das " +
      "garantias concedidas, somado às contragarantias recebidas, " +
      "compõe o RGF Anexo 03 e é confrontado contra o limite de 22% " +
      "da Receita Corrente Líquida.",
    {
      x: 1.0,
      y: 2.1,
      w: SLIDE_W - 2.0,
      h: 2.8,
      fontFace: FONT,
      fontSize: 16,
      color: COLORS.dark,
      align: "justify",
      valign: "top",
      paraSpaceAfter: 8,
    },
  );

  // Caixa de destaque com o limite
  slide.addShape(pres.ShapeType.rect, {
    x: 2.5,
    y: 5.0,
    w: SLIDE_W - 5.0,
    h: 1.0,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText("LIMITE MÁXIMO DE GARANTIAS CONCEDIDAS", {
    x: 2.5,
    y: 5.05,
    w: SLIDE_W - 5.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    charSpacing: 3,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText("22% da Receita Corrente Líquida", {
    x: 2.5,
    y: 5.4,
    w: SLIDE_W - 5.0,
    h: 0.55,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });

  // Caixa com base legal
  slide.addShape(pres.ShapeType.rect, {
    x: 3.0,
    y: 6.3,
    w: SLIDE_W - 6.0,
    h: 0.55,
    fill: { color: COLORS.light },
    line: { color: COLORS.accent, width: 1.5 },
  });
  slide.addText(
    "LC 101/2000, Art. 40  •  Resolução SF nº 43/2001  •  RGF Anexo 03",
    {
      x: 3.0,
      y: 6.3,
      w: SLIDE_W - 6.0,
      h: 0.55,
      fontFace: FONT,
      fontSize: 12,
      bold: true,
      italic: true,
      color: COLORS.primary,
      align: "center",
      valign: "middle",
    },
  );

  addFooterBar(pres, slide, data, 42);
}

// =========================================================================
// Slide 43 — RGF: Operações de Crédito
// =========================================================================

/**
 * Apresenta as operações de crédito contratadas no exercício em
 * percentual da RCL ajustada e compara com os limites legais do
 * Senado: limite geral de 16% e limite de alerta de 14,4%.
 */
function addSlide43OperacoesCredito(
  pres: Pptx,
  data: AudienciaData,
): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };

  addHeaderBar(pres, slide, "RGF  —  OPERAÇÕES DE CRÉDITO");

  slide.addText(`PERÍODO REFERENTE: ${data.periodoRef}`, {
    x: 0.5,
    y: 0.85,
    w: 7.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    italic: true,
    color: COLORS.muted,
    align: "left",
  });

  const op = data.operacoesCredito;
  if (!op) {
    addDadosNaoDisponiveis(
      pres,
      slide,
      "Os dados do RGF Anexo 04 (operações de crédito) não puderam " +
        "ser carregados para este período.",
    );
    addFooterBar(pres, slide, data, 43);
    return;
  }

  const pct = op.rclAjustada > 0 ? op.valorRealizado / op.rclAjustada : 0;
  const limGeralRcl = 0.16;
  const limAlertaRcl = 0.144;
  const ultrapassouGeral = pct > limGeralRcl;
  const ultrapassouAlerta = pct > limAlertaRcl;

  const statusLabel = ultrapassouGeral
    ? "LIMITE GERAL ULTRAPASSADO"
    : ultrapassouAlerta
      ? "LIMITE DE ALERTA ULTRAPASSADO"
      : "ABAIXO DO LIMITE DE ALERTA";
  const statusColor = ultrapassouGeral
    ? "FFA0A0"
    : ultrapassouAlerta
      ? "FFCE9E"
      : COLORS.gold;

  // Banner com o % realizado / RCL ajustada
  slide.addShape(pres.ShapeType.rect, {
    x: 1.5,
    y: 1.4,
    w: SLIDE_W - 3.0,
    h: 2.0,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary },
  });
  slide.addText("OPERAÇÕES DE CRÉDITO  /  RCL AJUSTADA", {
    x: 1.5,
    y: 1.5,
    w: SLIDE_W - 3.0,
    h: 0.45,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    charSpacing: 4,
    color: COLORS.gold,
    align: "center",
  });
  slide.addText(fmtPct(pct), {
    x: 1.5,
    y: 1.95,
    w: SLIDE_W - 3.0,
    h: 1.05,
    fontFace: FONT,
    fontSize: 44,
    bold: true,
    color: COLORS.white,
    align: "center",
    valign: "middle",
  });
  slide.addText(statusLabel, {
    x: 1.5,
    y: 3.0,
    w: SLIDE_W - 3.0,
    h: 0.35,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: statusColor,
    align: "center",
  });

  // Linha Realizado / RCL Ajustada em rich-text
  slide.addText(
    [
      {
        text: "Realizado: ",
        options: { color: COLORS.muted, fontSize: 12, italic: true },
      },
      {
        text: fmtMi(op.valorRealizado),
        options: { color: COLORS.dark, fontSize: 13, bold: true },
      },
      { text: "          ", options: { fontSize: 13 } },
      {
        text: "RCL Ajustada: ",
        options: { color: COLORS.muted, fontSize: 12, italic: true },
      },
      {
        text: fmtMi(op.rclAjustada),
        options: { color: COLORS.dark, fontSize: 13, bold: true },
      },
    ],
    {
      x: 1.5,
      y: 3.55,
      w: SLIDE_W - 3.0,
      h: 0.35,
      fontFace: FONT,
      align: "center",
    },
  );

  // Tabela com os 2 limites
  const headerOpts = {
    bold: true,
    color: COLORS.white,
    fill: { color: COLORS.primary },
    align: "center" as const,
    valign: "middle" as const,
  };
  const headerRow = [
    { text: "LIMITE", options: { ...headerOpts, align: "left" as const } },
    { text: "% RCL", options: headerOpts },
    { text: "VALOR", options: headerOpts },
    { text: "STATUS", options: headerOpts },
  ];

  const makeLimiteRow = (
    label: string,
    limitePct: number,
    limiteValor: number,
    ultrapassou: boolean,
    idx: number,
  ) => {
    const fill = idx % 2 === 0 ? COLORS.bg : COLORS.white;
    const statusCor = ultrapassou ? COLORS.danger : COLORS.success;
    return [
      {
        text: label,
        options: {
          bold: true,
          color: COLORS.dark,
          fill: { color: fill },
          align: "left" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtPct(limitePct),
        options: {
          color: COLORS.dark,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
      {
        text: fmtMi(limiteValor),
        options: {
          color: COLORS.dark,
          fill: { color: fill },
          align: "right" as const,
          valign: "middle" as const,
        },
      },
      {
        text: ultrapassou ? "ULTRAPASSADO" : "OK",
        options: {
          bold: true,
          color: statusCor,
          fill: { color: fill },
          align: "center" as const,
          valign: "middle" as const,
        },
      },
    ];
  };

  const bodyRows = [
    makeLimiteRow(
      "Limite Geral  —  16% RCL",
      limGeralRcl,
      op.limiteGeral,
      ultrapassouGeral,
      0,
    ),
    makeLimiteRow(
      "Limite de Alerta  —  14,4% RCL",
      limAlertaRcl,
      op.limiteAlerta,
      ultrapassouAlerta,
      1,
    ),
  ];

  slide.addTable([headerRow, ...bodyRows], {
    x: 0.8,
    y: 4.2,
    w: SLIDE_W - 1.6,
    rowH: 0.6,
    fontFace: FONT,
    fontSize: 13,
    border: { type: "solid", pt: 0.5, color: COLORS.muted },
    colW: [5.633, 1.9, 2.4, 1.8],
  });

  slide.addText(
    "Resolução SF nº 43/2001, Art. 7º  •  RGF Anexo 04",
    {
      x: 0.8,
      y: SLIDE_H - 1.05,
      w: SLIDE_W - 1.6,
      h: 0.4,
      fontFace: FONT,
      fontSize: 11,
      italic: true,
      color: COLORS.muted,
      align: "left",
    },
  );

  addFooterBar(pres, slide, data, 43);
}

// =========================================================================
// Slide 44 — Fechamento
// =========================================================================

/**
 * Slide final da apresentação. Reaproveita o estilo da capa (fundo
 * azul institucional, faixa lateral dourada) e destaca um "OBRIGADO!"
 * em letras grandes seguido da identificação do apresentador, cargo
 * e instituição.
 */
function addSlide44Fechamento(pres: Pptx, data: AudienciaData): void {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.primary };

  // Faixa decorativa lateral dourada
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.35,
    h: SLIDE_H,
    fill: { color: COLORS.gold },
    line: { color: COLORS.gold },
  });

  // Título principal: OBRIGADO!
  slide.addText("OBRIGADO!", {
    x: 1.0,
    y: 1.9,
    w: SLIDE_W - 2.0,
    h: 1.4,
    fontFace: FONT,
    fontSize: 84,
    bold: true,
    color: COLORS.white,
    align: "center",
    charSpacing: 8,
  });

  // Linha separadora dourada
  slide.addShape(pres.ShapeType.line, {
    x: 3.5,
    y: 3.55,
    w: SLIDE_W - 7.0,
    h: 0,
    line: { color: COLORS.gold, width: 2 },
  });

  // Subtítulo: título da audiência
  slide.addText(
    `AUDIÊNCIA PÚBLICA  —  ${data.tituloQuadrimestre.toUpperCase()}`,
    {
      x: 1.0,
      y: 3.8,
      w: SLIDE_W - 2.0,
      h: 0.6,
      fontFace: FONT,
      fontSize: 22,
      bold: true,
      charSpacing: 4,
      color: COLORS.gold,
      align: "center",
    },
  );

  // Data da apresentação
  slide.addText(data.params.dataApresentacao, {
    x: 1.0,
    y: 4.4,
    w: SLIDE_W - 2.0,
    h: 0.4,
    fontFace: FONT,
    fontSize: 16,
    italic: true,
    color: COLORS.light,
    align: "center",
  });

  // Apresentador (nome + cargo)
  slide.addText(data.params.apresentador, {
    x: 1.0,
    y: 5.3,
    w: SLIDE_W - 2.0,
    h: 0.55,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: COLORS.white,
    align: "center",
  });
  slide.addText(data.params.cargoApresentador, {
    x: 1.0,
    y: 5.85,
    w: SLIDE_W - 2.0,
    h: 0.45,
    fontFace: FONT,
    fontSize: 15,
    italic: true,
    color: COLORS.light,
    align: "center",
  });

  // Rodapé institucional
  slide.addText(
    "SECRETARIA MUNICIPAL DA FAZENDA  —  SEMFAZ  •  PREFEITURA DE SÃO LUÍS",
    {
      x: 1.0,
      y: 6.8,
      w: SLIDE_W - 2.0,
      h: 0.4,
      fontFace: FONT,
      fontSize: 12,
      italic: true,
      color: COLORS.light,
      align: "center",
      charSpacing: 2,
    },
  );
}

// =========================================================================
// Função principal
// =========================================================================

/**
 * Constrói a apresentação PPTX completa (44 slides) a partir dos
 * dados já coletados. Retorna um `Buffer` pronto para ser servido
 * em um endpoint HTTP
 * (`Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`).
 */
export async function buildAudienciaPptx(
  data: AudienciaData,
): Promise<Buffer> {
  const pres = new PptxGenJS();

  pres.layout = "LAYOUT_WIDE";
  pres.title = `Audiência Pública — ${data.tituloQuadrimestre}`;
  pres.author = data.params.apresentador;
  pres.company = "SEMFAZ — Prefeitura de São Luís";
  pres.subject = "Apresentação LRF (LC 101/2000)";

  // Slides 1 a 5 — capa, apresentador, objetivo, ofícios
  addSlide01Capa(pres, data);
  addSlide02CapaApresentador(pres, data);
  addSlide03Objetivo(pres, data);
  addSlide04OficioSemfaz(pres, data);
  addSlide05OficioCamara(pres, data);

  // Slides 6 e 7 — RREO introdução e notas metodológicas
  addSlide06RreoIntro(pres, data);
  addSlide07RreoNotas(pres, data);

  // Slides 8 a 12 — Receitas tributárias individuais
  const tituloTributarias = "Receitas Municipais  —  Tributárias";
  addReceitaDetalheSlide(pres, data, data.tributarias.iss, tituloTributarias, 8);
  addReceitaDetalheSlide(pres, data, data.tributarias.iptu, tituloTributarias, 9);
  addReceitaDetalheSlide(pres, data, data.tributarias.itbi, tituloTributarias, 10);
  addReceitaDetalheSlide(pres, data, data.tributarias.ir, tituloTributarias, 11);
  addReceitaDetalheSlide(pres, data, data.tributarias.taxas, tituloTributarias, 12);

  // Slide 13 — Total das Receitas Tributárias
  addSlide13TotalTributarias(pres, data);

  // Slides 14 e 15 — Receitas de Contribuições
  const tituloContrib = "Receitas Municipais  —  Contribuições";
  addReceitaDetalheSlide(
    pres, data, data.contribuicoes.sociais, tituloContrib, 14,
  );
  addReceitaDetalheSlide(
    pres, data, data.contribuicoes.cosip, tituloContrib, 15,
  );

  // Slides 16 e 17 — Patrimoniais e Outras Receitas Correntes
  addReceitaDetalheSlide(
    pres, data, data.receitaPatrimonial,
    "Receitas Municipais  —  Patrimoniais", 16,
  );
  addReceitaDetalheSlide(
    pres, data, data.outrasReceitasCorrentes,
    "Receitas Municipais  —  Outras Correntes", 17,
  );

  // Slide 18 — Resumo das Receitas Próprias Municipais
  addSlide18ResumoProprias(pres, data);

  // Slides 19 a 25 — Transferências Correntes (total + 6 detalhes)
  const tituloTransf = "Receitas Municipais  —  Transferências Correntes";
  addReceitaDetalheSlide(pres, data, data.transferencias.total, tituloTransf, 19);
  addReceitaDetalheSlide(pres, data, data.transferencias.uniaoFpm, tituloTransf, 20);
  addReceitaDetalheSlide(pres, data, data.transferencias.uniaoSus, tituloTransf, 21);
  addReceitaDetalheSlide(pres, data, data.transferencias.uniaoOutras, tituloTransf, 22);
  addReceitaDetalheSlide(pres, data, data.transferencias.estadoIcms, tituloTransf, 23);
  addReceitaDetalheSlide(pres, data, data.transferencias.estadoIpva, tituloTransf, 24);
  addReceitaDetalheSlide(pres, data, data.transferencias.estadoOutras, tituloTransf, 25);

  // Slide 26 — Resumo das Transferências
  addSlide26ResumoTransferencias(pres, data);

  // Slide 27 — Receita Total (próprias vs transferidos)
  addSlide27ReceitaTotal(pres, data);

  // Slide 28 — Dependência Financeira (evolução 5 anos)
  addSlide28DependenciaFinanceira(pres, data);

  // Slides 29 a 32 — Balanço Orçamentário
  addSlide29BalancoIntro(pres, data);
  addSlide30BalancoReceitas(pres, data);
  addSlide31BalancoDespesas(pres, data);
  addSlide32BalancoResultado(pres, data);

  // Slides 33 e 34 — Receita Corrente Líquida
  addSlide33RclIntro(pres, data);
  addSlide34RclValor(pres, data);

  // Slide 35 — Resultado Primário e Nominal
  addSlide35Resultados(pres, data);

  // Slides 36 e 37 — Indicadores Constitucionais (Educação e Saúde)
  addSlide36IndicadorEducacao(pres, data);
  addSlide37IndicadorSaude(pres, data);

  // Slide 38 — RGF (introdução)
  addSlide38RgfIntro(pres, data);

  // Slide 39 — Despesa Total com Pessoal
  addSlide39Pessoal(pres, data);

  // Slide 40 — Dívida Consolidada Líquida
  addSlide40DividaConsolidada(pres, data);

  // Slide 41 — Composição da Dívida
  addSlide41ComposicaoDivida(pres, data);

  // Slide 42 — Garantias e Contragarantias
  addSlide42Garantias(pres, data);

  // Slide 43 — Operações de Crédito
  addSlide43OperacoesCredito(pres, data);

  // Slide 44 — Fechamento
  addSlide44Fechamento(pres, data);

  const out = await pres.write({ outputType: "nodebuffer" });
  return out as unknown as Buffer;
}
