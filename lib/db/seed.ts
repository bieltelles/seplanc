import path from "path";
import fs from "fs";
import { initializeSchema } from "./schema";
import { upsertExercicio, insertReceitas, insertRreo, insertRgf } from "./queries";
import { parseReceitaCsv, extractYearFromFilename } from "@/lib/parsers/csv-receitas";
import { parseRreoXls } from "@/lib/parsers/xls-rreo";
import { parseRgfXls } from "@/lib/parsers/xls-rgf";
import { detectFileType } from "@/lib/parsers/detect-file-type";

const ROOT = process.cwd();

export async function seedDatabase() {
  console.log("Inicializando schema...");
  await initializeSchema();

  // 1. Seed receitas CSVs
  const receitasDir = path.join(ROOT, "arquivos", "receitas");
  const rootCsv = path.join(ROOT, "2026_BALANCETE_RECEITA_ANUAL.csv");

  const csvFiles: string[] = [];

  if (fs.existsSync(receitasDir)) {
    const files = fs.readdirSync(receitasDir).filter((f) => f.endsWith(".csv"));
    csvFiles.push(...files.map((f) => path.join(receitasDir, f)));
  }

  // Add root level CSV if exists and not already included
  if (fs.existsSync(rootCsv)) {
    const alreadyIncluded = csvFiles.some((f) => path.basename(f) === "2026_BALANCETE_RECEITA_ANUAL.csv");
    if (!alreadyIncluded) {
      csvFiles.push(rootCsv);
    }
  }

  console.log(`Encontrados ${csvFiles.length} arquivos CSV de receita`);

  for (const csvPath of csvFiles) {
    const filename = path.basename(csvPath);
    const year = extractYearFromFilename(filename);
    if (!year) {
      console.log(`  Ignorando ${filename}: ano não detectado`);
      continue;
    }

    console.log(`  Processando ${filename}...`);
    try {
      const rows = parseReceitaCsv(csvPath);
      await upsertExercicio(year, "receita");
      const count = await insertReceitas(year, rows);
      console.log(`    → ${count} registros inseridos para ${year}`);
    } catch (err) {
      console.error(`    Erro ao processar ${filename}:`, err);
    }
  }

  // 2. Seed RREO XLS files
  const rreoDir = path.join(ROOT, "arquivos", "RREO");
  if (fs.existsSync(rreoDir)) {
    const xlsFiles = fs.readdirSync(rreoDir).filter((f) => f.endsWith(".xls") || f.endsWith(".xlsx"));
    console.log(`\nEncontrados ${xlsFiles.length} arquivos RREO`);

    for (const xlsFile of xlsFiles) {
      const filePath = path.join(rreoDir, xlsFile);
      const detected = detectFileType(xlsFile);

      if (detected.type !== "rreo_xls" || !detected.year || !detected.period) {
        console.log(`  Ignorando ${xlsFile}: tipo/ano/período não detectado`);
        continue;
      }

      console.log(`  Processando ${xlsFile}...`);
      try {
        const rows = parseRreoXls(filePath);
        await upsertExercicio(detected.year, "rreo");
        const count = await insertRreo(detected.year, detected.period, rows);
        console.log(`    → ${count} registros inseridos`);
      } catch (err) {
        console.error(`    Erro ao processar ${xlsFile}:`, err);
      }
    }
  }

  // 3. Seed RGF XLS files
  const rgfDir = path.join(ROOT, "arquivos", "RGF");
  if (fs.existsSync(rgfDir)) {
    const xlsFiles = fs.readdirSync(rgfDir).filter((f) => f.endsWith(".xls") || f.endsWith(".xlsx"));
    console.log(`\nEncontrados ${xlsFiles.length} arquivos RGF`);

    for (const xlsFile of xlsFiles) {
      const filePath = path.join(rgfDir, xlsFile);
      const detected = detectFileType(xlsFile);

      if (detected.type !== "rgf_xls" || !detected.year || !detected.period) {
        console.log(`  Ignorando ${xlsFile}: tipo/ano/período não detectado`);
        continue;
      }

      console.log(`  Processando ${xlsFile}...`);
      try {
        const rows = parseRgfXls(filePath);
        await upsertExercicio(detected.year, "rgf");
        const count = await insertRgf(detected.year, detected.period, detected.entity || "prefeitura", rows);
        console.log(`    → ${count} registros inseridos`);
      } catch (err) {
        console.error(`    Erro ao processar ${xlsFile}:`, err);
      }
    }
  }

  console.log("\nSeed concluído!");
}

// Check if database is empty and seed if needed
export async function ensureSeeded() {
  await initializeSchema();
  const { getDb } = await import("./connection");
  const db = getDb();
  const result = await db.execute("SELECT COUNT(*) as c FROM receitas");
  const count = result.rows[0] as unknown as { c: number };
  if (count.c === 0) {
    console.log("Banco vazio, executando seed...");
    await seedDatabase();
  }
}
