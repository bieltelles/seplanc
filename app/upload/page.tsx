"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface Anexo12Info {
  action: "inserted" | "updated" | "unchanged" | "skipped";
  exercicioAno: number;
  bimestre: number;
  motivo?: string;
  receitaTotal?: number;
  valorAplicadoLiquidada?: number;
  percentualLiquidada?: number;
}

interface UploadResult {
  success: boolean;
  message?: string;
  error?: string;
  filename?: string;
  details?: {
    type: string;
    label: string;
    year: number;
    period: number | null;
    entity: string | null;
    recordsInserted: number;
    anexo12?: Anexo12Info | null;
  };
}

function formatPct(v: number | undefined): string {
  if (v == null) return "—";
  // Trunca em 2 casas para casar com SIOPS
  const t = Math.trunc(v * 100) / 100;
  return t.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";
}

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const json = await res.json();
        setResults((prev) => [
          { success: res.ok, ...json, filename: file.name },
          ...prev,
        ]);
      } catch (err) {
        setResults((prev) => [
          { success: false, error: String(err), filename: file.name } as UploadResult,
          ...prev,
        ]);
      }
    }
    setUploading(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload],
  );

  return (
    <div>
      <Header title="Upload de Arquivos" subtitle="Importar dados financeiros para o sistema" />

      <div className="space-y-6 p-6">
        {/* Drop Zone */}
        <Card>
          <CardContent className="p-6">
            <div
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
                dragActive
                  ? "border-semfaz-500 bg-semfaz-50"
                  : "border-gray-300 hover:border-semfaz-300"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              {uploading ? (
                <Loader2 className="mb-4 h-12 w-12 animate-spin text-semfaz-500" />
              ) : (
                <Upload className="mb-4 h-12 w-12 text-gray-400" />
              )}
              <p className="mb-1 text-base font-medium">
                {uploading ? "Processando..." : "Arraste arquivos aqui"}
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                ou clique para selecionar
              </p>
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                multiple
                className="hidden"
                id="file-input"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("file-input")?.click()}
                disabled={uploading}
              >
                Selecionar Arquivos
              </Button>
              <div className="mt-4 text-center text-xs text-muted-foreground">
                <p>Formatos aceitos:</p>
                <div className="mt-1 flex flex-wrap gap-2 justify-center">
                  <Badge variant="secondary">CSV - Balancete de Receita</Badge>
                  <Badge variant="secondary">CSV - Balancete de Despesa Geral</Badge>
                  <Badge variant="secondary">XLS - RREO (SICONFI)</Badge>
                  <Badge variant="secondary">XLS - RGF (SICONFI)</Badge>
                </div>
                <p className="mt-2">
                  O sistema detecta automaticamente o tipo, exercício e período pelo nome do arquivo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Naming Guide */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Padrão de Nomenclatura</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="mb-1 font-semibold text-blue-800">Balancete de Receita</p>
                <code className="text-blue-600">YYYY_BALANCETE_RECEITA_ANUAL.csv</code>
                <p className="mt-1 text-blue-700">Ex: 2025_BALANCETE_RECEITA_ANUAL.csv</p>
              </div>
              <div className="rounded-lg bg-rose-50 p-3">
                <p className="mb-1 font-semibold text-rose-800">Balancete de Despesa</p>
                <code className="text-rose-600">YYYY_BALANCETE_DESPESA_GERAL.csv</code>
                <p className="mt-1 text-rose-700">
                  Base para o indicador de Saúde (função 10, fonte 1500001002).
                </p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="mb-1 font-semibold text-green-800">RREO</p>
                <code className="text-green-600">YYYY_SICONFI_RREO_1481_BIMESTRAL_N.xls</code>
                <p className="mt-1 text-green-700">Ex: 2024_SICONFI_RREO_1481_BIMESTRAL_3.xls</p>
              </div>
              <div className="rounded-lg bg-purple-50 p-3">
                <p className="mb-1 font-semibold text-purple-800">RGF</p>
                <code className="text-purple-600">YYYY_SICONFI_RGF_1481_QUADRIMESTRAL_N.xls</code>
                <p className="mt-1 text-purple-700">Ex: 2024_SICONFI_RGF_1481_QUADRIMESTRAL_2.xls</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {results.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resultados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      r.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                    }`}
                  >
                    {r.success ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                    )}
                    <div className="text-xs">
                      {r.success && r.message && !r.details ? (
                        <p className="font-medium text-green-800">{r.message}</p>
                      ) : r.success && r.details ? (
                        <>
                          <p className="font-medium text-green-800">{r.details.label}</p>
                          <p className="text-green-700">
                            Exercício {r.details.year} — {r.details.recordsInserted.toLocaleString("pt-BR")} registros importados
                          </p>
                          {r.details.anexo12 && r.details.anexo12.action !== "skipped" && (
                            <p className="mt-1 text-emerald-700">
                              Indicador de Saúde {r.details.anexo12.exercicioAno}/{r.details.anexo12.bimestre}º bim
                              {" "}
                              recalculado ({r.details.anexo12.action}): {formatPct(r.details.anexo12.percentualLiquidada)} aplicado em ASPS.
                            </p>
                          )}
                          {r.details.anexo12 && r.details.anexo12.action === "skipped" && (
                            <p className="mt-1 text-amber-700">
                              {r.details.anexo12.motivo || "Indicador não recalculado."}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-red-800">{r.error || "Erro desconhecido"}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
