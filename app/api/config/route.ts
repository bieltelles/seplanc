import { NextRequest, NextResponse } from "next/server";
import {
  getAllConfiguracoes,
  setConfiguracao,
  getConfiguracao,
  getLatestIpcaEntry,
  getIpcaCount,
} from "@/lib/db/queries";
import { IPCA_FONTE_NOME, IPCA_FONTE_URL, BCB_IPCA_URL } from "@/lib/ipca/fetch-bcb";

const CONFIG_DEFAULTS: Record<string, { valor: string; descricao: string }> = {
  correcao_tipo_juros: {
    valor: "compostos",
    descricao: "Tipo de juros para correção monetária (compostos ou simples)",
  },
  correcao_padrao_ativa: {
    valor: "false",
    descricao: "Define se a correção monetária deve ser ativada por padrão ao abrir o sistema",
  },
  correcao_indice: {
    valor: "IPCA",
    descricao: "Índice oficial utilizado para correção monetária",
  },
  correcao_ano_base_padrao: {
    valor: String(new Date().getFullYear()),
    descricao:
      "Ano pivô padrão: a partir deste ano os valores ficam correntes; anos anteriores são corrigidos para 31/12 do ano imediatamente anterior",
  },
};

async function ensureDefaults() {
  for (const [chave, def] of Object.entries(CONFIG_DEFAULTS)) {
    const atual = await getConfiguracao(chave);
    if (atual === null) {
      await setConfiguracao(chave, def.valor, def.descricao);
    }
  }
}

export async function GET() {
  try {
    await ensureDefaults();
    const configs = await getAllConfiguracoes();
    const latestIpca = await getLatestIpcaEntry();
    const totalIpca = await getIpcaCount();
    const ultimaAtualizacao = await getConfiguracao("ipca_ultima_atualizacao");

    return NextResponse.json({
      configuracoes: configs,
      ipca: {
        fonte: IPCA_FONTE_NOME,
        fonteUrl: IPCA_FONTE_URL,
        apiUrl: BCB_IPCA_URL,
        totalRegistros: totalIpca,
        ultimoMes: latestIpca
          ? {
              ano: latestIpca.ano,
              mes: latestIpca.mes,
              variacao: latestIpca.variacao_mensal,
              dataReferencia: latestIpca.data_referencia,
              updatedAt: latestIpca.updated_at,
            }
          : null,
        ultimaAtualizacao,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    let body: Record<string, string>;
    try {
      body = (await request.json()) as Record<string, string>;
    } catch (parseErr) {
      return NextResponse.json(
        { error: `Corpo da requisição inválido: ${String(parseErr)}` },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição deve ser um objeto JSON" },
        { status: 400 },
      );
    }

    // Validações básicas
    if (body.correcao_tipo_juros && !["compostos", "simples"].includes(body.correcao_tipo_juros)) {
      return NextResponse.json(
        { error: "correcao_tipo_juros deve ser 'compostos' ou 'simples'" },
        { status: 400 },
      );
    }
    if (body.correcao_padrao_ativa && !["true", "false"].includes(body.correcao_padrao_ativa)) {
      return NextResponse.json(
        { error: "correcao_padrao_ativa deve ser 'true' ou 'false'" },
        { status: 400 },
      );
    }
    if (body.correcao_ano_base_padrao !== undefined) {
      const n = parseInt(body.correcao_ano_base_padrao, 10);
      if (Number.isNaN(n) || n < 2000 || n > 2100) {
        return NextResponse.json(
          { error: "correcao_ano_base_padrao deve ser um ano válido (2000-2100)" },
          { status: 400 },
        );
      }
    }

    const atualizadas: string[] = [];
    for (const [chave, valor] of Object.entries(body)) {
      if (typeof valor !== "string" && typeof valor !== "number") continue;
      const def = CONFIG_DEFAULTS[chave];
      await setConfiguracao(chave, String(valor), def?.descricao);
      atualizadas.push(chave);
    }

    // Resposta enxuta: o cliente refaz o GET depois para obter a lista atualizada.
    return NextResponse.json({ success: true, atualizadas });
  } catch (error) {
    console.error("[api/config PUT] erro:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    );
  }
}
