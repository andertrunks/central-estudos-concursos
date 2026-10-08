# Prioridade zero — checkpoint estrutural 2026-10-08
Data: 08/10/2026 00:02 America/Sao_Paulo.
Fase: A/B — auditoria inicial de código, testes locais, metadados do banco e interfaces públicas. Auditoria completa de comportamento ainda PENDENTE; não interpretar a matriz como aceitação final.
Nenhum progresso pessoal foi modificado. Conteúdo editorial não foi integrado nesta execução. Cloud progress NÃO VALIDADO pelo critério A/B em nenhum dos três projetos nesta execução.

## Matriz (escopo: requisito completo solicitado)
| Recurso | Reconstrução | Tribunais | Central |
|---|---|---|---|
| Progresso local | PARCIAL: IndexedDB por conta; testes de modelo aprovados; migração histórica documentada | PARCIAL: localStorage por conta e baseline, unitários aprovados | IMPLEMENTADO no código/testes unitários de persistência/migração; regressão real offline pendente |
| Autenticação | PARCIAL: Google exposto, cliente e tabela existentes; login real não repetido | PARCIAL: Google/PKCE existente; login real não repetido | AUSENTE no código publicado |
| Nuvem | PARCIAL: tabela existente/RLS ativa; histórico de migração real, A/B atual pendente | PARCIAL: tabela existente/RLS ativa; A/B atual pendente | AUSENTE no aplicativo publicado |
| Sync | COM DEFEITO por inspeção: merge por timestamp global e upsert sem CAS permitem perda em conflitos; reprodução concorrente pendente | PARCIAL: CAS/baseline/reconexão existentes; E2E remoto pendente | AUSENTE |
| Offline | PARCIAL: IndexedDB, sem SW/PWA integral; SDK externo | PARCIAL: PWA gerado, teste real nesta sessão pendente | PARCIAL: PWA gerado, teste real nesta sessão pendente |
| Trilha | PARCIAL: retomada do diagnóstico; página Trilhas estática | AUSENTE como fila dinâmica; link inicial aponta para demonstração | PARCIAL: fila dinâmica por atividade publicada |
| Revisões | PARCIAL: estado manual; sem agenda espaçada automática | PARCIAL: agenda manual; conclusão não agenda revisão espaçada | PARCIAL: D0/D1/D7/D21 e reforço, adaptação duradoura incompleta |
| Próximo estudo | PARCIAL: diagnóstico, não percurso curricular | PARCIAL: primeira aula/retomada, não prioridade pedagógica | IMPLEMENTADO na interface publicada; precisa evoluir alternância |
| Alternância | AUSENTE | AUSENTE | PARCIAL: alterna tipos, não disciplinas |
| Testes | PARCIAL: 5 unitários, lint/TS/conteúdo/build aprovados | PARCIAL: suíte npm test/lint/TS/build aprovada | PARCIAL: 46 testes/check/build aprovados |
Legenda: IMPLEMENTADO nesta matriz exige ler as ressalvas de escopo; nenhuma coluna está validada ponta a ponta.

## Evidências
- Reconstrução main inicial: 2fbf5708427bf29efa62312a6e49765909325c5a. docs/CLOUD_PROGRESS_RECOVERY_2026-10-07.md registra migração posterior ao estado antigo; não refazê-la. src/cloud.ts usa timestamp do estado inteiro, spread de topics e upsert; src/storage.ts faz read-merge-write sem condição de versão.
- Tribunais main inicial: 57a1e211c1685b81839f18847068aa6c4441bc93. docs/WORK_CHECKPOINT.md lido; src/hooks/useProgresso.ts e services/cloudSync.ts conferidos. Concluir alterna ID, agendar é manual; revisões não são automaticamente espaçadas.
- Central main inicial: 057095e0f3e2198f0459ec38c2d5359a9915c555. CHECKPOINT.md antigo aponta PUB-0015 pendente, mas Git/catálogo/UI comprovam 15 aulas, inclusive PUB-0015. Estado real prevalece. src/services/trail.ts alterna kind, não discipline; storage IndexedDB v2 possui atividades e migração.
- Consulta somente de metadados Supabase: tribunais_progress e reconstrucao_escolar_progress com RLS ativa; políticas de dono auth.uid()=user_id, UPDATE com USING/WITH CHECK. Nenhuma resposta pessoal lida/escrita.
- Interface pública dos três sites aberta em navegador em 08/10: Reconstrução mostra login Google e diagnóstico; Tribunais login e link inicial para /aulas/interpretacao; Central mostra próximo estudo “Política e modalidades de backup”, 15/77 assuntos e 732 questões, sem conta.
- Drive Reconstrução: checkpoint INC27 1DCXseHErMGWU7lFD5ypKdunvdUceflqZ4B3v-lyZyMc: B1 parcial, reconstruções MAT-EST-001–020, primeiro editorial 021; não iniciar 068.
- Drive Tribunais: 1HrBIjRYNap48D2jp0kgv4SwS1Y9bCYi6xHgB-CrXFJY, último SRC-001, trf3_aj_adm com extração granular pendente.
- Drive Central: auditoria 1AyZ8OtLIetcoYA1e30i5jrorbhzYzpHQ1j4AHIhSXik lida, §95 é contrato futuro auth/correção; não prova implementação. Regra antiga de progresso exclusivamente local é superada pela autorização explícita de cloud sync desta missão, preservando isolamento e dados.

## Limitações concretas e pendências
Não há sessão/credenciais de teste autenticadas disponíveis neste ambiente; não usar conta real para fabricar atividade. Teste A/B remoto exige conta isolada e revisão/atividade implementadas. Nenhum CLOUD PROGRESS: VALIDADO.
Instalação do navegador Playwright 1.63 falhou (download retornou arquivo ZIP inválido). Navegador remoto permitiu inspeção pública, mas testes offline e duas sessões isoladas ainda não executados.
Builds dos três passaram; warnings de bundle grande na Central/Tribunais preservados. Não trocar conteúdo integral por resumo.
Push/deploy funcional: não realizado até este checkpoint. Apenas documentação de auditoria persistida. URLs abertas: https://andertrunks.github.io/reconstrucao-escolar-2027/ ; https://andertrunks.github.io/tribunais-estudos-2026/ ; https://andertrunks.github.io/central-estudos-concursos/ . Versão de deploy ainda precisa de comparação de assets/version.json.

## Próximas ações exatas
1. Central: adicionar cenários de disciplinas diferentes em tests/trail.test.ts; ajustar recommendations em src/services/trail.ts para alternância após conclusão, sem interromper atividade iniciada e sem revisões infinitas; executar npm run check; commit/push/deploy e conferir version.json. Depois implementar auth+sync isolado, reutilizando conceitos válidos de Tribunais, sem apagar IndexedDB.
2. Reconstrução: reproduzir conflito entre tópicos/estados em src/cloud.test.ts, tornar merge conservador por entidade e adicionar controle otimista de concorrência ao armazenamento remoto; validar preservação e A/B antes de promover nuvem. Implementar fila/revisões e retomada de aula sem manter aluno preso ao diagnóstico completo.
3. Tribunais: adicionar scheduler tipado/testado e eventos de atividade preservados no contrato de sync; conectar conclusão/revisões ao próximo estudo; substituir link inicial de demonstração por recomendação canônica sem remover demonstração.
A prioridade zero permanece aberta; fluxo editorial normal não liberado.
