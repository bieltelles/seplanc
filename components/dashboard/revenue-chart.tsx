"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact, MONTH_LABELS } from "@/lib/utils/format";

const MONTHS_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface RevenueChartProps {
  comparison: {
    ano1: { ano: number; months: number[] };
    ano2: { ano: number; months: number[] };
  } | null;
}

export function RevenueChart({ comparison }: RevenueChartProps) {
  if (!comparison) return null;

  const data = MONTHS_SHORT.map((month, i) => ({
    month,
    [comparison.ano1.ano]: comparison.ano1.months[i] || 0,
    [comparison.ano2.ano]: comparison.ano2.months[i] || 0,
  }));

  const formatTooltip = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
    }).format(value);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Arrecadação Mensal Comparativa
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {comparison.ano1.ano} vs {comparison.ano2.ano}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tickFormatter={(v) => formatCompact(v)}
              tick={{ fontSize: 11 }}
              width={70}
            />
            <Tooltip
              formatter={(value: number) => [formatTooltip(value), ""]}
              labelFormatter={(label) => `Mês: ${label}`}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey={comparison.ano1.ano}
              fill="#1e40af"
              radius={[4, 4, 0, 0]}
              name={String(comparison.ano1.ano)}
            />
            <Bar
              dataKey={comparison.ano2.ano}
              fill="#93c5fd"
              radius={[4, 4, 0, 0]}
              name={String(comparison.ano2.ano)}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
