"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

interface CorrectionContextValue {
  ativa: boolean;
  setAtiva: (v: boolean) => void;
  toggle: () => void;
  targetYear: number;
}

const Ctx = createContext<CorrectionContextValue | null>(null);

const STORAGE_KEY = "semfaz-correcao-ativa";

export function CorrectionProvider({ children }: { children: ReactNode }) {
  const [ativa, setAtivaState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Carrega preferência do usuário + default do servidor
  useEffect(() => {
    (async () => {
      try {
        const local = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        if (local !== null) {
          setAtivaState(local === "true");
        } else {
          // Busca padrão do servidor
          const res = await fetch("/api/config");
          const json = await res.json();
          const padrao = json?.configuracoes?.find?.(
            (c: { chave: string; valor: string }) => c.chave === "correcao_padrao_ativa",
          );
          setAtivaState(padrao?.valor === "true");
        }
      } catch {
        // Ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const setAtiva = useCallback((v: boolean) => {
    setAtivaState(v);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(v));
    }
  }, []);

  const toggle = useCallback(() => setAtiva(!ativa), [ativa, setAtiva]);

  const currentYear = new Date().getFullYear();
  const targetYear = currentYear - 1;

  return (
    <Ctx.Provider value={{ ativa: hydrated && ativa, setAtiva, toggle, targetYear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCorrection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCorrection precisa estar dentro de CorrectionProvider");
  return ctx;
}
