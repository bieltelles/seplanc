"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/shared/loading";
import { ShieldCheck } from "lucide-react";

export default function RgfPage() {
  const [anos, setAnos] = useState<number[]>([]);
  const [periodos, setPeriodos] = useState<{ quadrimestre: number; entidade: string }[]>([]);
  const [anexos, setAnexos] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, string>[] | null>(null);

  const [selectedAno, setSelectedAno] = useState<number>(0);
  const [selectedQuad, setSelectedQuad] = useState<number>(0);
  const [selectedEntidade, setSelectedEntidade] = useState<string>("prefeitura");
  const [selectedAnexo, setSelectedAnexo] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (ano: number, quad: number, entidade: string, anexo: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (ano) params.set("ano", String(ano));
      if (quad) params.set("quadrimestre", String(quad));
      params.set("entidade", entidade);
      if (anexo) params.set("anexo", anexo);

      const res = await fetch(`/api/rgf?${params}`);
      const json = await res.json();

      setAnos(json.anos || []);
      if (json.periodos) setPeriodos(json.periodos);
      if (json.anexos) setAnexos(json.anexos);
      if (json.columns) setColumns(json.columns);
      setData(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(0, 0, "prefeitura", "");
  }, [fetchData]);

  const handleAnoChange = (ano: number) => {
    setSelectedAno(ano);
    setSelectedQuad(0);
    setSelectedAnexo("");
    setData(null);
    fetchData(ano, 0, selectedEntidade, "");
  };

  const handleQuadChange = (quad: number) => {
    setSelectedQuad(quad);
    setSelectedAnexo("");
    setData(null);
    fetchData(selectedAno, quad, selectedEntidade, "");
  };

  const handleEntidadeChange = (entidade: string) => {
    setSelectedEntidade(entidade);
    setSelectedQuad(0);
    setSelectedAnexo("");
    setData(null);
    fetchData(selectedAno, 0, entidade, "");
  };

  const handleAnexoChange = (anexo: string) => {
    setSelectedAnexo(anexo);
    fetchData(selectedAno, selectedQuad, selectedEntidade, anexo);
  };

  const quadLabels: Record<number, string> = {
    1: "1º Quadrimestre (Jan-Abr)",
    2: "2º Quadrimestre (Mai-Ago)",
    3: "3º Quadrimestre (Set-Dez)",
  };

  const entidades = [...new Set(periodos.map((p) => p.entidade))];
  const quadsDisponiveis = periodos
    .filter((p) => p.entidade === selectedEntidade)
    .map((p) => p.quadrimestre);

  return (
    <div>
      <Header title="RGF" subtitle="Relatório de Gestão Fiscal" />

      <div className="space-y-6 p-6">
        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Exercício</p>
              <Select
                options={anos.map((a) => ({ value: String(a), label: String(a) }))}
                value={String(selectedAno)}
                onChange={(e) => handleAnoChange(parseInt(e.target.value))}
                placeholder="Selecione o ano"
                className="w-36"
              />
            </div>
            {entidades.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Entidade</p>
                <Select
                  options={[
                    { value: "prefeitura", label: "Prefeitura (Poder Executivo)" },
                    { value: "camara", label: "Câmara (Poder Legislativo)" },
                  ].filter((opt) => entidades.includes(opt.value))}
                  value={selectedEntidade}
                  onChange={(e) => handleEntidadeChange(e.target.value)}
                  className="w-56"
                />
              </div>
            )}
            {quadsDisponiveis.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Quadrimestre</p>
                <Select
                  options={quadsDisponiveis.map((q) => ({
                    value: String(q),
                    label: quadLabels[q] || `${q}º Quadrimestre`,
                  }))}
                  value={String(selectedQuad)}
                  onChange={(e) => handleQuadChange(parseInt(e.target.value))}
                  placeholder="Selecione"
                  className="w-56"
                />
              </div>
            )}
            {anexos.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Anexo</p>
                <Select
                  options={anexos.map((a) => ({ value: a, label: a }))}
                  value={selectedAnexo}
                  onChange={(e) => handleAnexoChange(e.target.value)}
                  placeholder="Selecione o anexo"
                  className="w-80"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {loading && <LoadingSpinner />}

        {/* Data Table */}
        {data && data.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                {selectedAnexo}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {selectedAno} - {quadLabels[selectedQuad] || ""} - {selectedEntidade === "camara" ? "Câmara" : "Prefeitura"}
                {" "} - {data.length} linhas
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {columns.map((col) => (
                        <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        {columns.map((col) => (
                          <td key={col} className="whitespace-nowrap px-3 py-1.5">
                            {row[col] || ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {!data && !loading && selectedAno === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <ShieldCheck className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-muted-foreground">
                Selecione um exercício para visualizar os dados do RGF.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
