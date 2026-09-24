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
