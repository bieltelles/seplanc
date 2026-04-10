"use client";

import { useEffect, useState } from "react";
import { useCorrection } from "@/components/providers/correction-provider";
import { Coins, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function CorrectionToggle() {
  const { ativa, toggle, anoBase, setAnoBase, targetYear } = useCorrection();
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[]>([]);

  // Busca os anos disponíveis no banco para popular o seletor de pivô
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/exercicios");
        const json = await res.json();
        const anos: number[] = (json.anos || [])
          .filter((n: number) => !Number.isNaN(n))
          .sort((a: number, b: number) => b - a);
        if (anos.length > 0) {
          setAnosDisponiveis(anos);
          // Se o anoBase atual não estiver entre os disponíveis, ajusta para o maior
          if (!anos.includes(anoBase)) {
            setAnoBase(anos[0]);
          }
        }
      } catch {
        // Ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tituloAtiva = `A partir de ${anoBase}: valores correntes · Antes de ${anoBase}: corrigidos para 31/12/${targetYear} pelo IPCA. Clique para desativar.`;
  const tituloInativa = "Valores correntes (sem correção). Clique para aplicar correção monetária IPCA.";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        className={cn(
          "group flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
          ativa
            ? "border-semfaz-500 bg-semfaz-50 text-semfaz-700 shadow-sm hover:bg-semfaz-100"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
        )}
        title={ativa ? tituloAtiva : tituloInativa}
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
            <span>
              Corrigido · a partir de {anoBase} corrente
            </span>
          </>
        ) : (
          <>
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Valores correntes</span>
          </>
        )}
      </button>

      {ativa && anosDisponiveis.length > 0 && (
        <div
          className="flex items-center gap-1.5 rounded-lg border border-semfaz-200 bg-white px-2 py-1.5 text-xs"
          title={`A partir de ${anoBase}: valores correntes. Anos anteriores corrigidos para 31/12/${targetYear}.`}
        >
          <span className="text-slate-500">Pivô:</span>
          <select
            value={String(anoBase)}
            onChange={(e) => setAnoBase(parseInt(e.target.value, 10))}
            className="cursor-pointer rounded border-0 bg-transparent pr-5 text-xs font-semibold text-semfaz-700 focus:outline-none focus:ring-1 focus:ring-semfaz-400"
          >
            {anosDisponiveis.map((ano) => (
              <option key={ano} value={ano}>
                {ano}
              </option>
            ))}
          </select>
          <span className="text-slate-400">→ 31/12/{targetYear}</span>
        </div>
      )}
    </div>
  );
}
