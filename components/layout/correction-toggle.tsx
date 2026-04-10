"use client";

import { useCorrection } from "@/components/providers/correction-provider";
import { Coins, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function CorrectionToggle() {
  const { ativa, toggle, targetYear } = useCorrection();

  return (
    <button
      onClick={toggle}
      className={cn(
        "group flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
        ativa
          ? "border-semfaz-500 bg-semfaz-50 text-semfaz-700 shadow-sm hover:bg-semfaz-100"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
      )}
      title={
        ativa
          ? `Valores corrigidos pelo IPCA para 31/12/${targetYear}. Clique para ver valores correntes.`
          : "Valores correntes (sem correção). Clique para aplicar correção monetária IPCA."
      }
    >
      <div
        className={cn(
          "relative h-4 w-8 rounded-full transition-colors",
          ativa ? "bg-semfaz-600" : "bg-slate-300",
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform",
            ativa ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </div>
      {ativa ? (
        <>
          <Coins className="h-3.5 w-3.5" />
          <span>Valores constantes (IPCA · {targetYear})</span>
        </>
      ) : (
        <>
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Valores correntes</span>
        </>
      )}
    </button>
  );
}
