"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { TaxBreakdown } from "@/components/dashboard/tax-breakdown";
import { BudgetExecution } from "@/components/dashboard/budget-execution";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { LoadingSpinner } from "@/components/shared/loading";

interface DashboardData {
  summary: {
    ano: number;
    totalOrcado: number;
    totalArrecadado: number;
    totalDeducoes: number;
    execucaoOrcamentaria: number;
    byCategory: { categoria_tributaria: string; total: number; orcado_total: number }[];
    monthlyTotals: number[];
  };
  trend: { ano: number; receita_corrente: number; orcado: number }[];
  comparison: {
    ano1: { ano: number; months: number[] };
    ano2: { ano: number; months: number[] };
  } | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [anos, setAnos] = useState<number[]>([]);
  const [selectedAno, setSelectedAno] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (ano?: number) => {
    setLoading(true);
    try {
      const params = ano ? `?ano=${ano}` : "";
      const res = await fetch(`/api/dashboard${params}`);
      const json = await res.json();
      setData(json.data);
      setAnos(json.anos || []);
      setSelectedAno(json.selectedAno || 0);
    } catch (err) {
      console.error("Erro ao carregar dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAnoChange = (ano: number) => {
    setSelectedAno(ano);
    fetchData(ano);
  };

  if (loading) {
    return (
      <div>
        <Header title="Dashboard" subtitle="Visão geral financeira" />
        <div className="p-6">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <Header title="Dashboard" subtitle="Visão geral financeira" />
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <p className="text-lg font-medium text-muted-foreground">
              Nenhum dado carregado
            </p>
            <p className="text-sm text-muted-foreground">
              Faça upload de arquivos CSV ou XLS na seção Upload.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Find previous year total for variation
  const previousYearData = data.trend.find((t) => t.ano === selectedAno - 1);

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Visão geral financeira do município"
        anos={anos}
        selectedAno={selectedAno}
        onAnoChange={handleAnoChange}
      />

      <div className="space-y-6 p-6">
        {/* KPI Cards */}
        <KpiCards
          totalArrecadado={data.summary.totalArrecadado}
          totalOrcado={data.summary.totalOrcado}
          execucaoOrcamentaria={data.summary.execucaoOrcamentaria}
          totalDeducoes={data.summary.totalDeducoes}
          previousYearTotal={previousYearData?.receita_corrente}
        />

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RevenueChart comparison={data.comparison} />
          <TaxBreakdown data={data.summary.byCategory} />
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <BudgetExecution data={data.summary.byCategory} />
          <TrendChart data={data.trend} />
        </div>
      </div>
    </div>
  );
}
