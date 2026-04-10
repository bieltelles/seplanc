"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/shared/loading";
import {
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Calculator,
  Database,
} from "lucide-react";

interface ConfigRow {
  chave: string;
  valor: string;
  descricao: string | null;
  updated_at: string;
}

interface IpcaMeta {
  fonte: string;
  fonteUrl: string;
  apiUrl: string;
  totalRegistros: number;
  ultimoMes: {
    ano: number;
    mes: number;
    variacao: number;
    dataReferencia: string;
    updatedAt: string;
  } | null;
  ultimaAtualizacao: string | null;
}

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export default function ConfiguracoesPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [ipca, setIpca] = useState<IpcaMeta | null>(null);
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Valores dos forms
  const [tipoJuros, setTipoJuros] = useState<"compostos" | "simples">("compostos");
  const [padraoAtiva, setPadraoAtiva] = useState(false);
  const [anoBasePadrao, setAnoBasePadrao] = useState<number>(new Date().getFullYear());

  async function fetchConfig() {
    try {
      const [configRes, exerciciosRes] = await Promise.all([
        fetch("/api/config"),
        fetch("/api/exercicios"),
      ]);
      const json = await configRes.json();
      const exJson = await exerciciosRes.json();

      const list: ConfigRow[] = json.configuracoes || [];
      setConfigs(list);
      setIpca(json.ipca);

      const anos: number[] = (exJson.anos || [])
        .filter((n: number) => !Number.isNaN(n))
        .sort((a: number, b: number) => b - a);
      setAnosDisponiveis(anos);

      const tj = list.find((c) => c.chave === "correcao_tipo_juros")?.valor;
      const pa = list.find((c) => c.chave === "correcao_padrao_ativa")?.valor;
      const ab = list.find((c) => c.chave === "correcao_ano_base_padrao")?.valor;
      if (tj === "simples" || tj === "compostos") setTipoJuros(tj);
      setPadraoAtiva(pa === "true");
      if (ab) {
        const parsed = parseInt(ab, 10);
        if (!Number.isNaN(parsed)) setAnoBasePadrao(parsed);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchConfig();
  }, []);

  async function handleRefreshIpca() {
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ipca/refresh", { method: "POST" });
      const rawText = await res.text();
      let json: {
        error?: string;
        totalRegistros?: number;
        ultimoMes?: { mes: number; ano: number };
      } = {};
      if (rawText) {
        try {
          json = JSON.parse(rawText);
        } catch {
          // corpo não é JSON
        }
      }
      if (!res.ok) {
        setMessage({
          type: "error",
          text:
            json.error ||
            rawText ||
            `Erro ao atualizar IPCA (HTTP ${res.status} ${res.statusText})`,
        });
        return;
      }
      setMessage({
        type: "success",
        text: `IPCA atualizado: ${json.totalRegistros} registros. Último mês: ${json.ultimoMes?.mes}/${json.ultimoMes?.ano}`,
      });
      await fetchConfig();
    } catch (err) {
      setMessage({ type: "error", text: String(err) });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correcao_tipo_juros: tipoJuros,
          correcao_padrao_ativa: padraoAtiva ? "true" : "false",
          correcao_ano_base_padrao: String(anoBasePadrao),
        }),
      });

      // Parse tolerante: algumas rotas de erro no Vercel retornam corpo vazio.
      const rawText = await res.text();
      let json: { error?: string; success?: boolean } = {};
      if (rawText) {
        try {
          json = JSON.parse(rawText);
        } catch {
          // Corpo não é JSON válido — mantém json vazio e usa rawText no erro.
        }
      }

      if (!res.ok) {
        setMessage({
          type: "error",
          text:
            json.error ||
            rawText ||
            `Erro ao salvar (HTTP ${res.status} ${res.statusText})`,
        });
        return;
      }

      setMessage({ type: "success", text: "Configurações salvas com sucesso" });
      await fetchConfig();
    } catch (err) {
      setMessage({ type: "error", text: String(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Header title="Configurações" subtitle="Parâmetros do sistema" />
        <div className="p-6"><LoadingSpinner /></div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Configurações" subtitle="Parâmetros gerais do sistema e correção monetária" />

      <div className="space-y-6 p-6">
        {message && (
          <div
            className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {message.text}
          </div>
        )}

        {/* Correção Monetária */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              Correção Monetária
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4 text-sm">
              <p className="mb-2 font-medium text-slate-700">Como funciona</p>
              <ul className="list-disc space-y-1 pl-5 text-slate-600">
                <li>
                  O usuário escolhe um <strong>ano pivô</strong> no topo do sistema.
                  Anos <strong>a partir do pivô</strong> permanecem em valores correntes;
                  anos <strong>anteriores</strong> são corrigidos para{" "}
                  <strong>31/12 do ano anterior ao pivô</strong>.
                </li>
                <li>
                  Exemplo: pivô = 2025 → 2025 e 2026 ficam correntes; 2024, 2023, ... são
                  corrigidos para 31/12/2024.
                </li>
                <li>
                  A correção é ativada/desativada pelo botão no topo de cada página, e o
                  pivô é escolhido no seletor ao lado.
                </li>
                <li>
                  O cálculo do acumulado (anual) é derivado da soma dos meses já corrigidos.
                </li>
              </ul>
            </div>

            {/* Tipo de Juros */}
            <div>
              <label className="mb-2 block text-sm font-medium">Tipo de juros</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTipoJuros("compostos")}
                  className={`flex-1 rounded-lg border p-3 text-left text-sm transition-colors ${
                    tipoJuros === "compostos"
                      ? "border-semfaz-500 bg-semfaz-50 text-semfaz-800"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold">Juros compostos</div>
                  <div className="text-xs text-slate-500">
                    fator = (1+r₁)·(1+r₂)·...·(1+rₙ) — padrão oficial IBGE/BCB
                  </div>
                </button>
                <button
                  onClick={() => setTipoJuros("simples")}
                  className={`flex-1 rounded-lg border p-3 text-left text-sm transition-colors ${
                    tipoJuros === "simples"
                      ? "border-semfaz-500 bg-semfaz-50 text-semfaz-800"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold">Juros simples</div>
                  <div className="text-xs text-slate-500">
                    fator = 1 + (r₁ + r₂ + ... + rₙ)
                  </div>
                </button>
              </div>
            </div>

            {/* Ano pivô padrão */}
            <div>
              <label className="mb-2 block text-sm font-medium">
                Ano pivô padrão (data de atualização monetária)
              </label>
              <div className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={String(anoBasePadrao)}
                    onChange={(e) => setAnoBasePadrao(parseInt(e.target.value, 10))}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-semfaz-700 focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                  >
                    {(anosDisponiveis.length > 0
                      ? anosDisponiveis
                      : [new Date().getFullYear(), new Date().getFullYear() - 1]
                    ).map((ano) => (
                      <option key={ano} value={ano}>
                        {ano}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-600">
                    A partir de <strong>{anoBasePadrao}</strong>: valores correntes ·
                    Anos anteriores corrigidos para{" "}
                    <strong>31/12/{anoBasePadrao - 1}</strong>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Este é o valor padrão aplicado ao abrir o sistema. Cada usuário
                  pode alterá-lo temporariamente no seletor ao lado do toggle do topo
                  da página.
                </p>
              </div>
            </div>

            {/* Default */}
            <div>
              <label className="mb-2 block text-sm font-medium">Comportamento padrão</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={padraoAtiva}
                  onChange={(e) => setPadraoAtiva(e.target.checked)}
                  className="h-4 w-4"
                />
                <div>
                  <div className="font-medium">Ativar correção monetária por padrão</div>
                  <div className="text-xs text-slate-500">
                    Quando marcado, novos usuários verão os valores já corrigidos ao abrir o sistema.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar configurações"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* IPCA */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" />
              Índice IPCA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-4 text-sm">
              <p className="mb-1 font-medium text-blue-800">Fonte oficial</p>
              <p className="text-blue-700">{ipca?.fonte}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {ipca?.fonteUrl && (
                  <a
                    href={ipca.fonteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline hover:text-blue-900"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Dados abertos BCB
                  </a>
                )}
                {ipca?.apiUrl && (
                  <a
                    href={ipca.apiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline hover:text-blue-900"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Endpoint da API (JSON)
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total de meses no banco</p>
                <p className="text-2xl font-bold text-semfaz-700">
                  {ipca?.totalRegistros?.toLocaleString("pt-BR") || 0}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Último mês disponível</p>
                <p className="text-2xl font-bold text-semfaz-700">
                  {ipca?.ultimoMes
                    ? `${MONTH_NAMES[ipca.ultimoMes.mes - 1]}/${ipca.ultimoMes.ano}`
                    : "—"}
                </p>
                {ipca?.ultimoMes && (
                  <p className="text-xs text-muted-foreground">
                    Variação: {ipca.ultimoMes.variacao.toFixed(2)}%
                  </p>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Última atualização</p>
                <p className="text-sm font-medium">
                  {ipca?.ultimaAtualizacao
                    ? new Date(ipca.ultimaAtualizacao).toLocaleString("pt-BR")
                    : "Nunca atualizado"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Atualização automática</p>
                <p className="text-xs text-muted-foreground">
                  Configurado via Vercel Cron — executa diariamente para buscar novos índices do BCB.
                </p>
              </div>
              <Badge variant="default">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Ativo
              </Badge>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleRefreshIpca} disabled={refreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Atualizando..." : "Atualizar IPCA agora"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista completa de configs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Todas as configurações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Chave</th>
                    <th className="px-3 py-2 text-left font-medium">Valor</th>
                    <th className="px-3 py-2 text-left font-medium">Descrição</th>
                    <th className="px-3 py-2 text-left font-medium">Atualizado em</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => (
                    <tr key={c.chave} className="border-b">
                      <td className="px-3 py-2 font-mono">{c.chave}</td>
                      <td className="px-3 py-2 font-semibold">{c.valor}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.descricao}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(c.updated_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
