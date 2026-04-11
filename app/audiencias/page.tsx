"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Presentation,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

interface StatusChecks {
  receitasAno: boolean;
  rreoAno: boolean;
  rreoAnoAnterior: boolean;
  rgfPrefeitura: boolean;
  historico5Anos: number[];
}

interface StatusResponse {
  anos: number[];
  ano?: number;
  quadrimestre?: number;
  bimestreAlvo?: number;
  checks?: StatusChecks;
}

type MessageType = "success" | "error" | "info" | null;

interface Message {
  type: Exclude<MessageType, null>;
  text: string;
}

const QUADRIMESTRES = [
  { value: 1, label: "1º Quadrimestre — jan a abr (parcial · liquidadas)" },
  { value: 2, label: "2º Quadrimestre — jan a ago (parcial · liquidadas)" },
  { value: 3, label: "3º Quadrimestre — jan a dez (total · empenhadas)" },
] as const;

/**
 * Converte a data do input `type=date` (ISO yyyy-mm-dd) para o formato
 * pt-BR dd/mm/yyyy que o gerador do PPTX espera.
 */
function isoToBr(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function AudienciasPage() {
  const currentYear = new Date().getFullYear();

  // Catálogo de anos disponíveis no banco (para o select)
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[]>([]);
  const [loadingAnos, setLoadingAnos] = useState(true);

  // Campos do formulário
  const [ano, setAno] = useState<number>(currentYear);
  const [quadrimestre, setQuadrimestre] = useState<1 | 2 | 3>(1);
  const [dataApresentacao, setDataApresentacao] = useState<string>("");
  const [apresentador, setApresentador] = useState<string>("");
  const [cargoApresentador, setCargoApresentador] = useState<string>(
    "Secretário Municipal da Fazenda",
  );
  const [oficioSemfaz, setOficioSemfaz] = useState<string>("");
  const [oficioCamara, setOficioCamara] = useState<string>("");
  const [anoBaseCorrecao, setAnoBaseCorrecao] = useState<number>(currentYear);

  // Status/pré-validação dos dados no banco
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Feedback + loading do botão principal
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Catálogo inicial
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/audiencias/status");
        const json = (await res.json()) as StatusResponse;
        if (!mounted) return;
        const anos = (json.anos || [])
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => b - a);
        setAnosDisponiveis(anos);
        if (anos.length > 0) {
          const latest = anos[0];
          setAno(latest);
          setAnoBaseCorrecao(latest);
        }
      } catch (err) {
        console.error("[audiencias] falha ao carregar anos", err);
      } finally {
        if (mounted) setLoadingAnos(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Atualiza o status quando ano/quadrimestre mudam
  useEffect(() => {
    if (!ano) return;
    let cancelled = false;
    setStatusLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/audiencias/status?ano=${ano}&quadrimestre=${quadrimestre}`,
        );
        const json = (await res.json()) as StatusResponse;
        if (!cancelled) setStatus(json);
      } catch (err) {
        console.error("[audiencias] falha ao checar status", err);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ano, quadrimestre]);

  const bimestreAlvo = useMemo(
    () => (quadrimestre === 1 ? 2 : quadrimestre === 2 ? 4 : 6),
    [quadrimestre],
  );

  const checks = status?.checks ?? null;

  // Gap informativo — não bloqueia, apenas avisa
  const avisosFaltando = useMemo(() => {
    if (!checks) return [] as string[];
    const out: string[] = [];
    if (!checks.receitasAno) {
      out.push(`Receitas do exercício ${ano} não foram importadas.`);
    }
    if (!checks.rreoAno) {
      out.push(
        `RREO ${bimestreAlvo}º bimestre de ${ano} não está no banco (Balanço, RCL e Resultados ficarão em branco).`,
      );
    }
    if (!checks.rreoAnoAnterior) {
      out.push(
        `RREO ${bimestreAlvo}º bimestre de ${ano - 1} não está no banco (Balanço comparativo com o ano anterior ficará em branco).`,
      );
    }
    if (!checks.rgfPrefeitura) {
      out.push(
        `RGF ${quadrimestre}º quadrimestre / Prefeitura de ${ano} não está no banco (Pessoal, Dívida e Operações de Crédito ficarão em branco).`,
      );
    }
    if (checks.historico5Anos.length < 5) {
      const faltando = [ano - 4, ano - 3, ano - 2, ano - 1, ano].filter(
        (a) => !checks.historico5Anos.includes(a),
      );
      out.push(
        `Histórico de 5 anos incompleto — faltam: ${faltando.join(", ")}.`,
      );
    }
    return out;
  }, [checks, ano, quadrimestre, bimestreAlvo]);

  // Submissão → chama /api/audiencias/generate e dispara download
  async function handleGenerate() {
    setMessage(null);

    // Validação cliente
    if (!Number.isFinite(ano) || ano < 2000 || ano > 2100) {
      setMessage({ type: "error", text: "Informe um ano válido." });
      return;
    }
    if (!dataApresentacao) {
      setMessage({
        type: "error",
        text: "Selecione a data da apresentação.",
      });
      return;
    }
    if (!apresentador.trim()) {
      setMessage({
        type: "error",
        text: "Informe o nome do apresentador.",
      });
      return;
    }
    if (!cargoApresentador.trim()) {
      setMessage({
        type: "error",
        text: "Informe o cargo do apresentador.",
      });
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/audiencias/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano,
          quadrimestre,
          dataApresentacao: isoToBr(dataApresentacao),
          apresentador: apresentador.trim(),
          cargoApresentador: cargoApresentador.trim(),
          oficioSemfaz: oficioSemfaz.trim() || undefined,
          oficioCamara: oficioCamara.trim() || undefined,
          anoBaseCorrecao,
        }),
      });

      if (!res.ok) {
        // Parse tolerante — a rota pode devolver JSON de erro ou texto solto
        const rawText = await res.text();
        let errMsg = `Erro HTTP ${res.status} ${res.statusText}`;
        if (rawText) {
          try {
            const parsed = JSON.parse(rawText) as {
              error?: string;
              details?: string;
            };
            errMsg = parsed.error
              ? parsed.details
                ? `${parsed.error} — ${parsed.details}`
                : parsed.error
              : rawText;
          } catch {
            errMsg = rawText;
          }
        }
        setMessage({ type: "error", text: errMsg });
        return;
      }

      // Download do blob binário
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Audiencia_${quadrimestre}Q_${ano}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({
        type: "success",
        text: "Apresentação gerada com sucesso. O download deve iniciar automaticamente.",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <Header
        title="Audiências Públicas LRF"
        subtitle="Gerador de apresentação quadrimestral (LC 101/2000, Art. 9º §4º)"
        showCorrectionToggle={false}
      />

      <div className="space-y-6 p-6">
        {/* Mensagem global */}
        {message && (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-800"
                : message.type === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            ) : message.type === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Introdução */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Presentation className="h-4 w-4" />
              Como funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                A apresentação é gerada a partir das <strong>receitas</strong>,{" "}
                <strong>RREO</strong> (bimestral) e <strong>RGF</strong>{" "}
                (quadrimestral) já importados no sistema.
              </li>
              <li>
                <strong>1º e 2º quadrimestres</strong>: valores parciais (jan-abr
                / jan-ago), despesas <em>liquidadas</em>. O histórico é
                comparado nos mesmos meses dos anos anteriores.
              </li>
              <li>
                <strong>3º quadrimestre</strong>: valores totais do exercício
                (jan-dez), despesas <em>empenhadas</em>. O histórico é comparado
                ano a ano completo.
              </li>
              <li>
                Valores de anos anteriores são corrigidos pelo <strong>IPCA</strong>{" "}
                até 31/12 do ano anterior ao pivô informado abaixo.
              </li>
              <li>
                Os anexos de <strong>MDE (Educação)</strong> e{" "}
                <strong>ASPS (Saúde)</strong> são anexados à audiência como PDFs
                separados — os slides correspondentes virão como placeholders.
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Formulário */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Presentation className="h-4 w-4" />
              Parâmetros da apresentação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Exercício */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Exercício
                </label>
                <select
                  value={String(ano)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setAno(v);
                    setAnoBaseCorrecao(v);
                  }}
                  disabled={loadingAnos}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                >
                  {(anosDisponiveis.length > 0
                    ? anosDisponiveis
                    : [currentYear, currentYear - 1]
                  ).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Anos disponíveis nos dados de receita.
                </p>
              </div>

              {/* Quadrimestre */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Quadrimestre
                </label>
                <select
                  value={String(quadrimestre)}
                  onChange={(e) =>
                    setQuadrimestre(parseInt(e.target.value, 10) as 1 | 2 | 3)
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                >
                  {QUADRIMESTRES.map((q) => (
                    <option key={q.value} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Bimestre RREO alvo: <strong>{bimestreAlvo}º</strong>
                </p>
              </div>

              {/* Data da apresentação */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Data da apresentação
                </label>
                <input
                  type="date"
                  value={dataApresentacao}
                  onChange={(e) => setDataApresentacao(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Será exibida na capa no formato dd/mm/yyyy.
                </p>
              </div>

              {/* Ano base de correção monetária */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Ano pivô da correção monetária (IPCA)
                </label>
                <select
                  value={String(anoBaseCorrecao)}
                  onChange={(e) =>
                    setAnoBaseCorrecao(parseInt(e.target.value, 10))
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                >
                  {(anosDisponiveis.length > 0
                    ? anosDisponiveis
                    : [currentYear, currentYear - 1]
                  ).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Anos anteriores serão corrigidos para 31/12/
                  {anoBaseCorrecao - 1}.
                </p>
              </div>

              {/* Apresentador */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Nome do apresentador
                </label>
                <input
                  type="text"
                  value={apresentador}
                  onChange={(e) => setApresentador(e.target.value)}
                  placeholder="Ex.: João da Silva"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                />
              </div>

              {/* Cargo */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Cargo do apresentador
                </label>
                <input
                  type="text"
                  value={cargoApresentador}
                  onChange={(e) => setCargoApresentador(e.target.value)}
                  placeholder="Ex.: Secretário Municipal da Fazenda"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                />
              </div>

              {/* Ofícios (opcional) */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Ofício Expedido SEMFAZ → Câmara{" "}
                  <span className="text-xs font-normal text-slate-400">
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  value={oficioSemfaz}
                  onChange={(e) => setOficioSemfaz(e.target.value)}
                  placeholder="Ex.: 102/2026 (05.02.2026)"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Ofício Expedido Câmara → SEMFAZ{" "}
                  <span className="text-xs font-normal text-slate-400">
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  value={oficioCamara}
                  onChange={(e) => setOficioCamara(e.target.value)}
                  placeholder="Ex.: 215/2026 (10.02.2026)"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-semfaz-400"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-semfaz-600 hover:bg-semfaz-700"
              >
                <Download
                  className={`mr-2 h-4 w-4 ${generating ? "animate-pulse" : ""}`}
                />
                {generating ? "Gerando..." : "Gerar apresentação (.pptx)"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pré-validação: disponibilidade dos dados */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4" />
              Disponibilidade dos dados no banco
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusLoading ? (
              <p className="text-sm text-slate-500">Verificando…</p>
            ) : checks ? (
              <>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <StatusRow
                    label={`Receitas de ${ano}`}
                    ok={checks.receitasAno}
                  />
                  <StatusRow
                    label={`RREO — ${bimestreAlvo}º bimestre/${ano}`}
                    ok={checks.rreoAno}
                  />
                  <StatusRow
                    label={`RREO — ${bimestreAlvo}º bimestre/${ano - 1} (comparativo)`}
                    ok={checks.rreoAnoAnterior}
                  />
                  <StatusRow
                    label={`RGF — ${quadrimestre}º quadri/${ano} (Prefeitura)`}
                    ok={checks.rgfPrefeitura}
                  />
                </div>

                <div className="rounded-lg border p-3 text-sm">
                  <p className="mb-1 font-medium">
                    Histórico de 5 anos (comparabilidade das receitas)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[ano - 4, ano - 3, ano - 2, ano - 1, ano].map((a) => {
                      const ok = checks.historico5Anos.includes(a);
                      return (
                        <Badge
                          key={a}
                          variant={ok ? "default" : "outline"}
                          className={
                            ok
                              ? "bg-green-100 text-green-800 hover:bg-green-100"
                              : "border-amber-300 bg-amber-50 text-amber-800"
                          }
                        >
                          {a}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {avisosFaltando.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="mb-1 font-medium">
                        Dados parcialmente disponíveis
                      </p>
                      <ul className="list-disc space-y-0.5 pl-5">
                        {avisosFaltando.map((av, i) => (
                          <li key={i}>{av}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs">
                        A apresentação pode ser gerada mesmo assim — os slides
                        sem dados ficarão com o texto{" "}
                        <em>"DADOS NÃO DISPONÍVEIS"</em>.
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Selecione um exercício para checar os dados disponíveis.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
      ) : (
        <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600" />
      )}
      <span className="flex-1">{label}</span>
      <Badge
        variant="outline"
        className={
          ok
            ? "border-green-300 bg-green-50 text-green-700"
            : "border-amber-300 bg-amber-50 text-amber-700"
        }
      >
        {ok ? "OK" : "Ausente"}
      </Badge>
    </div>
  );
}
