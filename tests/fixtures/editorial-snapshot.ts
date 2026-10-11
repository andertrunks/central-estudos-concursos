export const fixtureSnapshot = `ID_TÓPICO,Disciplina,Assunto,Subassunto / escopo,CRBio,SETEC,Cobertura,Prioridade inicial,Status editorial,Fase,Observação
TI-BD-003,Tecnologia da Informação,SQL,Consultas e manipulação,Sim,Sim,Comum,1,produzido,Fase 1,Fixture sintética
PORT-007,Língua Portuguesa,Concordância,Concordância verbal e nominal,Sim,Sim,Comum,2,parcial,Fase 1,Fixture sintética
\fID_CONCURSO,Órgão,Cargo,Banca,Local,Inscrição início,Inscrição fim,Data da prova,Status,Requisitos,Vagas,Salário base,Benefícios principais,Jornada,Estrutura objetiva,Discursiva,Edital oficial,Versão edital,Observações,Tipo questão
CRBIO01-2026-ATI,Órgão Sintético A,Analista de TI,Banca Teste,São Paulo/SP,01/09/2026,30/09/2026,29/11/2026,inscrições abertas,Nível superior,1,1000,Nenhum informado,40h,40 itens,Não,https://example.org/crbio-edital,1,Fixture sem dados reais,certo/errado
SETEC-2026-ATI,Órgão Sintético B,Analista Técnico,Banca Teste,Campinas/SP,01/09/2026,30/09/2026,17/01/2027,inscrições abertas,Nível superior,1,1000,Nenhum informado,40h,40 itens,Não,https://example.org/setec-edital,1,Fixture sem dados reais,múltipla escolha
\fID_FONTE,Título,Nível,Instituição / Autor,URL / arquivo Drive,Versão / data publicação,Data verificação,Status
SRC-TEST-001,Fonte sintética,P1,Instituição de Teste,https://example.org/fonte,2026-01-01,23/09/2026,ativo
\fChave,Valor
data_referencia,23/09/2026
distribuicao_ciclo,70% CRBio / 30% SETEC
concurso_foco_1,CRBIO01-2026-ATI
concurso_foco_2,SETEC-2026-ATI
\fSemana,Período,Data início,Data fim,Foco principal,Conteúdos / IDs,Português / Matemática / Inglês,Questões,Revisão,Discursiva,Simulado,Conteúdo secundário,SETEC exclusiva,Meta da semana
1,23/09–29/09,23/09/2026,29/09/2026,Fundamentos,TI-BD-003,PORT-007,10 questões,D0,Não,Não,Nenhum,Nenhum,Concluir a semana
`;
