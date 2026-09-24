# Auditoria anterior à evolução da trilha

Base: `cce7e5e`. Repositório existente preservado, React 19, TypeScript estrito, Vite, React Router com hash, PWA, IndexedDB/idb e validação Zod. Nenhuma nova dependência.

Foram examinados o aplicativo, páginas, componentes compartilhados, contratos, persistência, prioridades, integridade, importação, fila, configuração de build/deploy e testes. Rotas anteriores: início, concursos/detalhes, biblioteca/aula, questões, revisões, erros, simulados, discursivas, ciclo e dados. O catálogo era carregado integralmente; a prioridade escolhia assuntos, sem sessão ou progresso por subtema. A leitura era um bloco textual; questões avulsas perdiam seu feedback visual no remount apesar de a tentativa estar salva. A conclusão de uma aula podia representar as 28 seções de uma vez.

## Fontes examinadas

Controle Drive `16imlpMUefeINcv_GX6YGFzMT9xD5shSgZQ7p9CoOQFM`, guia de fontes `1xDyiZAFwH_8IOmmtw0sL7XWuZReEsMTnV4kNXXwntfY`, matriz, ciclo, cobertura e auditoria de subtemas. Snapshot desta leitura: `editorial/snapshots/2026-09-24-trail-audit.csv`. As pastas de editais no Drive estavam vazias; os PDFs oficiais vinculados no controle foram baixados diretamente dos endereços oficiais para conferência. Nenhum dado de prova foi alterado.

CRBio, seção 18.2.5.2, item 4.3: consulta e manipulação SQL. SETEC, Anexo II, nível superior, Analista Técnico (Informática): Linguagem SQL. Também foram confrontados os blocos de Português, Matemática/Raciocínio, Inglês aplicável ao CRBio, Legislação e os demais específicos. SQL não cobre sozinho modelagem/normalização, administração de SGBDs nem as outras disciplinas. As datas e estruturas permanecem as do catálogo canônico.

## Cobertura publicada

Dois concursos, 77 referências, uma aula SQL com 28 seções, 252 questões objetivas autorais, 36 exercícios abertos no caderno, nove propostas discursivas, duas imagens e três vídeos. Zero simulados publicados. Outros materiais em produção/validação no Drive não foram considerados publicados só por estarem na planilha.

`editorial/study-coverage-audit.json` registra os 77 assuntos com disciplina, assunto, subassunto, concursos, classificação e motivo; também registra as 28 seções SQL, escopo, evidências, limitações e hashes da base examinada. A classificação não deriva da contagem de palavras nem de uma página existir.

- 76 assuntos: **ausentes no site**. Não significa ausência no Drive.
- SQL, teoria dos subtemas 01–25: **adequada** ao escopo identificado, com explicações, exemplos progressivos, interpretação de consultas e armadilhas de dialeto/NULL/cardinalidade.
- SQL, integração global: **parcial**, porque o banco interativo é autoral e a rastreabilidade individual de fontes ainda é ampla. Cadernos contêm referências reais, que não substituem automaticamente itens completos e verificáveis.
- Seções 26–28 isoladas: **parciais**; são orientação/auditoria/fechamento e dependem de cadernos e revisão dedicados. A evolução liga esses materiais à etapa para evitar estudar apenas a introdução.
- Nenhuma seção foi certificada como **completa**. Não há conclusão baseada apenas em comprimento, nem promessa de revisão factual de cada afirmação e gabarito. A classificação **superficial** fica disponível, mas não foi atribuída aos subtemas teóricos SQL examinados.

Encontrada contagem histórica de 63 referências reais em SQL-26, enquanto a auditoria corretiva final registra 59. Correção editorial deve começar no Drive; não foi feita substituição silenciosa no texto publicado. Identificação autoral preservada nos 252 itens. A preferência por provas reais fica expressa no contrato/motor, com lacuna de integração registrada.

## Decisões e limites

Evolução incremental: nova rota de atividade, motor puro, loja adicional no IndexedDB e CTAs de continuidade. Sem nova biblioteca, duplicação por concurso, backend, cobrança ou acesso privado ao Drive pelo navegador. Identidade visual preservada.

O roteiro real disponível começa por SQL, porque a variedade de disciplinas depende de publicar os outros pacotes. Não simular alternância Português/Redes sem material validado. A referência visual de Rincão não foi acessada; o fluxo segue o comportamento descrito pelo usuário.

O pacote inicial já era grande por carregar a biblioteca integralmente. Esta entrega conserva a estratégia e os limites de cache. Antes de ampliar muito o catálogo, planejar carregamento por aula. Não aumentar silenciosamente o limite de cache ou ocultar alertas de build.
