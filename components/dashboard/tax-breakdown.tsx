"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TAX_CATEGORY_LABELS, TAX_CATEGORY_COLORS, type TaxCategory } from "@/lib/constants/tax-categories";
import { formatCompact } from "@/lib/utils/format";

interface TaxBreakdownProps {
  data: { categoria_tributaria: string; total: number; orcado_total: number }[];
}

export function TaxBreakdown({ data }: TaxBreakdownProps) {
  const chartData = data
    .filter((d) => d.total > 0 && d.categoria_tributaria !== "DEDUCOES")
    .map((d) => ({
      name: TAX_CATEGORY_LABELS[d.categoria_tributaria as TaxCategory] || d.categoria_tributaria,
      value: d.total,
      color: TAX_CATEGORY_COLORS[d.categoria_tributaria as TaxCategory] || "#94a3b8",
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  const formatTooltip = (value: number) => {
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
    return [
      `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(value)} (${pct}%)`,
      "",
    ];
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Composição por Espécie Tributária
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Participação no total arrecadado
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatTooltip(value)} />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => <span className="text-xs">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
