/**
 * Teste local do parser SIOPS Anexo 12.
 * Executa: npx tsx scripts/test-siops-parser.ts
 */

import { parseSiopsAnexo12, parseBrNumber } from "../lib/siops/parser";

// =========================================================================
// Testes unitários do parseBrNumber
// =========================================================================
function testParseBrNumber() {
  const cases: [string, number][] = [
    ["1.438.294.648,89", 1438294648.89],
    ["17,63", 17.63],
    ["0,00", 0],
    ["N/A", 0],
    ["-", 0],
    ["", 0],
    ["1.234,56", 1234.56],
    ["100,00", 100],
  ];

  let passed = 0;
  for (const [input, expected] of cases) {
    const result = parseBrNumber(input);
    if (Math.abs(result - expected) < 0.001) {
      passed++;
    } else {
      console.error(`FAIL parseBrNumber("${input}") → ${result}, expected ${expected}`);
    }
  }
  console.log(`parseBrNumber: ${passed}/${cases.length} passed`);
}

// =========================================================================
// HTML de teste — simula a estrutura do SIOPS Anexo 12
// =========================================================================
const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>SIOPS - Demonstrativo</title></head>
<body>
<table width="100%">
  <tr><td>UF: MA</td><td>MUNICIPIO: SAO LUIS</td></tr>
  <tr><td colspan="2">6&#186; Bimestre de 2025</td></tr>
  <tr><td colspan="2">Dados Homologados em 20/01/2026</td></tr>
</table>

<!-- Tabela 1: Receitas -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>RECEITAS</th><th>Prev Ini</th><th>Prev Atual</th><th>Ate Bim</th><th>%</th></tr>
  <tr><td>RECEITA DE IMPOSTOS (I)</td><td>500.000.000,00</td><td>500.000.000,00</td><td>450.000.000,00</td><td>90,00</td></tr>
  <tr><td>Imposto Predial e Territorial Urbano - IPTU</td><td>100.000.000,00</td><td>100.000.000,00</td><td>95.000.000,00</td><td>95,00</td></tr>
  <tr><td>Transmissao Inter Vivos - ITBI</td><td>80.000.000,00</td><td>80.000.000,00</td><td>70.000.000,00</td><td>87,50</td></tr>
  <tr><td>Servicos de Qualquer Natureza - ISS</td><td>200.000.000,00</td><td>200.000.000,00</td><td>185.000.000,00</td><td>92,50</td></tr>
  <tr><td>Renda e Proventos de Qualquer Natureza - IR</td><td>120.000.000,00</td><td>120.000.000,00</td><td>100.000.000,00</td><td>83,33</td></tr>
  <tr><td>RECEITA DE TRANSFERENCIAS CONSTITUCIONAIS E LEGAIS (II)</td><td>2.500.000.000,00</td><td>2.500.000.000,00</td><td>2.300.000.000,00</td><td>92,00</td></tr>
  <tr><td>Cota-Parte FPM</td><td>800.000.000,00</td><td>800.000.000,00</td><td>750.000.000,00</td><td>93,75</td></tr>
  <tr><td>Cota-Parte ITR</td><td>1.000.000,00</td><td>1.000.000,00</td><td>900.000,00</td><td>90,00</td></tr>
  <tr><td>Cota-Parte do IPVA</td><td>50.000.000,00</td><td>50.000.000,00</td><td>45.000.000,00</td><td>90,00</td></tr>
  <tr><td>Cota-Parte do ICMS</td><td>1.600.000.000,00</td><td>1.600.000.000,00</td><td>1.460.000.000,00</td><td>91,25</td></tr>
  <tr><td>IPI - Exportacao</td><td>10.000.000,00</td><td>10.000.000,00</td><td>9.000.000,00</td><td>90,00</td></tr>
  <tr><td>Compensacoes Financeiras</td><td>5.000.000,00</td><td>5.000.000,00</td><td>4.500.000,00</td><td>90,00</td></tr>
  <tr><td>TOTAL DAS RECEITAS PARA APURACAO DO MINIMO (III) = (I) + (II)</td><td>3.000.000.000,00</td><td>3.000.000.000,00</td><td>2.750.000.000,00</td><td>91,67</td></tr>
</table>

<!-- Tabela 2: Despesas por subfuncao (recursos proprios) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>DESPESAS</th><th>Dot Ini</th><th>Dot Atual</th><th>Empenh</th><th>%</th><th>Liquid</th><th>%</th><th>Paga</th><th>%</th><th>RP</th></tr>
  <tr><td>ATENCAO BASICA (IV)</td><td>300.000.000,00</td><td>300.000.000,00</td><td>280.000.000,00</td><td>93,33</td><td>270.000.000,00</td><td>90,00</td><td>265.000.000,00</td><td>88,33</td><td>0,00</td></tr>
  <tr><td>ASSISTENCIA HOSPITALAR (V)</td><td>100.000.000,00</td><td>100.000.000,00</td><td>95.000.000,00</td><td>95,00</td><td>90.000.000,00</td><td>90,00</td><td>88.000.000,00</td><td>88,00</td><td>0,00</td></tr>
  <tr><td>SUPORTE PROFILATICO E TERAPEUTICO (VI)</td><td>10.000.000,00</td><td>10.000.000,00</td><td>9.500.000,00</td><td>95,00</td><td>9.000.000,00</td><td>90,00</td><td>8.800.000,00</td><td>88,00</td><td>0,00</td></tr>
  <tr><td>VIGILANCIA SANITARIA (VII)</td><td>5.000.000,00</td><td>5.000.000,00</td><td>4.800.000,00</td><td>96,00</td><td>4.600.000,00</td><td>92,00</td><td>4.500.000,00</td><td>90,00</td><td>0,00</td></tr>
  <tr><td>VIGILANCIA EPIDEMIOLOGICA (VIII)</td><td>8.000.000,00</td><td>8.000.000,00</td><td>7.500.000,00</td><td>93,75</td><td>7.200.000,00</td><td>90,00</td><td>7.000.000,00</td><td>87,50</td><td>0,00</td></tr>
  <tr><td>ALIMENTACAO E NUTRICAO (IX)</td><td>2.000.000,00</td><td>2.000.000,00</td><td>1.900.000,00</td><td>95,00</td><td>1.800.000,00</td><td>90,00</td><td>1.750.000,00</td><td>87,50</td><td>0,00</td></tr>
  <tr><td>OUTRAS SUBFUNCOES (X)</td><td>50.000.000,00</td><td>50.000.000,00</td><td>47.000.000,00</td><td>94,00</td><td>45.000.000,00</td><td>90,00</td><td>44.000.000,00</td><td>88,00</td><td>0,00</td></tr>
  <tr><td>TOTAL (XI = IV+V+VI+VII+VIII+IX+X)</td><td>475.000.000,00</td><td>475.000.000,00</td><td>445.700.000,00</td><td>93,83</td><td>427.600.000,00</td><td>90,02</td><td>419.050.000,00</td><td>88,22</td><td>0,00</td></tr>
</table>

<!-- Tabela 3: Apuracao -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>APURACAO DO CUMPRIMENTO DO LIMITE MINIMO</th><th>Empenh</th><th>Liquid</th><th>Paga</th></tr>
  <tr><td>Total das Despesas com ASPS (XII)</td><td>445.700.000,00</td><td>427.600.000,00</td><td>419.050.000,00</td></tr>
  <tr><td>Restos a Pagar Inscritos Indevidamente (XIII)</td><td>0,00</td><td>0,00</td><td>0,00</td></tr>
  <tr><td>Recursos Vinculados (XIV)</td><td>0,00</td><td>0,00</td><td>0,00</td></tr>
  <tr><td>Disponibilidade de Caixa (XV)</td><td>0,00</td><td>0,00</td><td>0,00</td></tr>
  <tr><td>VALOR APLICADO EM ASPS (XVI = XII-XIII-XIV+XV)</td><td>445.700.000,00</td><td>427.600.000,00</td><td>419.050.000,00</td></tr>
  <tr><td>Despesa Minima a ser Aplicada em ASPS (XVII) = (III) x 15%</td><td colspan="3">412.500.000,00</td></tr>
  <tr><td>Diferenca entre o Valor Aplicado (XVIII = XVI-XVII)</td><td>33.200.000,00</td><td>15.100.000,00</td><td>6.550.000,00</td></tr>
  <tr><td>PERCENTUAL DA RECEITA APLICADO EM ASPS (XIX = XVI/III x 100)</td><td>16,21</td><td>15,55</td><td>15,24</td></tr>
</table>

<!-- Tabela 4 (placeholder) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>Controle Percentual</th><th>Valor</th></tr>
  <tr><td>Exercicio anterior</td><td>0,00</td></tr>
</table>

<!-- Tabela 5 (placeholder) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>Historico RP</th><th>Empenh</th></tr>
  <tr><td>Exercicio atual</td><td>0,00</td></tr>
</table>

<!-- Tabela 6 (placeholder) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>RP XXI</th><th>Valor</th></tr>
  <tr><td>Item</td><td>0,00</td></tr>
</table>

<!-- Tabela 7 (placeholder) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>RP XXII</th><th>Valor</th></tr>
  <tr><td>Item</td><td>0,00</td></tr>
</table>

<!-- Tabela 8 (placeholder) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>RP XXIII</th><th>Valor</th></tr>
  <tr><td>Item</td><td>0,00</td></tr>
</table>

<!-- Tabela 9: Receitas adicionais (XXIX) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>RECEITAS ADICIONAIS</th><th>Prev Ini</th><th>Prev Atual</th><th>Ate Bim</th><th>%</th></tr>
  <tr><td>RECEITAS DE TRANSFERENCIAS PARA A SAUDE (XXIX)</td><td>500.000.000,00</td><td>500.000.000,00</td><td>480.000.000,00</td><td>96,00</td></tr>
  <tr><td>Provenientes da Uniao</td><td>450.000.000,00</td><td>450.000.000,00</td><td>432.000.000,00</td><td>96,00</td></tr>
  <tr><td>Provenientes dos Estados</td><td>50.000.000,00</td><td>50.000.000,00</td><td>48.000.000,00</td><td>96,00</td></tr>
  <tr><td>Provenientes de Outros Municipios</td><td>0,00</td><td>0,00</td><td>0,00</td><td>0,00</td></tr>
  <tr><td>RECEITA DE OPERACOES DE CREDITO (XXX)</td><td>0,00</td><td>0,00</td><td>0,00</td><td>0,00</td></tr>
  <tr><td>OUTRAS RECEITAS (XXXI)</td><td>0,00</td><td>0,00</td><td>0,00</td><td>0,00</td></tr>
  <tr><td>TOTAL RECEITAS ADICIONAIS (XXXII = XXIX+XXX+XXXI)</td><td>500.000.000,00</td><td>500.000.000,00</td><td>480.000.000,00</td><td>96,00</td></tr>
</table>

<!-- Tabela 10: Despesas nao computadas (XXXIII) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>DESPESAS NAO COMPUTADAS</th><th>Dot Ini</th><th>Dot Atual</th><th>Empenh</th><th>%</th><th>Liquid</th><th>%</th><th>Paga</th><th>%</th><th>RP</th></tr>
  <tr><td>ATENCAO BASICA (XXXIII)</td><td>200.000.000,00</td><td>200.000.000,00</td><td>190.000.000,00</td><td>95,00</td><td>185.000.000,00</td><td>92,50</td><td>180.000.000,00</td><td>90,00</td><td>0,00</td></tr>
  <tr><td>ASSISTENCIA HOSPITALAR (XXXIV)</td><td>100.000.000,00</td><td>100.000.000,00</td><td>95.000.000,00</td><td>95,00</td><td>90.000.000,00</td><td>90,00</td><td>88.000.000,00</td><td>88,00</td><td>0,00</td></tr>
  <tr><td>TOTAL (XLI)</td><td>300.000.000,00</td><td>300.000.000,00</td><td>285.000.000,00</td><td>95,00</td><td>275.000.000,00</td><td>91,67</td><td>268.000.000,00</td><td>89,33</td><td>0,00</td></tr>
</table>

<!-- Tabela 11: Despesas totais (XLVIII) -->
<table class="tam2 tdExterno" width="100%">
  <tr bgcolor="#CDCDCD"><th>DESPESAS TOTAIS COM SAUDE</th><th>Dot Ini</th><th>Dot Atual</th><th>Empenh</th><th>%</th><th>Liquid</th><th>%</th><th>Paga</th><th>%</th><th>RP</th></tr>
  <tr><td>TOTAL DAS DESPESAS COM SAUDE (XLVIII)</td><td>775.000.000,00</td><td>775.000.000,00</td><td>730.700.000,00</td><td>94,28</td><td>702.600.000,00</td><td>90,66</td><td>687.050.000,00</td><td>88,65</td><td>0,00</td></tr>
  <tr><td>TOTAL DAS DESPESAS EXECUTADAS COM RECURSOS PROPRIOS (XLIX)</td><td>475.000.000,00</td><td>475.000.000,00</td><td>445.700.000,00</td><td>93,83</td><td>427.600.000,00</td><td>90,02</td><td>419.050.000,00</td><td>88,22</td><td>0,00</td></tr>
</table>

</body>
</html>
`;

// =========================================================================
// Testa com HTML de classe diferente (single quotes, reversed order)
// =========================================================================
const SAMPLE_HTML_SINGLE_QUOTES = SAMPLE_HTML.replace(/class="tam2 tdExterno"/g, "class='tdExterno tam2'");
const SAMPLE_HTML_NO_CLASS = SAMPLE_HTML.replace(/class="tam2 tdExterno"/g, 'class="outra-classe"');

function assertApprox(label: string, actual: number, expected: number, tolerance = 0.01) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`  ✓ ${label}: ${actual}`);
  } else {
    console.error(`  ✗ ${label}: got ${actual}, expected ${expected}`);
    process.exitCode = 1;
  }
}

function testParser(html: string, label: string) {
  console.log(`\n── ${label} ──`);
  try {
    const result = parseSiopsAnexo12(html, "211130", "MA");
    assertApprox("bimestre", result.bimestre, 6);
    assertApprox("ano", result.exercicioAno, 2025);
    assertApprox("receitas.total", result.receitas.total, 2_750_000_000);
    assertApprox("receitas.impostos", result.receitas.impostos, 450_000_000);
    assertApprox("receitas.transferencias", result.receitas.transferencias, 2_300_000_000);
    assertApprox("apuracao.despesaMinima", result.apuracao.despesaMinima, 412_500_000);
    assertApprox("apuracao.valorAplicado.liquidada", result.apuracao.valorAplicado.liquidada, 427_600_000);
    assertApprox("apuracao.percentualAplicado.liquidada", result.apuracao.percentualAplicado.liquidada, 15.55);
    assertApprox("receitasAdicionais.provenientesUniao", result.receitasAdicionais.provenientesUniao, 432_000_000);
    assertApprox("despesasTotais.totalSaude.liquidada", result.despesasTotais.totalSaude.liquidada, 702_600_000);
    console.log(`  ✓ municipio: "${result.municipio}"`);
    console.log(`  ✓ dataHomologacao: "${result.dataHomologacao}"`);
  } catch (e) {
    console.error(`  ERRO: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}

testParseBrNumber();
testParser(SAMPLE_HTML, "HTML com class double quotes (tam2 tdExterno)");
testParser(SAMPLE_HTML_SINGLE_QUOTES, "HTML com class single quotes (tdExterno tam2)");
testParser(SAMPLE_HTML_NO_CLASS, "HTML sem class esperada (fallback por conteúdo)");

console.log("\nDone.");
