import { NextRequest, NextResponse } from "next/server";
import { detectFileType } from "@/lib/parsers/detect-file-type";
import { parseReceitaCsvFromBuffer } from "@/lib/parsers/csv-receitas";
import { parseRreoXlsFromBuffer } from "@/lib/parsers/xls-rreo";
import { parseRgfXlsFromBuffer } from "@/lib/parsers/xls-rgf";
import { upsertExercicio, insertReceitas, insertRreo, insertRgf, recordUpload, updateUploadStatus } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const detected = detectFileType(file.name);

    if (detected.type === "unknown") {
      return NextResponse.json({
        error: "Tipo de arquivo não reconhecido. Envie um CSV de Balancete de Receita ou XLS de RREO/RGF.",
      }, { status: 400 });
    }

    if (!detected.year) {
      return NextResponse.json({
        error: "Não foi possível detectar o exercício (ano) a partir do nome do arquivo.",
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadId = await recordUpload(file.name, detected.type, detected.year, detected.period?.toString());

    try {
      let count = 0;

      switch (detected.type) {
        case "receita_csv": {
          const rows = parseReceitaCsvFromBuffer(buffer);
          await upsertExercicio(detected.year, "receita");
          count = await insertReceitas(detected.year, rows);
          break;
        }
        case "rreo_xls": {
          if (!detected.period) {
            throw new Error("Bimestre não detectado no nome do arquivo");
          }
          const rows = parseRreoXlsFromBuffer(buffer);
          await upsertExercicio(detected.year, "rreo");
          count = await insertRreo(detected.year, detected.period, rows);
          break;
        }
        case "rgf_xls": {
          if (!detected.period) {
            throw new Error("Quadrimestre não detectado no nome do arquivo");
          }
          const rows = parseRgfXlsFromBuffer(buffer);
          await upsertExercicio(detected.year, "rgf");
          count = await insertRgf(detected.year, detected.period, detected.entity || "prefeitura", rows);
          break;
        }
      }

      await updateUploadStatus(uploadId, "concluido", count);

      return NextResponse.json({
        success: true,
        message: `Arquivo processado com sucesso`,
        details: {
          type: detected.type,
          label: detected.label,
          year: detected.year,
          period: detected.period,
          entity: detected.entity,
          recordsInserted: count,
        },
      });
    } catch (err) {
      await updateUploadStatus(uploadId, "erro", 0, String(err));
      throw err;
    }
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
