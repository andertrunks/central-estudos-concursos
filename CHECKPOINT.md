# Checkpoint técnico

- Última leitura do Drive: 2026-09-23; controle modificado em 2026-09-23T17:56:38.592Z.
- Snapshot: `editorial/snapshots/2026-09-23.csv`; detalhes em `editorial/last-sync.json`.
- Importado: 2 concursos, 77 referências permanentes, 10 semanas, 2 fontes de edital.
- Última aula importada: nenhuma. Pastas de aulas e fila de publicação vazias; planilha tem 7 itens a produzir.
- Último build local: 2026-09-23, integridade, TypeScript e geração PWA bem-sucedidos; 23 testes passaram, lint sem erros.
- Navegador: 9 rotas verificadas sem violações WCAG A/AA automatizadas, 390px sem overflow, IndexedDB persistente, reload offline e 0 chamadas ao Drive privado. Evidência: teste `tests/browser.e2e.ts`.
- Último deploy e commit publicado: consultar o artefato `deployment-checkpoint` da última execução bem-sucedida de `Validate and publish`. Ele é gerado após a publicação e contém commit exato, horário, URL e última sincronização. Confirmar o commit contra `https://andertrunks.github.io/central-estudos-concursos/version.json`.
- Repositório: `https://github.com/andertrunks/central-estudos-concursos`, branch `main`.
- Erros locais pendentes: nenhum identificado nas verificações realizadas. A primeira publicação será executada pelo workflow incluído neste commit.
- Pendências editoriais: requisitos e versão do edital ausentes; todas as aulas/mídias/questões/simulados/discursivas aguardam produção canônica.
- Retomada: conferir `git status`, rodar `npm run check`, testar navegador, consultar workflow de deploy. Não marcar fila como publicada sem conteúdo real e verificação remota.

O checkpoint de deploy é um artefato gerado, evitando um commit autorreferente. Para recuperar: `gh run download ID_DA_EXECUCAO -n deployment-checkpoint`. Os builds seguintes renovam esse registro automaticamente.
