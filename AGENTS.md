# Central de Estudos — Concursos Contínuos

- Google Drive é a fonte editorial canônica. Não invente conteúdo, fontes, mídia, questões ou metadados de edital.
- Preserve os IDs e a biblioteca quando concursos forem encerrados.
- Nunca adicione backend pago, credenciais ou acesso do navegador ao Drive privado.
- Antes de alterar dados: leia `docs/DRIVE-WORKFLOW.md`, `editorial/source-policy.md` e `CHECKPOINT.md`.
- Execute `npm run check` antes de publicar. Referências quebradas e aulas incompletas bloqueiam publicação.
- Só atualize status de publicação no Drive após verificar o commit e a URL implantados.
- Dados do aluno ficam exclusivamente no IndexedDB; não os inclua em commits.
- Conteúdo real pertence a `content/` e `data/`; fixtures pertencem exclusivamente a testes.
