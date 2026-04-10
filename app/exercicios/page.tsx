"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading";
import { FolderOpen, FileText, Upload, Calendar, Trash2 } from "lucide-react";

interface ExercicioRow {
  ano: number;
  tipo: string;
  status: string;
  created_at: string;
  total_receitas: number;
  total_rreo_bimestres: number;
  total_rgf_quadrimestres: number;
}

interface UploadRow {
  id: number;
  filename: string;
  file_type: string;
  exercicio_ano: number;
  periodo: string;
  status: string;
  registros_inseridos: number;
  erro_mensagem: string | null;
  created_at: string;
}

export default function ExerciciosPage() {
  const [exercicios, setExercicios] = useState<ExercicioRow[]>([]);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [anos, setAnos] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingAno, setDeletingAno] = useState<number | null>(null);

  async function fetchData() {
    try {
      const res = await fetch("/api/exercicios");
      const json = await res.json();
      setExercicios(json.exercicios || []);
      setUploads(json.uploads || []);
      setAnos(json.anos || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleDelete(ano: number) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir TODOS os dados do exercício ${ano}?\n\nEsta ação irá remover receitas, RREO, RGF e histórico de uploads deste ano. Não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setDeletingAno(ano);
    try {
      const res = await fetch(`/api/exercicios?ano=${ano}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        alert(`Erro ao excluir: ${json.error || "desconhecido"}`);
        return;
      }
      await fetchData();
    } catch (err) {
      alert(`Erro ao excluir: ${String(err)}`);
    } finally {
      setDeletingAno(null);
    }
  }

  if (loading) {
    return (
      <div>
        <Header title="Exercícios Fiscais" subtitle="Gestão de dados carregados" />
        <div className="p-6"><LoadingSpinner /></div>
      </div>
    );
  }

  // Group exercises by year
  const byYear = new Map<number, ExercicioRow[]>();
  for (const e of exercicios) {
    if (!byYear.has(e.ano)) byYear.set(e.ano, []);
    byYear.get(e.ano)!.push(e);
  }
  const sortedYears = [...byYear.keys()].sort((a, b) => b - a);

  const typeLabels: Record<string, string> = {
    receita: "Receitas",
    rreo: "RREO",
    rgf: "RGF",
  };

  const statusColors: Record<string, "success" | "warning" | "destructive"> = {
    concluido: "success",
    processando: "warning",
    erro: "destructive",
  };

  return (
    <div>
      <Header title="Exercícios Fiscais" subtitle="Gestão de dados carregados no sistema" />

      <div className="space-y-6 p-6">
        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-blue-50 p-3">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{anos.length}</p>
                <p className="text-xs text-muted-foreground">Exercícios com dados</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-green-50 p-3">
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{exercicios.length}</p>
                <p className="text-xs text-muted-foreground">Conjuntos de dados</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-purple-50 p-3">
                <Upload className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{uploads.length}</p>
                <p className="text-xs text-muted-foreground">Uploads realizados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Exercises by Year */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4" />
              Exercícios Carregados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedYears.map((ano) => {
                const exs = byYear.get(ano) || [];
                const receita = exs.find((e) => e.tipo === "receita");
                const rreo = exs.find((e) => e.tipo === "rreo");
                const rgf = exs.find((e) => e.tipo === "rgf");

                return (
                  <div key={ano} className="flex items-center gap-4 rounded-lg border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-semfaz-50 font-bold text-semfaz-700">
                      {ano}
                    </div>
                    <div className="flex flex-1 flex-wrap gap-2">
                      {receita && (
                        <Badge variant="default">
                          Receitas ({receita.total_receitas.toLocaleString("pt-BR")} registros)
                        </Badge>
                      )}
                      {rreo && (
                        <Badge variant="secondary">
                          RREO ({rreo.total_rreo_bimestres} bimestres)
                        </Badge>
                      )}
                      {rgf && (
                        <Badge variant="secondary">
                          RGF ({rgf.total_rgf_quadrimestres} períodos)
                        </Badge>
                      )}
                      {!receita && !rreo && !rgf && (
                        <Badge variant="outline">Sem dados</Badge>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(ano)}
                      disabled={deletingAno === ano}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {deletingAno === ano ? "Excluindo..." : "Excluir"}
                    </Button>
                  </div>
                );
              })}
              {sortedYears.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum exercício carregado. Faça upload de arquivos na seção Upload.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upload History */}
        {uploads.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                Histórico de Uploads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Arquivo</th>
                      <th className="px-3 py-2 text-left font-medium">Tipo</th>
                      <th className="px-3 py-2 text-left font-medium">Exercício</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Registros</th>
                      <th className="px-3 py-2 text-left font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploads.map((u) => (
                      <tr key={u.id} className="border-b">
                        <td className="px-3 py-2 font-mono">{u.filename}</td>
                        <td className="px-3 py-2">{typeLabels[u.file_type] || u.file_type}</td>
                        <td className="px-3 py-2">{u.exercicio_ano}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusColors[u.status] || "outline"}>
                            {u.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {u.registros_inseridos.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-2">{new Date(u.created_at).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
