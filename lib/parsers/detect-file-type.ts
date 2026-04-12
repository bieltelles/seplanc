export type FileType =
  | "receita_csv"
  | "despesa_csv"
  | "rreo_xls"
  | "rgf_xls"
  | "unknown";

export interface DetectedFile {
  type: FileType;
  year: number | null;
  period: number | null;
  entity: string | null;
  label: string;
}

/**
 * Auto-detecta o tipo de arquivo financeiro baseado no nome.
 */
export function detectFileType(filename: string): DetectedFile {
  const upper = filename.toUpperCase();

  // Balancete de Receita CSV
  if (upper.includes("BALANCETE") && upper.includes("RECEITA")) {
    const yearMatch = filename.match(/(\d{4})/);
    return {
      type: "receita_csv",
      year: yearMatch ? parseInt(yearMatch[1]) : null,
      period: null,
      entity: null,
      label: "Balancete de Receita Anual",
    };
  }

  // Balancete de Despesa Geral CSV — estrutura analítica com
  // Dotacao (UO.FUNCAO+SUBFUNCAO.PROGRAMA.ACAO.C.G.MOD.ELEM.FONTE)
  // usada para calcular o Anexo 12 (Saúde) a partir de função=10.
  if (
    upper.includes("BALANCETE") &&
    upper.includes("DESPESA") &&
    upper.includes("GERAL")
  ) {
    const yearMatch = filename.match(/(\d{4})/);
    return {
      type: "despesa_csv",
      year: yearMatch ? parseInt(yearMatch[1]) : null,
      period: null,
      entity: null,
      label: "Balancete de Despesa Geral",
    };
  }

  // RREO XLS
  if (upper.includes("RREO")) {
    const yearMatch = filename.match(/(\d{4})/);
    const bimestreMatch = upper.match(/BIMESTRAL[_\s]*(\d)/);
    return {
      type: "rreo_xls",
      year: yearMatch ? parseInt(yearMatch[1]) : null,
      period: bimestreMatch ? parseInt(bimestreMatch[1]) : null,
      entity: null,
      label: `RREO - Bimestre ${bimestreMatch ? bimestreMatch[1] : "?"}`,
    };
  }

  // RGF XLS
  if (upper.includes("RGF")) {
    const yearMatch = filename.match(/(\d{4})/);
    const quadMatch = upper.match(/QUADRIMESTRAL[_\s]*(\d)/);
    const isCamara = upper.includes("CAMARA");
    return {
      type: "rgf_xls",
      year: yearMatch ? parseInt(yearMatch[1]) : null,
      period: quadMatch ? parseInt(quadMatch[1]) : null,
      entity: isCamara ? "camara" : "prefeitura",
      label: `RGF ${isCamara ? "Câmara" : "Prefeitura"} - Quadrimestre ${quadMatch ? quadMatch[1] : "?"}`,
    };
  }

  return {
    type: "unknown",
    year: null,
    period: null,
    entity: null,
    label: "Tipo não reconhecido",
  };
}
