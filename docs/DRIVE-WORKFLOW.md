# Drive → Work → GitHub → site

## Fonte e leitura autorizada

Raiz: `14PtFWpLLObW6o9BURx-s6a7HXjd0-ZUz`.
Controle: `16imlpMUefeINcv_GX6YGFzMT9xD5shSgZQ7p9CoOQFM`.
Fila: `1sGY6LGMmQPk6CCgzcrHG2kRVXb3yRoOw`.
Padrão de fontes: `1xDyiZAFwH_8IOmmtw0sL7XWuZReEsMTnV4kNXXwntfY`.

O agente Work lê o Drive pelo conector autenticado. Nenhum token é salvo no projeto, nos dados ou no navegador. O CI publica o snapshot já revisado; não lê o Drive. O processo é acionado por uma execução do Work, não por um serviço pago ou monitor implícito.

## Sincronizar controle

1. Ler checkpoint e status Git. Atualizar checkout sem descartar mudanças locais.
2. Ler o padrão de fontes e a planilha central completa. Confirmar as abas pelo cabeçalho, sem confiar apenas em posição. O fetch atual retorna CSVs separados por form-feed (`\f`). Salvar a resposta textual como snapshot em `editorial/snapshots/AAAA-MM-DD.csv`.
3. Conferir lista de pastas e fila (paginação se ultrapassar o limite do conector). Não considerar a matriz “publicado” prova suficiente sem aula e mídia correspondentes.
4. `npm run sync -- editorial/snapshots/AAAA-MM-DD.csv` faz prévia e valida. `--apply` grava os dados derivados. `--initial` é exclusivamente para a primeira importação; não usar para contornar remoções.
5. Revisar diff. A importação bloqueia remoção de concursos e IDs existentes. Para encerrar, altere o status no Drive. O histórico de datas e status é preservado.

## Cadastrar um concurso normal

Adicionar linha a CONCURSOS e coluna de cobertura na MATRIZ_EDITAIS. Atualizar `editorial/contest-columns.json` com o nome da coluna e ID. São alterações de dados/configuração, sem código estrutural. A coluna “Tipo questão” é recomendada (`certo/errado` ou `múltipla escolha`); na ausência, o importador reconhece essas expressões em Observações. Requisitos e Versão edital podem ser acrescentados como colunas. Valores ausentes permanecem explicitamente desconhecidos.

Atualizar ciclo e política em Drive e sincronizar. O ciclo legado contém períodos sem ano e rótulo “SETEC exclusiva”; o adaptador usa o ano de `data_referencia` no ESTADO_ATUAL, nunca o ano da execução. Para ciclos futuros, as colunas `Data início`, `Data fim` e `Conteúdo secundário` permitem datas completas e rótulos genéricos. Uma virada de ano sem datas completas é rejeitada. A distribuição aceita a chave genérica `distribuicao_ciclo`, preservando o texto canônico; a atual usa `distribuicao_ate_CRBio`. As relações da biblioteca não dependem desses rótulos.

## Integrar uma aula da fila

O Drive deve conter documento revisado e imagens, com ID da matriz. O Work lê o documento e converte sua estrutura em um pacote JSON local em `work/`, acompanhado de `media/...`. O script não inventa teoria nem converte prosa arbitrária automaticamente; o agente é responsável por preservar a estrutura editorial.

O pacote usa `packageSchema` de `scripts/queue.ts`:

- `queueId`, `driveDocumentId`, `status: "pronto para publicação"`;
- `lesson`: contrato completo `lessonSchema`, incluindo objetivos, teoria, exemplos, pegadinhas, resumo, revisão, concursos, fontes, mídia, questões e data;
- `media`: cadastro de imagem original com arquivo relativo, título, legenda, alt e verificação; vídeos com URL, título, canal, descrição e data de verificação;
- `questions`: itens validados com alternativas, gabarito, comentário, fontes e IDs.
- `discursives` (opcional): propostas com ID estável, concurso, instruções e resposta-modelo recolhida.
- `lesson.sections` e `lesson.materials` (opcionais): subtemas e cadernos integrais com IDs próprios dentro da aula. Não duplicam a aula por concurso.

O Work confere vídeos e fontes antes de preencher `verifiedAt`. A validação técnica confirma formato e relacionamentos; não certifica a correção factual nem a disponibilidade futura de um link. Exceções editoriais devem ser justificadas em `lesson.exception`, vindas da fonte canônica.

`npm run queue -- work/pacote.json` valida sem modificar. `--apply` copia mídia, integra aula/questões, atualiza matriz e cria recibo. O pacote deve conter fontes já cadastradas. Toda referência quebrada bloqueia a integração. Imagens só podem usar caminhos locais seguros sob `media/`.

## Validar, publicar e dar baixa

1. Executar `npm run check` e verificar a interface no navegador. Verificar mídia, legendas, teclado, offline e feedback das questões quando houver novos conteúdos.
2. Commit pequeno com IDs publicados; push em `main` após a revisão. O workflow repete as verificações e publica o artefato.
3. Aguardar GitHub Actions; abrir URL publicada e conferir o conteúdo e commit. Nunca marcar sucesso só porque o push terminou.
4. Atualizar recibo com commit/URL/horário e checkpoint. Só então atualizar Status Work da linha correspondente no Drive e mover/registrar o item em 09_PUBLICADO conforme o fluxo editorial. Se não houver item pronto, não alterar a fila.
5. Se o deploy falhar, manter “integrado; aguardando testes e deploy”, registrar erro e corrigir incrementalmente. Retomadas usam ID da fila/conteúdo; os merges são idempotentes por ID.

As alterações remotas da fila são feitas pelo conector do Work, nunca pelo site. A baixa exige verificação do resultado publicado; não é uma chamada automática cega embutida no importador.

## Primeiro pacote real: SQL

`editorial/sql-import.json` registra IDs dos documentos e hashes dos textos lidos. A planilha tinha PUB-0001 pronto para validação, embora a pasta física 08 estivesse vazia; o documento foi localizado pelo ID na biblioteca canônica. A integração preserva os 28 subtemas e os cadernos integrais. As questões com IDs CE/MC/INDEPAC/QUADRIX-AUTORAL foram extraídas apenas quando enunciado, alternativas, gabarito e comentário estavam completos: 252 itens. Os 36 itens AN permanecem no caderno, com resposta esperada, sem correção automática. As nove propostas discursivas usam IDs técnicos determinísticos `D-TI-BD-003-27-NN`, derivados da seção canônica, e mantêm instrução e espelho separados. Fontes do banco são herdadas da relação declarada no documento; não se afirma que cada fonte sustenta individualmente toda questão.

O estado editorial `produzido` significa `em produção` no catálogo até que o pacote passe pela validação. As novas abas de cobertura, referências de bancas e auditoria são preservadas em `editorial/`, sem substituir silenciosamente os snapshots antigos.

## Metadados para a trilha

Preservar os IDs e a ordem pedagógica das seções. `question.origin` distingue `real` de `inédita`; questões reais exigem `provenance` com órgão, prova, ano, cargo e URL verificável. Campos ausentes continuam desconhecidos; não preencher por inferência. `question.unitIds` relaciona os subtemas que devem ser estudados antes da questão. Em SQL, 112 relações foram derivadas de cabeçalhos explícitos do documento original; as 140 questões sem esse vínculo ficam cumulativas. Não perder esses vínculos ao reimportar um pacote.

Uma seção pode declarar `materialIds` para materiais da própria aula e `includeReview` para a revisão dedicada. São referências ao conteúdo existente, sem cópias textuais ou aulas duplicadas. A validação bloqueia subtemas ou materiais inexistentes. Consultar `docs/TRILHA-DE-ESTUDOS.md` para a persistência do aluno e as regras de prioridade.
