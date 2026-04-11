"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DeducaoSubtipo } from "@/lib/constants/tax-categories";

export type DeducoesSubtipoMap = Record<DeducaoSubtipo, boolean>;

interface DeducoesContextValue {
  /** Se `true`, as receitas exibidas devem ser líquidas dos subtipos marcados. */
  ativa: boolean;
  setAtiva: (v: boolean) => void;
  toggle: () => void;
  /** Quais subtipos de dedução são subtraídos quando `ativa = true`. */
  subtipos: DeducoesSubtipoMap;
  setSubtipo: (key: DeducaoSubtipo, v: boolean) => void;
  setSubtipos: (m: DeducoesSubtipoMap) => void;
  /** Indica se o estado já foi hidratado de localStorage/servidor. */
  hydrated: boolean;
  /**
   * Retorna os query-params a serem anexados a `/api/dashboard`,
   * `/api/receitas`, etc. — vazio `""` quando a toggle está off.
   */
  toQueryString: () => string;
}

const Ctx = createContext<DeducoesContextValue | null>(null);

const STORAGE_KEY_ATIVA = "semfaz-deducoes-liquido-ativa";
const STORAGE_KEY_SUBTIPOS = "semfaz-deducoes-subtipos";

const DEFAULT_SUBTIPOS: DeducoesSubtipoMap = {
  FUNDEB: true,
  ABATIMENTO: true,
  INTRA: false,
  OUTRAS: false,
};

/**
 * Chaves de configuração no banco — espelham as da `correcao_*`.
 * Persistidas pela página /configuracoes e lidas no boot do provider.
 */
const SERVER_KEY_PADRAO_ATIVA = "deducoes_liquido_padrao_ativa";
const SERVER_KEY_FUNDEB = "deducoes_incluir_fundeb";
const SERVER_KEY_ABAT = "deducoes_incluir_abatimentos";
const SERVER_KEY_INTRA = "deducoes_incluir_intra";
const SERVER_KEY_OUTRAS = "deducoes_incluir_outras";

function readLocalAtiva(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY_ATIVA);
  if (v === null) return null;
  return v === "true";
}

function readLocalSubtipos(): DeducoesSubtipoMap | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY_SUBTIPOS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DeducoesSubtipoMap>;
    return {
      FUNDEB: parsed.FUNDEB ?? DEFAULT_SUBTIPOS.FUNDEB,
      ABATIMENTO: parsed.ABATIMENTO ?? DEFAULT_SUBTIPOS.ABATIMENTO,
      INTRA: parsed.INTRA ?? DEFAULT_SUBTIPOS.INTRA,
      OUTRAS: parsed.OUTRAS ?? DEFAULT_SUBTIPOS.OUTRAS,
    };
  } catch {
    return null;
  }
}

export function DeducoesProvider({ children }: { children: ReactNode }) {
  const [ativa, setAtivaState] = useState(false);
  const [subtipos, setSubtiposState] = useState<DeducoesSubtipoMap>(DEFAULT_SUBTIPOS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // 1) Servidor — defaults configurados em /configuracoes
        let serverAtiva: boolean | null = null;
        const serverSubtipos: Partial<DeducoesSubtipoMap> = {};
        try {
          const res = await fetch("/api/config");
          const json = await res.json();
          const configs = (json?.configuracoes || []) as {
            chave: string;
            valor: string;
          }[];
          const find = (k: string) => configs.find((c) => c.chave === k)?.valor;

          const padrao = find(SERVER_KEY_PADRAO_ATIVA);
          if (padrao !== undefined) serverAtiva = padrao === "true";

          const fu = find(SERVER_KEY_FUNDEB);
          if (fu !== undefined) serverSubtipos.FUNDEB = fu === "true";
          const ab = find(SERVER_KEY_ABAT);
          if (ab !== undefined) serverSubtipos.ABATIMENTO = ab === "true";
          const it = find(SERVER_KEY_INTRA);
          if (it !== undefined) serverSubtipos.INTRA = it === "true";
          const ou = find(SERVER_KEY_OUTRAS);
          if (ou !== undefined) serverSubtipos.OUTRAS = ou === "true";
        } catch {
          // silencia: usa localStorage + default local
        }

        // 2) LocalStorage tem prioridade sobre o default do servidor
        const localAtiva = readLocalAtiva();
        if (localAtiva !== null) {
          setAtivaState(localAtiva);
        } else if (serverAtiva !== null) {
          setAtivaState(serverAtiva);
        }

        const localSubs = readLocalSubtipos();
        if (localSubs) {
          setSubtiposState(localSubs);
        } else {
          setSubtiposState({
            FUNDEB: serverSubtipos.FUNDEB ?? DEFAULT_SUBTIPOS.FUNDEB,
            ABATIMENTO: serverSubtipos.ABATIMENTO ?? DEFAULT_SUBTIPOS.ABATIMENTO,
            INTRA: serverSubtipos.INTRA ?? DEFAULT_SUBTIPOS.INTRA,
            OUTRAS: serverSubtipos.OUTRAS ?? DEFAULT_SUBTIPOS.OUTRAS,
          });
        }
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const setAtiva = useCallback((v: boolean) => {
    setAtivaState(v);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ATIVA, String(v));
    }
  }, []);

  const toggle = useCallback(() => setAtiva(!ativa), [ativa, setAtiva]);

  const setSubtipo = useCallback(
    (key: DeducaoSubtipo, v: boolean) => {
      setSubtiposState((prev) => {
        const next = { ...prev, [key]: v };
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY_SUBTIPOS, JSON.stringify(next));
        }
        return next;
      });
    },
    [],
  );

  const setSubtipos = useCallback((m: DeducoesSubtipoMap) => {
    setSubtiposState(m);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_SUBTIPOS, JSON.stringify(m));
    }
  }, []);

  const toQueryString = useCallback(() => {
    if (!hydrated || !ativa) return "";
    const parts = [
      "liquido=1",
      `dedFundeb=${subtipos.FUNDEB ? 1 : 0}`,
      `dedAbat=${subtipos.ABATIMENTO ? 1 : 0}`,
      `dedIntra=${subtipos.INTRA ? 1 : 0}`,
      `dedOutras=${subtipos.OUTRAS ? 1 : 0}`,
    ];
    return parts.join("&");
  }, [ativa, subtipos, hydrated]);

  const value = useMemo<DeducoesContextValue>(
    () => ({
      ativa: hydrated && ativa,
      setAtiva,
      toggle,
      subtipos,
      setSubtipo,
      setSubtipos,
      hydrated,
      toQueryString,
    }),
    [ativa, hydrated, subtipos, setAtiva, toggle, setSubtipo, setSubtipos, toQueryString],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeducoes() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDeducoes precisa estar dentro de DeducoesProvider");
  return ctx;
}
