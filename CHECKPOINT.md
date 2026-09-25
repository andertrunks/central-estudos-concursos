# Checkpoint técnico

- Última leitura editorial: 24/09/2026. Controle SQL modificado em 2026-09-24T00:29:18.822Z; documento principal em 2026-09-24T00:30:15.899Z.
- Snapshot preservado: editorial/snapshots/2026-09-23-sql-ready.csv. A leitura inicial continua em 2026-09-23.csv.
- Catálogo: 2 concursos, 77 referências permanentes, 10 semanas, 98 fontes.
- Conteúdo integrado: TI-BD-003, 28 subtemas, 252 questões objetivas, 36 exercícios abertos no caderno integral, 9 propostas discursivas, 2 imagens e 3 vídeos. Proveniência: editorial/sql-import.json.
- Fila: PUB-0001, pacote vindo dos documentos canônicos. A pasta física 08 estava vazia; a fila da planilha estava pronta para validação. Recibo: editorial/receipts/PUB-0001.json.
- Verificação: npm run check exige lint, TypeScript estrito, 26 testes, integridade e build. tests/browser.e2e.ts verifica rotas, acessibilidade, mobile, IndexedDB, questões, discursivas, imagens e offline.
- Último deploy/commit: consultar artefato deployment-checkpoint da última execução bem-sucedida de Validate and publish. Confirmar SHA contra https://andertrunks.github.io/central-estudos-concursos/version.json.
- Repositório: https://github.com/andertrunks/central-estudos-concursos, branch main.
- Pendências editoriais: outros 76 assuntos, simulados completos, requisitos e versão dos editais ausentes no controle. Exercícios abertos não têm correção automática. Textos históricos preservam contagens anteriores; auditoria final registra 59 referências reais únicas.
- Limite conhecido: catálogo carregado integralmente na V1; o texto SQL aumenta o pacote inicial. O build bloqueia recursos grandes demais para o cache PWA. Antes de ampliar muito a biblioteca, separar carregamento por aula, mantendo os mesmos contratos e IDs.
- Retomada: verificar Git, recibo, último workflow e checkpoint gerado. Só dar baixa no Drive depois de verificar exatamente a versão implantada. Não refazer publicação já confirmada nem apagar histórico.

O checkpoint de deploy é gerado após a implantação, evitando commit autorreferente. Recuperar com gh run download ID_DA_EXECUCAO -n deployment-checkpoint. A baixa do Drive e sua conferência são registradas no recibo de publicação.

## Encerramento de PUB-0001

- SQL publicado e verificado no commit 8b9f51f5b1694bb3c9214b025dd6ddf200ae0205. Lint, typecheck, 26 testes, build e teste completo no navegador público aprovados.
- Status publicado confirmado em FILA_PUBLICACAO!G2/I2 e MATRIZ_EDITAIS!J45. Recibo gravado na pasta 09_PUBLICADO: 1qLBNWJWm3QgL7Gg4Gbbw03Ob7dDkRAK6.
- Snapshot pós-publicação preservado em editorial/snapshots/2026-09-24-post-publication.csv, ainda NÃO aplicado integralmente ao site: contém novos pacotes produzidos por outro fluxo durante a implantação, incluindo Redes e Segurança. O catálogo publicado corresponde ao pacote SQL validado, com 98 fontes; a leitura posterior contém 132 fontes.
- Próxima execução: inspecionar os novos itens prontos na fila, reconciliar status de mídia pendente e validar cada pacote antes de importar. Não reimportar SQL nem sobrescrever sua baixa.

- Fila posterior observada: PUB-0002 (Redes), PUB-0003 (Segurança) e PUB-0004 (Governança) prontos para validação; PUB-0005 (LGPD) em produção. Redes e Segurança ainda têm Status mídia pendente. A matriz de Redes usa status livre parcial — RED-001 reutilizado em auditoria, fora do vocabulário aceito pelo importador; normalizar na fonte antes da próxima sincronização, preservando a observação.

## Evolução da trilha — 24/09/2026

- Branch de implementação: `feat/guided-study`, baseada em `cce7e5e`. Login separado: os dois rascunhos locais foram preservados em `work/account-sync-deferred/`, aguardando autorização de serviço externo.
- Nova leitura de controle: `editorial/snapshots/2026-09-24-trail-audit.csv`; auditoria por referência/subtema em `editorial/study-coverage-audit.json` e explicação em `docs/AUDITORIA-2026-09-24.md`. Esse snapshot não foi aplicado integralmente à fila/site.
- Sem novas aulas: textos canônicos preservados. 252 questões explicitamente inéditas; 112 vínculos de subtema extraídos dos cabeçalhos canônicos; 140 cumulativas. Seções de fechamento ligadas aos materiais já publicados.
- Nova rota `/estudar/:id`, entrada Continuar estudando, etapas permanentes, revisões intercaladas, questões, reforço, retomada e conclusão transacional. IndexedDB versão 2 acrescenta atividades, preserva dados legados e inclui atividades no backup.
- Validação local: lint, typecheck, 41 testes e build PWA aprovados. Teste de trilha no Edge: aceitação completa, compartilhamento, erro, reload, mobile, backup e offline aprovados. Regressão anterior aprovada, nove rotas e acessibilidade automatizada sem violações. Contraste do contador da página inicial corrigido.
- Build: aproximadamente 1,75 MB de JavaScript bruto / 366 KB gzip; cache PWA 3,24 MiB, dentro do limite. Alerta de bundle grande registrado, não desativado.
- Publicação desta evolução: aguardando commit, workflow e verificação pública no momento deste registro. Conferir `version.json` e artefato `deployment-checkpoint`; registrar recibo técnico após confirmação, sem dar baixa em pacotes editoriais que não foram importados.
- Próximo passo editorial: validar pacotes reais das outras disciplinas. Não apresentar os 76 assuntos sem aula como estudáveis. Metadados novos e algoritmo documentados em `docs/TRILHA-DE-ESTUDOS.md`.

### Confirmação pública da trilha

- Commit funcional `fdc84d1b9ba0ee46985dfc51b0d7a8ecba29e659`, com auditoria/metadados no commit `ec598ba`, publicado pelo workflow `36075422632` e confirmado por `version.json`.
- Deploy em 25/09/2026 00:00 UTC (24/09, 21:00 em São Paulo). Lint, typecheck, 41 testes e build passaram novamente no GitHub.
- Testes no site público encerrados em 25/09/2026 00:01:57 UTC: trilha completa, retomada, erros, persistência, celular, offline, nove rotas anteriores e acessibilidade automatizada passaram. Migração real do banco versão 1 para 2 verificada em contexto isolado do Edge, preservando conclusão e desempenho. Nenhum dado pessoal real foi usado nos testes.
- Recibo técnico: `editorial/receipts/TRILHA-2026-09-24.json`. A fila editorial não foi alterada. Na leitura mais recente, PUB-0005 já está pronto para validação com mídia concluída; a anotação anterior de produção é histórica.
- Este registro de fechamento não muda o código funcional. A publicação do próprio registro gera um novo checkpoint automático: consultar seu SHA/horário no artefato do workflow, sem confundi-lo com o commit funcional testado acima.
- Recibo também salvo e relido em `09_PUBLICADO` no Drive: `1XUFNvt9N4iU6WDpRfQQYxiBRoNk5fs_L`.
