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


## Retomada contínua — 2026-09-29

- PUB-0010 — TI-RED-002 integrado no commit d1309abdc6dd60cbcb5749ca97a5d3b69e2d9336 com cinco materiais integrais reaproveitados, imagem original e 77 questões autorais interativas.
- GitHub Actions 36570555041: `npm run check` e deploy GitHub Pages concluídos com sucesso. Rota: https://andertrunks.github.io/central-estudos-concursos/#/biblioteca/TI-RED-002.
- Inspeção renderizada pública pendente: o navegador integrado expirou após 300 segundos e o web fetch não acessou a página. Controle canônico do Drive permanece inalterado; não registrar baixa editorial até verificação visual.
- QREF-INDEPAC-RED-002-001 e QREF-QUAD-RED-002-001 a 004 seguem pendentes e fora da pontuação. DHCP permanece separado.
- Último pacote integrado: PUB-0010. Primeiro pacote pendente: PUB-0011 — TI-SEG-002 (criptografia e autenticação). Retomar conferindo rota pública e, se runtime disponível, atualizar controle do Drive; em seguida continuar a fila.


## Retomada contínua — PUB-0011 — 2026-09-29

- TI-SEG-002 integrado no commit 33e389dab3f1b9ad693b7a19fe8c9ab701a0f75b; metadados obrigatórios de fontes corrigidos no commit 169d9673285dc9fe78d6daf27282613eeb03eadd.
- Reutilizados integralmente SI-002, SI-003 e complemento TI-SEG-002; 37 questões autorais interativas; PNG original e dois vídeos verificados.
- GitHub Actions 36572728970: `npm run check` e deploy do GitHub Pages concluídos com sucesso. Rota: https://andertrunks.github.io/central-estudos-concursos/#/biblioteca/TI-SEG-002.
- Inspeção renderizada pública pendente por timeout do navegador integrado e indisponibilidade do fetch; Google Sheet permanece sem baixa editorial.
- Q4219819, Q4061037, Q4189879, Q4189880 e referência Quadrix 2022 de Barreiras sem ID externo permanecem não pontuáveis até confronto com caderno e gabarito definitivo.
- Último pacote integrado: PUB-0011. Primeiro pacote pendente: PUB-0012 — TI-SO-001 (Windows e Linux).


## Retomada contínua — PUB-0012 — 2026-09-29

- TI-SO-001 integrado no commit 4830585dcdf07e0b49e81e59ba92412607988f21: SVC-001, SVC-002 e complemento Windows/Linux completos; 37 questões autorais; imagem original e três vídeos verificados.
- GitHub Actions 36573582061: `npm run check` e deploy GitHub Pages concluídos com sucesso. Rota: https://andertrunks.github.io/central-estudos-concursos/#/biblioteca/TI-SO-001.
- Verificação renderizada pública pendente pelo timeout do navegador integrado e indisponibilidade do web fetch. Google Sheet sem baixa editorial.
- Q4059481, Q4189836, Q4189837, Q4189840, Q4189847, Q4189862, Q3185247, Q4059480, Q1991091 e Q1990747 não pontuam sem validação do conjunto integral.
- Último pacote integrado: PUB-0012. Primeiro pacote pendente: PUB-0013 — TI-ES-001 (ciclo de vida de software).


## Continuidade editorial — 2026-09-29

- PUB-0013 — TI-ES-001: deploy do commit a77ea81281650dd26ca2cdd21f7217b0255c9330 concluído pelo workflow 36574427448; inspeção renderizada no navegador pendente. Drive não atualizado.
- PUB-0014 — TI-ES-004 Scrum e Kanban: seis questões autorais interativas; oito referências Quadrix seguem não pontuáveis até confronto com caderno e gabarito definitivo. Commit funcional/deploy: 4f855a1f74976d1c20d5e70dca06147a6dea2660; workflow 36576539096 passou npm run check e deploy Pages.
- Ajuste técnico mínimo: limite do precache PWA elevado de 3 para 4 MiB, pois o bundle completo com a aula excedia o limite anterior. Conteúdo e imagem original estão vinculados; IndexedDB/progresso preservados.
- Verificação pública visual pendente: o navegador integrado expirou após 300 s e o leitor web não consegue acessar GitHub Pages. Manter status canônico do Drive sem baixa até abrir a rota e confirmar leitura/questões/navegação.
- PUB-0015 — TI-SEG-004 Backup e continuidade é o próximo ID da fila, mas o próprio documento canônico marca “em produção” e determina não publicar antes da conclusão de teoria, questões, mídia, fontes e revisões. Aguardar revisão editorial.
- PUB-0016 — TI-CRB-003, PUB-0017 — TI-CRB-004, PUB-0018 — TI-SEG-005 e PUB-0019 — TI-CRB-002: documentos canônicos consultados marcam conteúdo EM PRODUÇÃO; não importar como aula finalizada.
- Próxima ação: (1) inspeção renderizada dos pacotes já implantados e, após confirmação, atualizar o controle do Drive; (2) aguardar conclusão editorial do PUB-0015; (3) retomar a fila sem tocar em ING-001.

## Publicação integral da fila pronta — 2026-10-08

- Repositório/branch: `andertrunks/central-estudos-concursos`, `main`. Commit inicial: `d8f03ec23819c99862dd966f91bb79a701a7fd62`.
- A leitura atual do controle editorial substitui a anotação histórica acima: PUB-0016 (TI-CRB-003), PUB-0017 (TI-CRB-004), PUB-0018 (TI-SEG-005) e PUB-0019 (TI-CRB-002) constam como concluídos editorialmente e prontos para validação Work.
- Integrados nesta etapa, preservando integralmente os documentos canônicos: 135 seções, 299.464 caracteres de teoria, 36 questões autorais objetivas, duas propostas discursivas, quatro imagens originais, sete vídeos e 54 novas fontes catalogadas. Todos os 1.016 parágrafos não vazios dos quatro Google Docs foram localizados sem perda no conteúdo das aulas.
- Itens anulados, localizadores sem caderno/gabarito definitivo e questões com resposta ainda não comprovada permanecem apenas no histórico textual, sem alternativa artificial e fora da pontuação.
- Validação concluída antes do push: pacotes `npm run queue` aprovados; `npm run lint`, `npm run typecheck`, 51/51 testes, integridade do catálogo e build PWA aprovados. O teste de trilha em navegador local não iniciou porque a distribuição `msedge` não existe neste ambiente; não registrar esse teste como aprovado.
- Build: 19 aulas publicáveis no catálogo; bundle JavaScript bruto 4.048,18 kB / gzip 996,91 kB; PWA com 29 entradas e 24.962,75 KiB. Alerta de chunk grande mantido, sem remover funcionalidade.
- Estado desta entrada: integração e testes concluídos; commit, push, deploy e verificação pública ainda pendentes.
- Próxima ação exata: criar commit atômico dos PUB-0016 a PUB-0019 sobre `d8f03ec23819c99862dd966f91bb79a701a7fd62`, mover `main`, acompanhar `Validate and publish`, abrir as quatro rotas públicas, confirmar seções/imagens/questões e então atualizar recibos e controle editorial sem alterar progresso do estudante.


## Fechamento de publicação — PUB-0016 a PUB-0019 — 2026-10-09

- Projeto/repositório/branch: Central de Estudos — Concursos Contínuos; `andertrunks/central-estudos-concursos`; `main`.
- Commit inicial: `d8f03ec23819c99862dd966f91bb79a701a7fd62`. Commit funcional final: `e68fd5019de137ab96534c067d85824103647a20`.
- Itens concluídos e publicados: PUB-0016/TI-CRB-003, PUB-0017/TI-CRB-004, PUB-0018/TI-SEG-005 e PUB-0019/TI-CRB-002.
- Arquivos/conteúdo: 63 arquivos no lote; 135 seções; 299.464 caracteres de teoria; 36 questões objetivas autorais; duas discursivas; quatro PNGs originais; sete vídeos; 54 fontes. Os 1.016 parágrafos dos documentos canônicos foram conferidos sem perda.
- Testes: `npm run queue`, lint, TypeScript, 51/51 testes, integridade do catálogo e build PWA aprovados. `npm run test:trail` não iniciou por ausência da distribuição local do Edge; não foi marcado como aprovado.
- Push: concluído no commit funcional acima. Build/deploy: GitHub Actions `37878264408` concluído com sucesso.
- Verificação publicada: `version.json` retornou commit `e68fd5019de137ab96534c067d85824103647a20`, builtAt `2026-10-09T03:13:47.397Z`. As quatro rotas públicas abriram com os títulos e as 135 seções; 36 IDs de questões autorais; sete vínculos de vídeo; duas discursivas na rota própria. Os quatro PNGs públicos retornaram HTTP 200 e SHA-256 idêntico aos originais do Drive.
- Controle editorial canônico atualizado e relido às 00:20 America/Sao_Paulo: FILA_PUBLICACAO!G17:M20 e MATRIZ_EDITAIS!J42:K42/J69:K71 agora registram `publicado`, commit, workflow e URL. A inspeção visual do Google Sheets ficou bloqueada por reconfirmação de identidade; valores, validações e wrap foram conferidos via API.
- URL verificada: https://andertrunks.github.io/central-estudos-concursos/ e rotas `#/biblioteca/TI-CRB-003`, `TI-CRB-004`, `TI-SEG-005`, `TI-CRB-002`; `#/discursivas` para QDISC-TI-CRB-002-001/002.
- Bloqueios preservados: reprodução integral dos vídeos não foi certificada; somente disponibilidade de links e metadados oEmbed. Questões anuladas, sem resposta válida ou sem caderno/gabarito definitivo continuam não pontuáveis.
- Próxima ação exata: reler FILA_PUBLICACAO a partir da linha 21, localizar o primeiro item com status editorial apto posterior a PUB-0019, conferir o documento canônico e a mídia, importar somente se completo e executar `npm run check` antes de novo commit.
