"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3, ArrowUpRight } from "lucide-react";
import { formatCurrency, formatPercent, formatCompact } from "@/lib/utils/format";

interface KpiCardsProps {
  totalArrecadado: number;
  totalOrcado: number;
  execucaoOrcamentaria: number;
  totalDeducoes: number;
  previousYearTotal?: number;
}

export function KpiCards({
  totalArrecadado,
  totalOrcado,
  execucaoOrcamentaria,
  totalDeducoes,
  previousYearTotal,
}: KpiCardsProps) {
  const variation = previousYearTotal && previousYearTotal > 0
    ? ((totalArrecadado - previousYearTotal) / previousYearTotal) * 100
    : null;

  const cards = [
    {
      title: "Receita Arrecadada",
      value: formatCompact(totalArrecadado),
      fullValue: formatCurrency(totalArrecadado),
      icon: DollarSign,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Receita Orçada",
      value: formatCompact(totalOrcado),
      fullValue: formatCurrency(totalOrcado),
      icon: Target,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
    },
    {
      title: "Execução Orçamentária",
      value: formatPercent(execucaoOrcamentaria),
      fullValue: `${(execucaoOrcamentaria * 100).toFixed(1)}%`,
      icon: BarChart3,
      color: execucaoOrcamentaria >= 0.9 ? "text-green-600" : execucaoOrcamentaria >= 0.7 ? "text-yellow-600" : "text-red-600",
      bgColor: execucaoOrcamentaria >= 0.9 ? "bg-green-50" : execucaoOrcamentaria >= 0.7 ? "bg-yellow-50" : "bg-red-50",
    },
    {
      title: "Variação Anual",
      value: variation !== null ? `${variation > 0 ? "+" : ""}${variation.toFixed(1)}%` : "N/A",
      fullValue: variation !== null ? `vs ano anterior` : "Sem dados anteriores",
      icon: variation && variation > 0 ? TrendingUp : TrendingDown,
      color: variation && variation > 0 ? "text-green-600" : variation && variation < 0 ? "text-red-600" : "text-gray-600",
      bgColor: variation && variation > 0 ? "bg-green-50" : variation && variation < 0 ? "bg-red-50" : "bg-gray-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.fullValue}</p>
              </div>
              <div className={`rounded-lg p-2 ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
