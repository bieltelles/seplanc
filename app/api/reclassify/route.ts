import { NextResponse } from "next/server";
import { reclassifyAllReceitas } from "@/lib/db/queries";

/**
 * Reaplica a função `classifyRevenue` sobre todas as linhas da tabela
 * `receitas`, atualizando a coluna `categoria_tributaria`. Usado quando a
 * lógica de classificação é corrigida e queremos refletir nos dados já
 * importados sem precisar rodar o seed completo novamente.
 */
export async function POST() {
  try {
    const resultado = await reclassifyAllReceitas();
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    console.error("[api/reclassify POST] erro:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}

// Também aceita GET para facilitar o disparo via browser.
export async function GET() {
  return POST();
}
