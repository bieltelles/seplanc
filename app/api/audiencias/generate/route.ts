import { NextRequest, NextResponse } from "next/server";
import { gatherAudienciaData } from "@/lib/audiencia/data-gatherer";
import { buildAudienciaPptx } from "@/lib/audiencia/pptx-builder";
import type {
  AudienciaParams,
  Quadrimestre,
} from "@/lib/audiencia/types";

export const runtime = "nodejs";
// Geração de PPTX pode exceder o limite padrão de 10s do edge; como a rota
// roda em Node, o timeout aqui é controlado pela plataforma (Vercel) — 60s
// é suficiente para os ~5-10s típicos de uma apresentação de 44 slides.
export const maxDuration = 60;

interface GenerateBody {
  ano?: number;
  quadrimestre?: number;
  dataApresentacao?: string;
  apresentador?: string;
  cargoApresentador?: string;
  oficioSemfaz?: string;
  oficioCamara?: string;
  anoBaseCorrecao?: number;
}

/**
 * POST /api/audiencias/generate
 *
 * Recebe os parâmetros da audiência, invoca o gatherer (que consulta
 * o Turso com receitas, RREO e RGF) e devolve o arquivo .pptx pronto
 * para download.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateBody;

    // ---- Validação dos parâmetros obrigatórios ----
    const ano = Number(body.ano);
    const quadRaw = Number(body.quadrimestre);
    const dataApresentacao = (body.dataApresentacao ?? "").trim();
    const apresentador = (body.apresentador ?? "").trim();
    const cargoApresentador = (body.cargoApresentador ?? "").trim();

    if (!Number.isFinite(ano) || ano < 2000 || ano > 2100) {
      return NextResponse.json(
        { error: "Ano inválido. Informe um exercício entre 2000 e 2100." },
        { status: 400 },
      );
    }
    if (quadRaw !== 1 && quadRaw !== 2 && quadRaw !== 3) {
      return NextResponse.json(
        { error: "Quadrimestre inválido. Use 1, 2 ou 3." },
        { status: 400 },
      );
    }
    if (!dataApresentacao) {
      return NextResponse.json(
        { error: "Data da apresentação é obrigatória." },
        { status: 400 },
      );
    }
    if (!apresentador) {
      return NextResponse.json(
        { error: "Nome do apresentador é obrigatório." },
        { status: 400 },
      );
    }
    if (!cargoApresentador) {
      return NextResponse.json(
        { error: "Cargo do apresentador é obrigatório." },
        { status: 400 },
      );
    }

    const anoBase =
      typeof body.anoBaseCorrecao === "number" &&
      Number.isFinite(body.anoBaseCorrecao)
        ? body.anoBaseCorrecao
        : ano;

    const params: AudienciaParams = {
      ano,
      quadrimestre: quadRaw as Quadrimestre,
      dataApresentacao,
      apresentador,
      cargoApresentador,
      oficioSemfaz: body.oficioSemfaz?.trim() || undefined,
      oficioCamara: body.oficioCamara?.trim() || undefined,
      anoBaseCorrecao: anoBase,
    };

    // ---- Coleta + geração ----
    const data = await gatherAudienciaData(params);
    const buffer = await buildAudienciaPptx(data);

    const filename = `Audiencia_${params.quadrimestre}Q_${params.ano}.pptx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[audiencias/generate] erro:", error);
    return NextResponse.json(
      {
        error: "Falha ao gerar apresentação.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
