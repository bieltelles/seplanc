"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Loader2,
} from "lucide-react";

interface SaudeData {
  disponivel: boolean;
  ano: number;
  bimestre?: number;
  municipio?: string;
  dataHomologacao?: string;
  ultimaAtualizacao?: string;
  message?: string;
  indicador?: {
    percentualAplicado: number;
    minimoConstitucional: number;
    status: "cumprido" | "descumprido";
    excedente: number;
  };
  receitas?: {
    impostos: number;
    transferencias: number;
    total: number;
  };
  despesas?: {
    empenhada: number;
    liquidada: number;
    paga: number;
  };
  valorAplicado?: {
    empenhada: number;
    liquidada: number;
    paga: number;
  };
  despesaMinima?: number;
  percentuais?: {
    empenhada: number;
    liquidada: number;
    paga: number;
  };
  transfSus?: {
    uniao: number;
    estados: number;
    totalAdicionais: number;
  };
  historico?: {
    ano: number;
    bimestre: number;
    percentual: number;
    dataHomologacao: string;
  }[];
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatPercent(value: number): string {
  // Trunca em 2 casas (sem arredondar) para bater com o SIOPS.
  // Ex.: 22,699% → "22,69%" (toLocaleString arredondaria para "22,70%").
  const t = Math.trunc(value * 100) / 100;
  return t.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";
}

export default function IndicadoresPage() {
  const [data, setData] = useState<SaudeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAno, setSelectedAno] = useState(new Date().getFullYear());
  const [selectedBim, setSelectedBim] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ano: String(selectedAno) });
      if (selectedBim) params.set("bimestre", String(selectedBim));
      const res = await fetch(`/api/indicadores/saude?${params}`);
      const json = await res.json();
      setData(json);
      // Se encontrou dados, atualiza o bimestre selecionado
      if (json.disponivel && json.bimestre && !selectedBim) {
        setSelectedBim(json.bimestre);
      }
    } catch {
      setData({ disponivel: false, ano: selectedAno, message: "Erro ao carregar dados." });
    } finally {
      setLoading(false);
    }
  }, [selectedAno, selectedBim]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentYear = new Date().getFullYear();
  const anos = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <div>
      <Header
        title="Indicadores"
        subtitle="Indicadores fiscais e constitucionais"
        showCorrectionToggle={false}
        showDeducoesToggle={false}
      />

      <div className="space-y-6 p-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Exercicio</label>
            <select
              value={selectedAno}
              onChange={(e) => { setSelectedAno(parseInt(e.target.value, 10)); setSelectedBim(null); }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              {anos.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {data?.disponivel && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Bimestre</label>
              <select
                value={selectedBim || ""}
                onChange={(e) => setSelectedBim(parseInt(e.target.value, 10))}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                {[1, 2, 3, 4, 5, 6].map((b) => (
                  <option key={b} value={b}>{b}o</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-semfaz-500" />
          </div>
        ) : !data?.disponivel ? (
          <EmptyState message={data?.message} />
        ) : (
          <>
            {/* Card Principal — Saúde */}
            <SaudeMainCard data={data} />

            {/* Cards de Detalhamento */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ReceitasCard data={data} />
              <DespesasCard data={data} />
              <TransfSusCard data={data} />
            </div>

            {/* Histórico */}
            {data.historico && data.historico.length > 0 && (
              <HistoricoCard historico={data.historico} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-12">
        <Activity className="mb-4 h-12 w-12 text-slate-300" />
        <p className="mb-2 text-base font-medium text-slate-600">Sem dados disponíveis</p>
        <p className="max-w-md text-center text-sm text-slate-500">
          {message || "Importe o Balancete de Receita e o Balancete de Despesa Geral na página de Upload para calcular os indicadores de Saúde."}
        </p>
      </CardContent>
    </Card>
  );
}

function SaudeMainCard({ data }: { data: SaudeData }) {
  const ind = data.indicador!;
  const isCumprido = ind.status === "cumprido";

  // Calcular ângulo do arco do gauge (0-180 graus, mapeando 0-30%)
  const maxPercent = 30;
  const clampedPercent = Math.min(ind.percentualAplicado, maxPercent);
  const angle = (clampedPercent / maxPercent) * 180;
  const minimoAngle = (ind.minimoConstitucional / maxPercent) * 180;

  return (
    <Card className={`border-2 ${isCumprido ? "border-green-200" : "border-red-200"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Heart className={`h-5 w-5 ${isCumprido ? "text-green-600" : "text-red-500"}`} />
          Saúde — Aplicação em ASPS (LC 141/2012)
          <Badge variant={isCumprido ? "default" : "destructive"} className={`ml-auto ${isCumprido ? "bg-green-600" : ""}`}>
            {isCumprido ? "Mínimo Cumprido" : "Abaixo do Mínimo"}
          </Badge>
        </CardTitle>
        <p className="text-xs text-slate-500">
          {data.municipio} — {data.ano}, {data.bimestre}o Bimestre
          {data.dataHomologacao && ` — Homologado em ${data.dataHomologacao}`}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
          {/* Gauge */}
          <div className="flex flex-col items-center">
            <GaugeSvg
              value={ind.percentualAplicado}
              min={ind.minimoConstitucional}
              max={maxPercent}
              angle={angle}
              minimoAngle={minimoAngle}
              isCumprido={isCumprido}
            />
            <p className="mt-2 text-xs text-slate-500">
              Mínimo constitucional: {formatPercent(ind.minimoConstitucional)}
            </p>
          </div>

          {/* Detalhamento */}
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricBox
                label="Empenhada"
                value={formatPercent(data.percentuais?.empenhada || 0)}
                sublabel={formatCurrency(data.valorAplicado?.empenhada || 0)}
                color="blue"
              />
              <MetricBox
                label="Liquidada"
                value={formatPercent(data.percentuais?.liquidada || 0)}
                sublabel={formatCurrency(data.valorAplicado?.liquidada || 0)}
                color={isCumprido ? "green" : "red"}
                highlight
              />
              <MetricBox
                label="Paga"
                value={formatPercent(data.percentuais?.paga || 0)}
                sublabel={formatCurrency(data.valorAplicado?.paga || 0)}
                color="slate"
              />
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Receita Base (Impostos + Transf.)</span>
                <span className="font-semibold">{formatCurrency(data.receitas?.total || 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-slate-600">Despesa Mínima (15%)</span>
                <span className="font-semibold">{formatCurrency(data.despesaMinima || 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {isCumprido ? "Excedente" : "Déficit"}
                </span>
                <span className={`font-semibold ${isCumprido ? "text-green-600" : "text-red-600"}`}>
                  {isCumprido ? (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      +{formatPercent(ind.excedente)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <TrendingDown className="h-3.5 w-3.5" />
                      -{formatPercent(ind.minimoConstitucional - ind.percentualAplicado)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GaugeSvg({
  value,
  max,
  angle,
  minimoAngle,
  isCumprido,
}: {
  value: number;
  min: number;
  max: number;
  angle: number;
  minimoAngle: number;
  isCumprido: boolean;
}) {
  const cx = 100, cy = 100, r = 80;
  const startAngle = 180;

  const polarToCartesian = (a: number) => ({
    x: cx + r * Math.cos((a * Math.PI) / 180),
    y: cy - r * Math.sin((a * Math.PI) / 180),
  });

  // Background arc (full semicircle)
  const bgStart = polarToCartesian(startAngle);
  const bgEnd = polarToCartesian(0);

  // Value arc
  const valEnd = polarToCartesian(startAngle - angle);
  const largeArc = angle > 180 ? 1 : 0;

  // Mínimo line position
  const minPoint = polarToCartesian(startAngle - minimoAngle);

  return (
    <svg viewBox="0 0 200 120" className="h-32 w-48">
      {/* Background arc */}
      <path
        d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 1 1 ${bgEnd.x} ${bgEnd.y}`}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="16"
        strokeLinecap="round"
      />
      {/* Value arc */}
      <path
        d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${largeArc} 1 ${valEnd.x} ${valEnd.y}`}
        fill="none"
        stroke={isCumprido ? "#16a34a" : "#dc2626"}
        strokeWidth="16"
        strokeLinecap="round"
      />
      {/* Mínimo marker */}
      <line
        x1={minPoint.x}
        y1={minPoint.y}
        x2={cx + (r - 20) * Math.cos(((startAngle - minimoAngle) * Math.PI) / 180)}
        y2={cy - (r - 20) * Math.sin(((startAngle - minimoAngle) * Math.PI) / 180)}
        stroke="#f59e0b"
        strokeWidth="2.5"
      />
      <circle cx={minPoint.x} cy={minPoint.y} r="4" fill="#f59e0b" />
      {/* Value text */}
      <text x={cx} y={cy - 10} textAnchor="middle" className="text-2xl font-bold" fill={isCumprido ? "#16a34a" : "#dc2626"}>
        {formatPercent(value)}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="text-xs" fill="#64748b">
        aplicado em ASPS
      </text>
    </svg>
  );
}

function MetricBox({
  label,
  value,
  sublabel,
  color,
  highlight,
}: {
  label: string;
  value: string;
  sublabel: string;
  color: string;
  highlight?: boolean;
}) {
  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    green: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
    red: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    slate: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" },
  };
  const c = colorClasses[color] || colorClasses.slate;

  return (
    <div className={`rounded-lg border p-3 ${c.bg} ${c.border} ${highlight ? "ring-2 ring-offset-1 ring-" + color + "-300" : ""}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${c.text}`}>{value}</p>
      <p className="text-xs text-slate-500">{sublabel}</p>
    </div>
  );
}

function ReceitasCard({ data }: { data: SaudeData }) {
  const rec = data.receitas!;
  const total = rec.total || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-blue-500" />
          Receita Base (Impostos + Transferencias)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold text-slate-800">{formatCurrency(total)}</div>
        <div className="space-y-2">
          <BarItem label="Impostos (I)" value={rec.impostos} total={total} color="bg-blue-500" />
          <BarItem label="Transferencias (II)" value={rec.transferencias} total={total} color="bg-indigo-500" />
        </div>
      </CardContent>
    </Card>
  );
}

function DespesasCard({ data }: { data: SaudeData }) {
  const desp = data.despesas!;
  const va = data.valorAplicado!;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-green-500" />
          Despesas ASPS (Recursos Proprios)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Total Despesas ASPS</span>
            <span className="font-medium">{formatCurrency(desp.liquidada)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">(-) Deducoes</span>
            <span className="font-medium text-red-600">{formatCurrency(desp.liquidada - va.liquidada)}</span>
          </div>
          <div className="border-t pt-2">
            <div className="flex justify-between font-semibold">
              <span>Valor Aplicado</span>
              <span className="text-green-700">{formatCurrency(va.liquidada)}</span>
            </div>
          </div>
        </div>
        <div className="rounded bg-slate-50 p-2 text-xs text-slate-500">
          <div className="flex justify-between">
            <span>Empenhada:</span><span>{formatCurrency(va.empenhada)}</span>
          </div>
          <div className="flex justify-between">
            <span>Paga:</span><span>{formatCurrency(va.paga)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TransfSusCard({ data }: { data: SaudeData }) {
  const sus = data.transfSus!;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Heart className="h-4 w-4 text-red-500" />
          Transferencias SUS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold text-slate-800">{formatCurrency(sus.totalAdicionais)}</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Uniao</span>
            <span className="font-medium">{formatCurrency(sus.uniao)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Estados</span>
            <span className="font-medium">{formatCurrency(sus.estados)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoricoCard({ historico }: { historico: SaudeData["historico"] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Historico de Bimestres</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Exercicio</th>
                <th className="pb-2 pr-4">Bimestre</th>
                <th className="pb-2 pr-4">% Aplicado</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Homologacao</th>
              </tr>
            </thead>
            <tbody>
              {historico!.map((h, i) => {
                const cumprido = h.percentual >= 15;
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{h.ano}</td>
                    <td className="py-2 pr-4">{h.bimestre}o</td>
                    <td className={`py-2 pr-4 font-semibold ${cumprido ? "text-green-600" : "text-red-600"}`}>
                      {formatPercent(h.percentual)}
                    </td>
                    <td className="py-2 pr-4">
                      {cumprido ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" /> Cumprido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> Abaixo
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-slate-500">{h.dataHomologacao || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BarItem({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium">{formatCurrency(value)}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
