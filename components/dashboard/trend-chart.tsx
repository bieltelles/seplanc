"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/utils/format";

interface TrendChartProps {
  data: { ano: number; receita_corrente: number; orcado: number }[];
}

export function TrendChart({ data }: TrendChartProps) {
  const chartData = data
    .filter((d) => d.receita_corrente > 0)
    .map((d) => ({
      ano: String(d.ano),
      "Receita Arrecadada": d.receita_corrente,
      "Receita Orçada": d.orcado,
    }));

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Evolução da Receita ao Longo dos Anos
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Receita corrente arrecadada vs orçada (todos os exercícios)
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={(v) => formatCompact(v)}
              tick={{ fontSize: 11 }}
              width={70}
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
            <Line
              type="monotone"
              dataKey="Receita Arrecadada"
              stroke="#1e40af"
              strokeWidth={2}
              dot={{ fill: "#1e40af", r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="Receita Orçada"
              stroke="#93c5fd"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: "#93c5fd", r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
