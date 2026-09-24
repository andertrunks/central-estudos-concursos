# Trilha pessoal de estudos

A página inicial recomenda uma atividade única considerando todos os concursos ativos. O aluno abre, estuda, conclui e continua. Concursos, biblioteca, questões avulsas, revisões, erros, simulados, discursivas, ciclo e backup continuam disponíveis.

## Dados e sequência

`src/services/trail.ts` é uma função determinística, independente de React e de rede. Recebe catálogo, histórico e dia em São Paulo. A ordem de `lesson.sections` define os pré-requisitos internos; IDs existentes são preservados. Aulas sem seções continuam funcionando como uma etapa. Nunca se cria uma cópia por concurso.

O motor oferece apenas material publicado relacionado a concurso ativo. Mantém as exceções administrativas de suspensão/adiamento e recalcula o foco quando a prova passa. Uma atividade iniciada mantém ID, questões e posição ao recarregar; se todos seus concursos expirarem, deixa de prender a trilha ativa, sem apagar o histórico.

A base reutiliza a política editorial do ciclo, prioridade, proximidade, compartilhamento, desempenho e revisões. Acrescenta tempo sem contato, fração ainda não estudada e variação de assunto. A cada dez etapas teóricas, a distribuição canônica atual reserva nove ao foco/núcleo comum e uma ao secundário, quando houver material disponível. Isso é uma aproximação por etapas, não medição de horas e não peso oficial da prova. Os pesos de disciplina ausentes permanecem neutros.

Revisões vencidas recebem acréscimo 1.600, prática elegível 1.200, faixa do ciclo 1.000, discursivas 500. Atraso acrescenta até 300; intervalo sem contato até 60; cobertura não estudada até 30. Duas atividades consecutivas do mesmo tipo dão lugar a outro tipo disponível. Desempate usa ID estável. Essas constantes organizam estudo, não representam dados de edital.

Cada etapa concluída gera D0/D1/D7/D21 com o ID da seção e relação ao conteúdo pai. Revisões vencidas do mesmo conteúdo/subtema são agrupadas; datas futuras permanecem pendentes. Erros geram revisão em dois dias e influenciam a prioridade. Reforço mostra enunciado, resposta e explicação do erro; concluir esse reforço resolve os registros associados, sem declarar toda a teoria concluída.

Questões são oferecidas em blocos de até cinco. `question.unitIds` é extraído de relacionamento explícito no documento canônico, nunca por adivinhação do título. Todos os subtemas vinculados devem ter sido estudados. Questões sem esse dado ficam na prática cumulativa após a teoria completa. Questões reais com procedência estruturada são priorizadas antes de inéditas. O banco interativo atual contém 252 inéditas; referências reais continuam nos cadernos e precisam de integração própria para virar itens interativos. Não se inventa enunciado, alternativa, gabarito, ano ou procedência.

Discursivas e simulados entram quando a base teórica relacionada estiver concluída e existe material publicado. O simulado atual permanece vazio. A primeira versão não conserva respostas de um simulado em andamento após fechar a página; conserva o resultado final, como anteriormente.

## Persistência e compatibilidade

IndexedDB `central-estudos` passa de versão 1 para 2, acrescentando somente `activities`. As cinco lojas anteriores e seus registros permanecem. Atividades usam IDs compostos de tipo e IDs permanentes, nunca títulos. Cada registro guarda sequência, início, conclusão, subtema e o bloco de questões escolhido.

O percentual do conteúdo pai é a fração de etapas teóricas concluídas; os dois concursos consultam esse mesmo registro. Percentual anterior é preservado até o novo cálculo alcançá-lo. Uma conclusão integral legada continua valendo para todas as etapas. Revisões não concedem conclusão de teoria ainda não estudada.

Conclusão, progresso e agendamento são transacionais. Clique repetido não duplica conclusão; resposta usa atividade + questão para não duplicar tentativa ao retomar. O backup JSON versão 1 recebe campo opcional `activities`; backups antigos continuam aceitos e os novos conservam a trilha. Guardar backups novos com a versão atual do site: versões antigas não conhecem esse campo.

Login/sincronização em nuvem não faz parte desta entrega. Rascunhos anteriores estão preservados localmente em `work/account-sync-deferred/`; nenhuma dependência ou serviço externo foi ativado.

## Publicação editorial

Mantém-se Drive → Work → dados versionados → validação → GitHub Pages. A mudança de navegação não publica outros itens da fila. O snapshot consultado e a auditoria derivada estão em `editorial/`. Os cabeçalhos do banco original fundamentam 112 vínculos de questões; 140 itens permanecem cumulativos. Seções de encerramento apontam para os cadernos/revisão já existentes, sem duplicar texto.

Novos conteúdos normais entram pelos contratos existentes. Publicar seções em ordem pedagógica, conservar IDs e declarar os vínculos de questões quando conhecidos. `materialIds` liga uma seção a materiais existentes; `includeReview` expõe a revisão completa na etapa correspondente. A validação rejeita referências inexistentes. Esses campos devem acompanhar os próximos pacotes editoriais.

## Verificação

`npm run check`: lint, TypeScript estrito, testes de domínio/persistência/migração/integridade e build PWA. `tests/trail.e2e.ts` verifica a aceitação principal no Edge: aula compartilhada, conclusão, D0, questão errada, reload, próxima etapa, backup, celular, acessibilidade e retomada offline. `tests/browser.e2e.ts` mantém a regressão das funcionalidades anteriores. Fixtures existem somente em testes.
