import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableYears,
  getRreoBimestresDisponiveis,
  getRgfQuadrimestresDisponiveis,
} from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * GET /api/audiencias/status?ano=YYYY&quadrimestre=N
 *
 * Reporta quais datasets já estão carregados no banco para o par
 * (ano, quadrimestre) informado:
 *  - receitas (exercício existe em `receitas`)
 *  - RREO do bimestre correspondente (2, 4 ou 6)
 *  - RGF do quadrimestre/entidade=prefeitura
 *  - histórico de 5 anos (ano-4..ano) para comparabilidade
 *
 * A rota é apenas informativa — o gerador em `/api/audiencias/generate`
 * funciona mesmo com dados parcialmente disponíveis e renderiza os
 * placeholders "DADOS NÃO DISPONÍVEIS" nos slides correspondentes.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const ano = parseInt(sp.get("ano") || "0", 10);
    const quadrimestre = parseInt(sp.get("quadrimestre") || "0", 10);

    const availableYears = (await getAvailableYears()).map((y) => y.ano);

    if (!ano) {
      return NextResponse.json({ anos: availableYears, data: null });
    }

    const bim = quadrimestre === 1 ? 2 : quadrimestre === 2 ? 4 : 6;

    // Checa RREO do ano e do ano anterior (para o balanço comparativo)
    const [bimsAtual, bimsAnterior, rgfQuads] = await Promise.all([
      getRreoBimestresDisponiveis(ano),
      getRreoBimestresDisponiveis(ano - 1),
      getRgfQuadrimestresDisponiveis(ano),
    ]);

    const bimsAtualSet = new Set(
      (bimsAtual as unknown as { bimestre: number }[]).map((r) => r.bimestre),
    );
    const bimsAnteriorSet = new Set(
      (bimsAnterior as unknown as { bimestre: number }[]).map(
        (r) => r.bimestre,
      ),
    );

    const rgfPrefeitura = (
      rgfQuads as unknown as { quadrimestre: number; entidade: string }[]
    )
      .filter((r) => r.entidade === "prefeitura")
      .map((r) => r.quadrimestre);

    const checks = {
      receitasAno: availableYears.includes(ano),
      rreoAno: bimsAtualSet.has(bim),
      rreoAnoAnterior: bimsAnteriorSet.has(bim),
      rgfPrefeitura: rgfPrefeitura.includes(quadrimestre),
      historico5Anos: [ano - 4, ano - 3, ano - 2, ano - 1, ano].filter((a) =>
        availableYears.includes(a),
      ),
    };

    return NextResponse.json({
      anos: availableYears,
      ano,
      quadrimestre,
      bimestreAlvo: bim,
      checks,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
