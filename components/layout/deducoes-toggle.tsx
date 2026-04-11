"use client";

import { useEffect, useRef, useState } from "react";
import { useDeducoes } from "@/components/providers/deducoes-provider";
import { Scissors, Minus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeducaoSubtipo } from "@/lib/constants/tax-categories";

interface SubtipoOption {
  key: DeducaoSubtipo;
  label: string;
  hint: string;
}

const OPTIONS: SubtipoOption[] = [
  {
    key: "FUNDEB",
    label: "FUNDEB",
    hint: "Retenção constitucional sobre transferências (FPM, ITR, LC 87, ICMS, IPVA, IPI-Exp)",
  },
  {
    key: "ABATIMENTO",
    label: "Abatimentos, restituições e devoluções",
    hint: "Deduções de impostos, taxas, contribuições, dívida ativa, receita patrimonial",
  },
  {
    key: "INTRA",
    label: "Intraorçamentárias",
    hint: "Eliminação da dupla contagem em consolidações (código 97...)",
  },
  {
    key: "OUTRAS",
    label: "Outras deduções",
    hint: "Demais deduções não enquadradas (SUS, convênios específicos, etc.)",
  },
];

export function DeducoesToggle() {
  const { ativa, toggle, subtipos, setSubtipo } = useDeducoes();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const marcados = Object.values(subtipos).filter(Boolean).length;
  const totalMarcados = marcados === 0 && ativa ? "0 selecionadas" : `${marcados}/4`;

  const tituloAtiva = `Exibindo valores LÍQUIDOS das deduções selecionadas. Clique para voltar ao modo bruto.`;
  const tituloInativa = `Exibindo valores BRUTOS (deduções separadas). Clique para aplicar deduções.`;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        className={cn(
          "group flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
          ativa
            ? "border-rose-400 bg-rose-50 text-rose-700 shadow-sm hover:bg-rose-100"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
        )}
        title={ativa ? tituloAtiva : tituloInativa}
      >
        <div
          className={cn(
            "relative h-4 w-8 rounded-full transition-colors",
            ativa ? "bg-rose-500" : "bg-slate-300",
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
            <Scissors className="h-3.5 w-3.5" />
            <span>Líquido · {totalMarcados}</span>
          </>
        ) : (
          <>
            <Minus className="h-3.5 w-3.5" />
            <span>Valores brutos</span>
          </>
        )}
      </button>

      {ativa && (
        <div className="relative">
          <button
            ref={triggerRef}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
            title="Configurar quais deduções são subtraídas"
          >
            <span>O que deduzir</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>

          {open && (
            <div
              ref={panelRef}
              className="absolute right-0 top-[calc(100%+4px)] z-50 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
            >
              <p className="mb-2 text-xs font-semibold text-slate-700">
                Subtrair as deduções marcadas:
              </p>
              <div className="space-y-1.5">
                {OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-start gap-2 rounded p-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={subtipos[opt.key]}
                      onChange={(e) => setSubtipo(opt.key, e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-rose-500"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-slate-800">
                        {opt.label}
                      </div>
                      <div className="text-[10px] leading-snug text-slate-500">
                        {opt.hint}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                Os padrões podem ser alterados em{" "}
                <span className="font-semibold">Configurações → Deduções</span>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
