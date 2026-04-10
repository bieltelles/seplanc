# SEMFAZ Dashboard — Notas de Desenvolvimento

## Regra crítica: exercícios 2018-2021 (formato intermediário)

**Sempre que desenvolver algo que toque classificação de receitas, filtros por
categoria, agregações ou gráficos, verifique ANTES de considerar a tarefa
pronta se os exercícios de 2018 a 2021 continuam aparecendo corretamente.**

Os dados da prefeitura usam três eras de codificação distintas, e os anos
2018-2021 caem num formato intermediário que repetidamente foi esquecido em
alterações passadas (bug do IPTU e bug do FPM/SUS/ICMS/IPVA). Sempre que
classificar códigos de receita ou adicionar uma nova categoria, cheque
explicitamente os três formatos:

### Os três formatos de código

1. **10 dígitos — STN antigo (2013-2017)**
   - IPTU: `111202xxxx`
   - ITBI: `111208xxxx`
   - IR: `111204xxxx`
   - ISS: `111305xxxx` / `111300xxxx`
   - FPM: `17210102xx`
   - SUS: `172133xxxx`
   - ICMS: `17220101xx`
   - IPVA: `17220102xx`

2. **11 dígitos intermediário (2018-2021)** — prefixos `11180` / `17180` / `17280`
   - IPTU: `1118011xxxx`
   - ITBI: `1118014xxxx`
   - ISS: `1118023xxxx`
   - FPM: `1718012xxxx` (cota mensal), `1718013xxxx` (1% dez), `1718014xxxx` (1% jul)
   - SUS: `171803xxxxx` (Bloco Custeio), `171804xxxxx` (Bloco Investimentos)
   - ICMS: `1728011xxxx`
   - IPVA: `1728012xxxx`
   - Demais transferências União: `17180xxxxxx` (ITR, CFEM, FEP, IOF-Ouro…)
   - Demais transferências Estado: `17280xxxxxx`

3. **11 dígitos MCASP (2022+)** — prefixos `11125` / `11145` / `171` / `172`
   - IPTU: `11125xxxxxx` (exceto `111253`)
   - ITBI: `111253xxxxx`
   - IR: `11130xxxxxx`
   - ISS: `11145xxxxxx` / `11140xxxxxx`
   - FPM: `171151xxxxx`
   - SUS: `1713xxxxxxx`
   - ICMS: `172150xxxxx`
   - IPVA: `172151xxxxx`

### Checklist ao mexer em classificação / filtros / agregações

1. A lógica trata o formato 10 dígitos (2013-2017)?
2. A lógica trata o formato intermediário 11 dígitos (2018-2021)?
3. A lógica trata o formato MCASP 11 dígitos (2022+)?
4. Os prefixos específicos (FPM, SUS, ICMS, IPVA, etc.) são verificados
   ANTES dos catch-alls genéricos (`171`, `172`, `17`)?
5. Depois de alterar `classifyRevenue`, peça ao usuário para disparar
   `GET /api/reclassify` em produção para reprocessar as linhas persistidas
   no Turso.

### Canônico: `lib/constants/tax-categories.ts`

Toda a lógica de classificação por código vive em `classifyRevenue()` em
`lib/constants/tax-categories.ts`. Qualquer categoria nova deve ser mapeada
lá para os **três** formatos. Se estiver inseguro sobre os prefixos de
2018-2021, leia `arquivos/receitas/2019_BALANCETE_RECEITA_ANUAL.csv` e
`arquivos/receitas/2020_BALANCETE_RECEITA_ANUAL.csv` para confirmar.

## Workflow de deploy

- Branch de desenvolvimento: `claude/financial-dashboard-semfaz-LpMNd`
- Deploy automático na Vercel via `main`
- Padrão: commitar no feature branch → cherry-pick para `main` → push `main`
  → `git reset --hard origin/main` no feature branch → force-push
- Após deploys que mudam `classifyRevenue`, lembrar o usuário de chamar
  `GET /api/reclassify` para reprocessar linhas já persistidas.
