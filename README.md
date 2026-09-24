# Central de Estudos — Concursos Contínuos

Plataforma permanente para estudar concursos públicos. Biblioteca compartilhada por ID, dados editoriais versionados e progresso local. V1 inicial: CRBio-01 e SETEC.

## Desenvolvimento

Node 22.12+ e npm. `npm ci`, `npm run dev`. Verificação completa: `npm run check`. A pasta `dist/` é o artefato publicável; `npm run preview` permite inspecioná-lo.

## Arquitetura

- React + TypeScript estrito + Vite; rotas hash para funcionar em subdiretórios do GitHub Pages sem servidor de rotas.
- `src/types/schema.ts`: contratos Zod e tipos derivados, usados no navegador e na validação editorial.
- `src/services/`: integridade, prioridade, IndexedDB e carregamento do catálogo.
- `src/pages/` e `src/components/`: interface e fluxos de estudo, sem conteúdo editorial embutido.
- `data/`: concursos, matriz, ciclo, fontes, mídia e política de estudo.
- `content/`: aulas, questões, simulados e discursivas, um JSON por ID.
- `public/media/`: imagens próprias disponibilizadas offline.
- `editorial/`: snapshot, política canônica, configuração de importação e recibos.
- `scripts/`: transformação, validação e integração de pacotes editoriais.
- `tests/`: fixtures artificiais isoladas e testes de regras/persistência.

A relação concurso–conteúdo é muitos-para-muitos. A matriz conserva cobertura integral/parcial por concurso, prioridade, fase e estado editorial. Título nunca é chave. As 77 referências iniciais foram importadas da matriz do Drive. SQL (TI-BD-003) possui 28 subtemas, 252 questões objetivas interativas, 36 exercícios abertos no caderno integral, nove propostas discursivas autorais, duas imagens e três vídeos. Os demais assuntos permanecem planejados.

## Persistência e revisão

IndexedDB versionado (`central-estudos`, versão 1), stores `progress`, `reviews`, `attempts`, `writings`, `results`. Conclusão cria D0/D1/D7/D21 sem duplicar. Erro registra motivo e agenda revisão em dois dias. A página Dados e privacidade exporta/restaura backup validado. Não existe sincronização do progresso entre dispositivos ou contas.

## Concursos e prioridade

A data de negócio usa `America/Sao_Paulo`. O dia da prova continua ativo; no dia seguinte passa a “prova realizada”, exceto adiamento/suspensão. Estados administrativos encerrado/arquivado são respeitados; a fonte não é reescrita pelo navegador. Retificações registram valores anterior/novo no histórico da sincronização.

O foco é a próxima prova ativa com data válida, sem suspensão/adiamento. O score combina faixa de foco, prioridade editorial, peso configurável da disciplina, número de concursos, proximidade, proporção de erros, revisões pendentes, não iniciado e inclusão na semana do ciclo. Desempate por ID. A V1 aproxima 90/10 por blocos de dez conteúdos concluídos, com fallback se não houver aula disponível; não estima horas nem promete uma distribuição exata de esforço. Depois da prova do CRBio, a SETEC assume automaticamente. Novos concursos entram por dados.

## Offline e atualização

Manifest com ícones 192/512, service worker gerado por `vite-plugin-pwa` e cache versionado dos recursos. O shell e o catálogo publicado são pré-carregados; imagens locais entram no precache. Vídeos e editais externos requerem conexão. Uma nova versão aguarda confirmação na interface antes de recarregar, para não interromper textos em edição. O progresso fica fora do cache de publicação.

## Publicação

GitHub Actions executa lint, typecheck, testes, validação e build antes do GitHub Pages. Após o deploy, grava um artefato `deployment-checkpoint` com commit, horário e sincronização. O site expõe `version.json` para confirmação independente da versão. Consulte [fluxo editorial](docs/DRIVE-WORKFLOW.md), [checkpoint](CHECKPOINT.md) e [limites da V1](docs/V1.md).

Referências de implementação: [Vite / GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages), [Vite PWA / atualização](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html).
