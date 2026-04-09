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
import { TAX_CATEGORY_LABELS, type TaxCategory } from "@/lib/constants/tax-categories";
import { formatCompact } from "@/lib/utils/format";

interface BudgetExecutionProps {
  data: { categoria_tributaria: string; total: number; orcado_total: number }[];
}

export function BudgetExecution({ data }: BudgetExecutionProps) {
  const chartData = data
    .filter((d) => d.orcado_total > 0 && d.categoria_tributaria !== "DEDUCOES")
    .map((d) => ({
      categoria: TAX_CATEGORY_LABELS[d.categoria_tributaria as TaxCategory] || d.categoria_tributaria,
      Orçado: d.orcado_total,
      Arrecadado: d.total,
      execucao: d.orcado_total > 0 ? ((d.total / d.orcado_total) * 100).toFixed(1) : "0",
    }))
    .sort((a, b) => b.Orçado - a.Orçado)
    .slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Orçado vs Arrecadado
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Execução orçamentária por categoria
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCompact(v)}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="categoria"
              width={100}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              formatter={(value: number) => [
                new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  notation: "compact",
                }).format(value),
                "",
              ]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Orçado" fill="#93c5fd" radius={[0, 4, 4, 0]} />
            <Bar dataKey="Arrecadado" fill="#1e40af" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
