"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/shared/loading";
import {
  TAX_CATEGORY_LABELS,
  TAX_CATEGORY_COLORS,
  CONTRIBUICOES_GROUP,
  expandCategoriaFilter,
  type TaxCategory,
} from "@/lib/constants/tax-categories";
import { MONTH_LABELS, formatCurrency } from "@/lib/utils/format";
import { useCorrection } from "@/components/providers/correction-provider";
import { useDeducoes } from "@/components/providers/deducoes-provider";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const CATEGORIES = Object.entries(TAX_CATEGORY_LABELS)
  .filter(([k]) => k !== "OUTROS" && k !== "DEDUCOES")
  .map(([value, label]) => ({ value, label }));

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_KEYS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type ViewMode = "comparison" | "monthly" | "table";

interface SummaryRow {
  exercicio_ano: number;
  categoria_tributaria: string;
  total_arrecadado: number;
  total_orcado: number;
  [key: string]: unknown;
}

interface MonthlyData {
  ano: number;
  monthly: Record<string, number>;
  stats: { total: number; media: number; mediana: number; min: number; max: number; mesMin: string; mesMax: string };
  acumulado: number;
  orcado: number;
  variacao: number | null;
}

export default function ReceitasPage() {
  const { ativa: correcaoAtiva, anoBase, hydrated } = useCorrection();
  const {
    ativa: deducoesAtiva,
    subtipos: deducoesSubtipos,
    hydrated: deducoesHydrated,
    toQueryString: deducoesQueryString,
  } = useDeducoes();
  const [anos, setAnos] = useState<number[]>([]);
  const [selectedAnos, setSelectedAnos] = useState<number[]>([]);
  const [categoria, setCategoria] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("comparison");
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<SummaryRow[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);

  const appendDeducoes = useCallback(
    (params: URLSearchParams): string => {
      const dq = deducoesQueryString();
      const base = params.toString();
      return `${base}${base && dq ? "&" : ""}${dq}`;
    },
    [deducoesQueryString],
  );

  const fetchSummary = useCallback(
    async (selAnos: number[], correcao: boolean, pivot: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selAnos.length > 0) params.set("anos", selAnos.join(","));
        params.set("tipo", "summary");
        if (correcao) {
          params.set("correcao", "1");
          params.set("anoBase", String(pivot));
        }
        const res = await fetch(`/api/receitas?${appendDeducoes(params)}`);
        const json = await res.json();
        setSummaryData(json.data || []);
        setAnos(json.anos || []);
        if (json.selectedAnos && selAnos.length === 0) {
          setSelectedAnos(json.selectedAnos);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [appendDeducoes],
  );

  const fetchMonthly = useCallback(
    async (selAnos: number[], cat: string, correcao: boolean, pivot: number) => {
      if (!cat) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("anos", selAnos.join(","));
        params.set("categoria", cat);
        params.set("tipo", "monthly");
        if (correcao) {
          params.set("correcao", "1");
          params.set("anoBase", String(pivot));
        }
        const res = await fetch(`/api/receitas?${appendDeducoes(params)}`);
        const json = await res.json();
        setMonthlyData(json.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [appendDeducoes],
  );

  useEffect(() => {
    if (!hydrated || !deducoesHydrated) return;
    fetchSummary(selectedAnos, correcaoAtiva, anoBase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    correcaoAtiva,
    anoBase,
    hydrated,
    deducoesHydrated,
    deducoesAtiva,
    deducoesSubtipos.FUNDEB,
    deducoesSubtipos.ABATIMENTO,
    deducoesSubtipos.INTRA,
    deducoesSubtipos.OUTRAS,
  ]);

  useEffect(() => {
    if (!hydrated || !deducoesHydrated) return;
    if (viewMode === "monthly" && categoria && selectedAnos.length > 0) {
      fetchMonthly(selectedAnos, categoria, correcaoAtiva, anoBase);
    }
  }, [
    viewMode,
    categoria,
    selectedAnos,
    fetchMonthly,
    correcaoAtiva,
    anoBase,
    hydrated,
    deducoesHydrated,
    deducoesAtiva,
    deducoesSubtipos.FUNDEB,
    deducoesSubtipos.ABATIMENTO,
    deducoesSubtipos.INTRA,
    deducoesSubtipos.OUTRAS,
  ]);

  const handleAnoToggle = (ano: number) => {
    const newAnos = selectedAnos.includes(ano)
      ? selectedAnos.filter((a) => a !== ano)
      : [...selectedAnos, ano].sort((a, b) => b - a);
    setSelectedAnos(newAnos);
    fetchSummary(newAnos, correcaoAtiva, anoBase);
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (selectedAnos.length > 0) params.set("anos", selectedAnos.join(","));
    if (categoria) params.set("categoria", categoria);
    if (correcaoAtiva) {
      params.set("correcao", "1");
      params.set("anoBase", String(anoBase));
    }
    window.open(`/api/export?${params}`, "_blank");
  };

  // Comparison chart data
  const comparisonData = CATEGORIES.map(({ value: cat, label }) => {
    const entry: Record<string, unknown> = { categoria: label };
    for (const ano of selectedAnos) {
      const row = summaryData.find(
        (d) => d.exercicio_ano === ano && d.categoria_tributaria === cat,
      );
      entry[String(ano)] = row?.total_arrecadado || 0;
    }
    return entry;
  }).filter((d) => {
    return selectedAnos.some((ano) => (d[String(ano)] as number) > 0);
  });

  // Monthly line chart data
  const monthlyChartData = MONTHS_SHORT.map((label, i) => {
    const entry: Record<string, unknown> = { month: label };
    for (const md of monthlyData) {
      entry[String(md.ano)] = md.monthly[MONTHS_KEYS[i]] || 0;
    }
    return entry;
  });

  const COLORS = ["#1e40af", "#3b82f6", "#6366f1", "#0ea5e9", "#14b8a6"];

  const formatTooltipValue = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
    }).format(value);
  };

  return (
    <div>
      <Header title="Análise de Receitas" subtitle="Comparativos e filtros interativos" />

      <div className="space-y-6 p-6">
        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Year selection */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Exercícios</p>
                <div className="flex flex-wrap gap-1.5">
                  {anos.map((ano) => (
                    <button
                      key={ano}
                      onClick={() => handleAnoToggle(ano)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selectedAnos.includes(ano)
                          ? "border-semfaz-500 bg-semfaz-500 text-white"
                          : "border-gray-300 bg-white text-gray-600 hover:border-semfaz-300"
                      }`}
                    >
                      {ano}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category filter */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Categoria</p>
                <Select
                  options={[{ value: "", label: "Todas" }, ...CATEGORIES]}
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-44"
                />
              </div>

              {/* View mode */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Visualização</p>
                <div className="flex gap-1">
                  {[
                    { value: "comparison", label: "Comparativo" },
                    { value: "monthly", label: "Mensal" },
                    { value: "table", label: "Tabela" },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setViewMode(mode.value as ViewMode)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        viewMode === mode.value
                          ? "bg-semfaz-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Export */}
              <div className="ml-auto">
                <p className="mb-1.5 text-xs font-medium text-transparent">.</p>
                <Button variant="outline" size="sm" onClick={handleExportCsv}>
                  Exportar CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Comparison View */}
            {viewMode === "comparison" && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Arrecadação por Categoria Tributária</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Comparativo entre exercícios selecionados
                  </p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={comparisonData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="categoria" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tickFormatter={(v) => formatTooltipValue(v)} tick={{ fontSize: 11 }} width={80} />
                      <Tooltip formatter={(value: number) => [formatTooltipValue(value), ""]} contentStyle={{ fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {selectedAnos.map((ano, i) => (
                        <Bar key={ano} dataKey={String(ano)} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Monthly View */}
            {viewMode === "monthly" && categoria && monthlyData.length > 0 && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {monthlyData.map((md) => (
                    <Card key={md.ano}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{md.ano}</CardTitle>
                          {md.variacao !== null && (
                            <Badge variant={md.variacao > 0 ? "success" : "destructive"}>
                              {md.variacao > 0 ? "+" : ""}{md.variacao.toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Total</p>
                            <p className="font-semibold">{formatTooltipValue(md.acumulado)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Orçado</p>
                            <p className="font-semibold">{formatTooltipValue(md.orcado)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Média Mensal</p>
                            <p className="font-semibold">{formatTooltipValue(md.stats.media)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Pico</p>
                            <p className="font-semibold">
                              {MONTH_LABELS[md.stats.mesMax] || "-"} ({formatTooltipValue(md.stats.max)})
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Monthly Line Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Evolução Mensal - {TAX_CATEGORY_LABELS[categoria as TaxCategory] || categoria}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <LineChart data={monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(v) => formatTooltipValue(v)} tick={{ fontSize: 11 }} width={80} />
                        <Tooltip formatter={(value: number) => [formatTooltipValue(value), ""]} contentStyle={{ fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {monthlyData.map((md, i) => (
                          <Line
                            key={md.ano}
                            type="monotone"
                            dataKey={String(md.ano)}
                            stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2}
                            dot={{ fill: COLORS[i % COLORS.length], r: 3 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {viewMode === "monthly" && !categoria && (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">Selecione uma categoria tributária para ver a análise mensal detalhada.</p>
                </CardContent>
              </Card>
            )}

            {/* Table View */}
            {viewMode === "table" && (() => {
              const filtered = summaryData.filter((d) => {
                if (!categoria) return true;
                const cats = expandCategoriaFilter(categoria);
                return cats.includes(d.categoria_tributaria);
              });
              // Agrupa por exercício — um total por ano quando houver >1 linhas
              const byYear = new Map<number, SummaryRow[]>();
              for (const row of filtered) {
                const arr = byYear.get(row.exercicio_ano) || [];
                arr.push(row);
                byYear.set(row.exercicio_ano, arr);
              }
              const yearsSorted = [...byYear.keys()].sort((a, b) => b - a);
              return (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Dados Tabulares</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium">Exercício</th>
                            <th className="px-3 py-2 text-left font-medium">Categoria</th>
                            <th className="px-3 py-2 text-right font-medium">Orçado</th>
                            <th className="px-3 py-2 text-right font-medium">Arrecadado</th>
                            <th className="px-3 py-2 text-right font-medium">% Execução</th>
                            {MONTHS_SHORT.map((m) => (
                              <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {yearsSorted.flatMap((year) => {
                            const rows = byYear.get(year) || [];
                            const elements: React.ReactNode[] = rows.map((d, i) => {
                              const exec = d.total_orcado > 0
                                ? ((d.total_arrecadado / d.total_orcado) * 100).toFixed(1)
                                : "0";
                              return (
                                <tr key={`${year}-${i}`} className="border-b hover:bg-muted/30">
                                  <td className="px-3 py-2">{d.exercicio_ano}</td>
                                  <td className="px-3 py-2">
                                    {TAX_CATEGORY_LABELS[d.categoria_tributaria as TaxCategory] || d.categoria_tributaria}
                                  </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(d.total_orcado)}</td>
                                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatCurrency(d.total_arrecadado)}</td>
                                  <td className="px-3 py-2 text-right">{exec}%</td>
                                  {MONTHS_KEYS.map((m) => (
                                    <td key={m} className="px-2 py-2 text-right">
                                      {formatTooltipValue((d[m] as number) || 0)}
                                    </td>
                                  ))}
                                </tr>
                              );
                            });
                            if (rows.length > 1) {
                              const totalOrcado = rows.reduce((s, r) => s + (r.total_orcado || 0), 0);
                              const totalArrecadado = rows.reduce((s, r) => s + (r.total_arrecadado || 0), 0);
                              const totalExec = totalOrcado > 0
                                ? ((totalArrecadado / totalOrcado) * 100).toFixed(1)
                                : "0";
                              const totalMonths = MONTHS_KEYS.map((m) =>
                                rows.reduce((s, r) => s + ((r[m] as number) || 0), 0),
                              );
                              elements.push(
                                <tr
                                  key={`${year}-total`}
                                  className="border-y-2 border-semfaz-500 bg-semfaz-50/70 font-semibold text-semfaz-800"
                                >
                                  <td className="px-3 py-2">{year}</td>
                                  <td className="px-3 py-2">
                                    Total · {rows.length} receitas
                                  </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(totalOrcado)}</td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(totalArrecadado)}</td>
                                  <td className="px-3 py-2 text-right">{totalExec}%</td>
                                  {totalMonths.map((v, idx) => (
                                    <td key={idx} className="px-2 py-2 text-right whitespace-nowrap">
                                      {formatTooltipValue(v)}
                                    </td>
                                  ))}
                                </tr>,
                              );
                            }
                            return elements;
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
