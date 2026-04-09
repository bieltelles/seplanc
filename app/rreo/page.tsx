"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/shared/loading";
import { FileText } from "lucide-react";

export default function RreoPage() {
  const [anos, setAnos] = useState<number[]>([]);
  const [bimestres, setBimestres] = useState<number[]>([]);
  const [anexos, setAnexos] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, string>[] | null>(null);

  const [selectedAno, setSelectedAno] = useState<number>(0);
  const [selectedBimestre, setSelectedBimestre] = useState<number>(0);
  const [selectedAnexo, setSelectedAnexo] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (ano: number, bimestre: number, anexo: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (ano) params.set("ano", String(ano));
      if (bimestre) params.set("bimestre", String(bimestre));
      if (anexo) params.set("anexo", anexo);

      const res = await fetch(`/api/rreo?${params}`);
      const json = await res.json();

      setAnos(json.anos || []);
      if (json.bimestres) setBimestres(json.bimestres);
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
    fetchData(0, 0, "");
  }, [fetchData]);

  const handleAnoChange = (ano: number) => {
    setSelectedAno(ano);
    setSelectedBimestre(0);
    setSelectedAnexo("");
    setData(null);
    fetchData(ano, 0, "");
  };

  const handleBimestreChange = (bimestre: number) => {
    setSelectedBimestre(bimestre);
    setSelectedAnexo("");
    setData(null);
    fetchData(selectedAno, bimestre, "");
  };

  const handleAnexoChange = (anexo: string) => {
    setSelectedAnexo(anexo);
    fetchData(selectedAno, selectedBimestre, anexo);
  };

  const bimestreLabels: Record<number, string> = {
    1: "1º Bimestre (Jan-Fev)",
    2: "2º Bimestre (Mar-Abr)",
    3: "3º Bimestre (Mai-Jun)",
    4: "4º Bimestre (Jul-Ago)",
    5: "5º Bimestre (Set-Out)",
    6: "6º Bimestre (Nov-Dez)",
  };

  return (
    <div>
      <Header title="RREO" subtitle="Relatório Resumido de Execução Orçamentária" />

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
            {bimestres.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Bimestre</p>
                <Select
                  options={bimestres.map((b) => ({
                    value: String(b),
                    label: bimestreLabels[b] || `${b}º Bimestre`,
                  }))}
                  value={String(selectedBimestre)}
                  onChange={(e) => handleBimestreChange(parseInt(e.target.value))}
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
                <FileText className="h-4 w-4" />
                {selectedAnexo}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {selectedAno} - {bimestreLabels[selectedBimestre] || `${selectedBimestre}º Bimestre`}
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

        {data && data.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Nenhum dado encontrado para os filtros selecionados.</p>
            </CardContent>
          </Card>
        )}

        {!data && !loading && selectedAno === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-muted-foreground">
                Selecione um exercício para visualizar os dados do RREO.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
