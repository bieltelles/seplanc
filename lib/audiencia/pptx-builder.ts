/**
 * Gerador de apresentação PPTX para Audiências Públicas LRF.
 *
 * Recebe um `AudienciaData` já pronto (vindo de `gatherAudienciaData`) e
 * produz um arquivo .pptx com os 44 slides exigidos pelo rito da Câmara
 * Municipal de São Luís.
 *
 * ATENÇÃO — IMPLEMENTAÇÃO PARCIAL
 * -------------------------------
 * Por ora apenas os slides 1 a 5 (capa, capa com apresentador, objetivo,
 * ofício expedido SEMFAZ→CMSL e ofício recebido CMSL→SEMFAZ) estão
 * implementados. Os slides 6 a 44 (RREO, RGF, indicadores e fechamento)
 * serão adicionados em commits subsequentes.
 */

import PptxGenJS from "pptxgenjs";

import type { AudienciaData } from "./types";

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
// Função principal
// =========================================================================

/**
 * Constrói a apresentação PPTX a partir dos dados já coletados.
 *
 * Retorna um `Buffer` pronto para ser servido em um endpoint HTTP
 * (`Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`).
 *
 * NOTA: implementação parcial — por ora apenas os slides 1 a 5 estão
 * criados. Os demais (6 a 44) serão adicionados em iterações seguintes,
 * em commits subsequentes para permitir revisão incremental.
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

  // TODO: slides 6 a 44 (RREO receitas, dependência financeira,
  // balanço orçamentário, RCL, resultados, indicadores, RGF e fechamento).

  const out = await pres.write({ outputType: "nodebuffer" });
  return out as unknown as Buffer;
}
