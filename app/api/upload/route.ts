import { NextRequest, NextResponse } from "next/server";
import { detectFileType } from "@/lib/parsers/detect-file-type";
import { parseReceitaCsvFromBuffer } from "@/lib/parsers/csv-receitas";
import { parseDespesaCsvFromBuffer } from "@/lib/parsers/csv-despesas";
import { parseRreoXlsFromBuffer } from "@/lib/parsers/xls-rreo";
import { parseRgfXlsFromBuffer } from "@/lib/parsers/xls-rgf";
import {
  upsertExercicio,
  insertReceitas,
  insertDespesas,
  insertRreo,
  insertRgf,
  recordUpload,
  updateUploadStatus,
} from "@/lib/db/queries";
import {
  computeAllBimestres,
  type ComputeAnexo12Result,
} from "@/lib/saude/compute-anexo12";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const detected = detectFileType(file.name);

    if (detected.type === "unknown") {
      return NextResponse.json(
        {
          error:
            "Tipo de arquivo não reconhecido. Envie um CSV de Balancete de Receita/Despesa ou XLS de RREO/RGF.",
        },
        { status: 400 },
      );
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
      let recomputeAll: ComputeAnexo12Result[] | null = null;

      switch (detected.type) {
        case "receita_csv": {
          const rows = parseReceitaCsvFromBuffer(buffer);
          await upsertExercicio(detected.year, "receita");
          count = await insertReceitas(detected.year, rows);
          // Recalcula automaticamente todos os 6 bimestres do Anexo 12.
          // Se ainda faltar receita/despesa em algum bimestre, retorna
          // `skipped` com motivo — sem erro.
          recomputeAll = await computeAllBimestres(detected.year);
          break;
        }
        case "despesa_csv": {
          const rows = parseDespesaCsvFromBuffer(buffer);
          await upsertExercicio(detected.year, "despesa");
          count = await insertDespesas(detected.year, rows);
          recomputeAll = await computeAllBimestres(detected.year);
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

      // Resumo do Anexo 12 para a UI: escolhe o último bimestre
      // efetivamente persistido (inserted/updated). Se nenhum foi
      // persistido, retorna o primeiro skip para exibir o motivo.
      let anexo12Summary: ComputeAnexo12Result | null = null;
      if (recomputeAll && recomputeAll.length > 0) {
        const persisted = recomputeAll.filter(
          (r) => r.action === "inserted" || r.action === "updated",
        );
        anexo12Summary =
          persisted[persisted.length - 1] ?? recomputeAll[0] ?? null;
      }

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
          anexo12: anexo12Summary,
          anexo12All: recomputeAll,
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
