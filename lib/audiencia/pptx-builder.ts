/**
 * Gerador de apresentação PPTX para Audiências Públicas LRF.
 *
 * Recebe um `AudienciaData` já pronto (vindo de `gatherAudienciaData`) e
 * produz um arquivo .pptx com os 44 slides exigidos pelo rito da Câmara
 * Municipal de São Luís.
 *
 * ATENÇÃO — IMPLEMENTAÇÃO PARCIAL
 * -------------------------------
 * Por ora os slides 1 a 27 (capa, apresentador, objetivo, ofícios, RREO
 * intro, notas, receitas tributárias, contribuições, patrimoniais,
 * outras correntes, resumo de próprias, transferências (total + 6
 * detalhes), resumo de transferências e receita total) estão
 * implementados. Os slides 28 a 44 (dependência financeira, balanço,
 * RCL, resultados, indicadores educação/saúde, RGF pessoal/dívida/
 * composição/garantias/operações e fechamento) serão adicionados em
 * commits subsequentes.
 */

import PptxGenJS from "pptxgenjs";

import type { AudienciaData, CategoriaReceitaDetalhe } from "./types";

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
// Função principal
// =========================================================================

/**
 * Constrói a apresentação PPTX a partir dos dados já coletados.
 *
 * Retorna um `Buffer` pronto para ser servido em um endpoint HTTP
 * (`Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`).
 *
 * NOTA: implementação parcial — por ora os slides 1 a 27 estão criados.
 * Os demais (28 a 44) serão adicionados em iterações seguintes, em
 * commits subsequentes para permitir revisão incremental.
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

  // TODO: slides 28 a 44 (dependência financeira, balanço, RCL,
  // resultados, indicadores, RGF e fechamento).

  const out = await pres.write({ outputType: "nodebuffer" });
  return out as unknown as Buffer;
}
