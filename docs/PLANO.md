# Plano de materialização

Revisão: 14/10/2026. Requisitos confirmados e planejamento, com implementação inicial agora disponível. A exigência anterior de receber e aprovar um repertório fechado foi substituída por uso contínuo, sem cotas artificiais, com validação por solicitação. O estado executado está no [README](../README.md) e na [verificação real](VERIFICACAO-LIVE.json): FLAC de In Da Club obtido e validado no Windows; master e qualidade máxima global continuam não comprovados. As etapas e avaliações abaixo registram o planejamento, não certificam a implementação de todos os requisitos.

## 1. Requisitos confirmados pelo usuário

| ID | Requisito | Critério de aceite |
| --- | --- | --- |
| R01 | Windows e macOS | Instalação, obtenção e reprodução verificadas nos dois sistemas. |
| R02 | Solução gratuita | Sem compras de faixas ou contratação de serviços adicionais. A assinatura Duo existente do desenvolvedor é contexto informado, não uma licença presumida para o DJ. |
| R03 | Spotify como descoberta | O usuário identifica no Spotify as versões desejadas; outras fontes podem ser avaliadas. |
| R04 | Mesma gravação e mesmo master | Evidência que vincule o arquivo à versão escolhida; título, artista e ISRC isolados não comprovam o master. |
| R05 | Qualidade não negociável | Maior qualidade genuína do master, sem fonte com perdas, recodificação, reamostragem, normalização ou aumento artificial de resolução pelo produto. |
| R06 | Sem limite de downloads no aplicativo | Sem cota por dia, evento, lote ou tamanho de biblioteca. Concorrência controlada e pausas por condições externas não devem criar uma cota comercial ou artificial. |
| R07 | Faixas como prioridade | Obter faixas individuais; álbuns e playlists são funcionalidades desejadas. |
| R08 | Uso pessoal, cotidiano e experimental por um DJ amigo | Pedidos avulsos e novas descobertas podem ser feitos continuamente; não há dependência de um repertório predeterminado. |
| R09 | Listas vivas por evento | Adicionar, remover e obter novas faixas conforme o uso; não solicitar lista completa como condição de desenvolvimento ou aceite. |
| R10 | Preferência por FLAC e WAV | Obter e preservar arquivo sem perdas nesses formatos, validando o conteúdo efetivo. Não exige duplicar cada faixa nos dois formatos nem autoriza transformação do áudio para produzi-los. |
| R11 | Avaliação de qualquer origem e de métodos não oficiais | Julgar o arquivo e o mecanismo efetivo; não excluir uma empresa apenas pelo nome. A intenção é atender qualquer música e gênero escolhidos ao longo do uso. |
| R12 | Privacidade e segurança | Minimizar coleta de dados, proteger credenciais e mapear serviços contatados. Não declarar anonimato, ausência de rastreamento ou de implicações legais sem fundamento. |

Uso pessoal da ferramenta está confirmado. Isso descreve seu público e finalidade; a informação não é uma alegação de que todos os arquivos ou fontes estejam automaticamente licenciados. As verificações das fontes e da preservação do áudio continuam aplicáveis por solicitação.

O usuário autorizou incluir downloads não oficiais no escopo e reconheceu que há riscos, solicitando meios de reduzir exposição e rastreamento. A aprovação de escopo é uma decisão do usuário, não autorização de um titular de direitos. Após a instrução de criar a solução, houve implementação, instalação do FFmpeg e download real, sem autenticação em contas pessoais. A proteção local implementada não transforma redução de exposição em promessa de ausência de risco jurídico.

## 2. Resultado da avaliação até agora

Não foi comprovado operacionalmente um fluxo reutilizável que reúna gratuidade, qualidade máxima, mesmo master, condições de uso adequadas e funcionamento nos dois sistemas. Essa pendência se refere à obtenção e validação, não à ausência de uma lista completa de músicas.

Há três caminhos de investigação, sem seleção definitiva:

1. **Fontes liberadas pelo titular:** downloads gratuitos no Bandcamp, originais disponibilizados no SoundCloud e arquivos fornecidos diretamente pelo artista ou pela gravadora. Disponibilidade, formato, legitimidade da liberação e master devem ser examinados em cada solicitação. A existência dessas vias não demonstra disponibilidade para qualquer música que venha a ser escolhida.
2. **Obtenção direta não oficial do Spotify:** Votify é candidato documental, com suporte declarado a FLAC nativo. Os riscos contratuais, as proteções técnicas, a conta exigida, a compatibilidade com macOS e a obtenção por faixa permanecem sem validação operacional. Sua existência não comprova que a operação pretendida seja autorizada.
3. **Obtenção não oficial de outras fontes:** SpotiFLAC volta a ser candidato concreto, pois o usuário flexibilizou a origem e incluiu métodos não oficiais. Ele declara FLAC de outros catálogos via APIs de terceiros. Formato nativo, edição, master, funcionamento, dependências, destinatários dos dados e condições de uso devem ser examinados. A leitura de quatro arquivos do backend não constitui auditoria completa de segurança nem teste de download.

Compras em lojas e assinaturas adicionais não atendem R02. Nenhuma empresa é excluída por preferência de origem. O áudio AAC/Opus documentado para o streaming usual do YouTube Music tem perdas e não comprova o requisito previamente confirmado de áudio sem perdas; convertê-lo para FLAC/WAV não o torna equivalente ao original. Outro mecanismo ou arquivo obtido de qualquer fonte deve ser avaliado pela sua qualidade efetiva. Importação manual pode auxiliar a investigação, mas não foi aprovada como substituição do produto de obtenção de músicas.

A faixa enviada pelo usuário está identificada e registrada em [EXEMPLO-IN-DA-CLUB.md](EXEMPLO-IN-DA-CLUB.md). Esse exemplo orienta a investigação, sem estabelecer um catálogo fechado ou aprovação antecipada de um arquivo.

Consultar [as fontes e suas limitações](FONTES.md). A descrição de downloads gratuitos não constitui prova de licenciamento para apresentações públicas ou remuneradas.

## 3. Verificação de cada música

Cada faixa deverá registrar:

- URL de referência escolhida pelo usuário; artista, título, versão e lançamento.
- Identificadores disponíveis, duração e responsável pela distribuição.
- Fonte candidata, URL de obtenção e formato efetivamente disponibilizado.
- Evidência da liberação e do uso permitido; custos adicionais, se houver.
- Resolução original disponível e justificativa da versão selecionada.
- Evidência de correspondência da gravação e do master.
- Estado técnico, falhas e validação dos arquivos em Windows e macOS.

O modelo está em [SOLICITACOES.md](SOLICITACOES.md). Exemplos representativos podem orientar o piloto, sem exigir uma lista completa do DJ. A validação do produto deve comprovar que o fluxo aceita novas solicitações e mantém os critérios por faixa, inclusive quando uma fonte falha.

### Prova de master e qualidade

Metadados servem para encontrar candidatos e detectar divergências. A confirmação do master exige referência confiável ou evidência documental rastreável do responsável pela distribuição; a força da evidência deve ser registrada. Declaração documental e comparação digital são modalidades distintas, com limites explícitos.

Quando houver arquivos de referência legitimamente obtidos e com parâmetros compatíveis, a igualdade das amostras de áudio pode comprovar igualdade digital. Taxas de amostragem diferentes não devem ser convertidas para fabricar uma alegação de identidade. Ter o mesmo master não significa necessariamente ter o mesmo arquivo ou a mesma resolução de distribuição.

Validar um FLAC comprova sua estrutura e integridade, não demonstra que nunca houve perdas na cadeia anterior. Espectrogramas ou indicadores automáticos podem revelar problemas; não certificam a origem nem o master. A alegação de maior qualidade depende da origem e das versões disponíveis, não apenas de números maiores no cabeçalho.

## 4. Marcos e entregas

| Marco | Trabalho e entrega | Condição de avanço |
| --- | --- | --- |
| M0 — Planejamento | Consolidar requisitos, evidências, riscos e perguntas. | Documentação coerente com as decisões do usuário. |
| M1 — Fluxo e casos de uso | Definir pedidos avulsos, álbuns, listas vivas e casos representativos de investigação para obter FLAC/WAV. | Critérios de validação reproduzíveis; nenhuma lista completa ou informação de equipamento é exigida. |
| M2 — Avaliação de fontes | Investigar meios oficiais e não oficiais reutilizáveis de identificar, obter e comprovar as versões, registrando custo, riscos, qualidade e serviços envolvidos. | Caminho candidato documentado e limitações explícitas para cada fonte. |
| M3 — Plano de piloto | Fixar versões de ferramentas, dependências e método de prova. Preparar execução concreta e revisar seus riscos. | Piloto viável nas condições acordadas e autorizado antes de instalar/autenticar/executar. |
| M4 — Piloto | Verificar origem, resolução, preservação do áudio e compatibilidade em Windows e macOS. Incluir novos pedidos, alteração de lista, repetição e retomada. | Casos previstos aprovados; cada arquivo concluído atende aos critérios. O piloto não garante disponibilidade de qualquer faixa futura. |
| M5 — Arquitetura | Escolher entre adotar solução existente, adaptar motor comprovado ou construir lacunas. | Motor e fontes comprovados; stack compatível com as dependências e com Windows/macOS. |
| M6 — Aplicativo | Implementar o caminho de obtenção de FLAC/WAV selecionado após sua avaliação, fila persistente, retomada, validação e listas vivas, sem cotas artificiais. | Fluxo completo preserva áudio, explicita limitações e resolve falhas sem reduzir qualidade ou encerrar arbitrariamente a fila. |
| M7 — Entrega | Empacotar e verificar nos dois sistemas; fornecer instruções e evidências da obtenção/qualidade por faixa. | Condições do produto atendidas e aceitação do usuário/DJ. |
| M8 — Continuidade | Processar novos pedidos e revalidar mudanças de fonte e versões de software. | Qualidade verificada continuamente por faixa; listas podem mudar sem nova aprovação global. |

Nenhuma data de conclusão é estimada antes de M1–M3: fonte, direitos, master e compatibilidade Windows/macOS são dependências reais. O custo monetário adicional aceitável é zero. Custos de assinatura, API, serviço, ferramenta ou distribuição encontrados deverão ser registrados como incompatibilidades até novo direcionamento.

## 5. Arquitetura candidata, condicionada à viabilidade

Componentes propostos:

1. **Referências das solicitações:** itens escolhidos continuamente pelo usuário, avulsos ou em listas opcionais. A integração automática com a API do Spotify precisa de avaliação contratual; guardar referências fornecidas pelo usuário não aprova automaticamente coleta ou uso de conteúdo da plataforma.
2. **Avaliação de fontes:** conectores independentes, cada qual com capacidades, direitos e custos verificados. Um botão oficial de download não implica permissão de automação via API.
3. **Motor de obtenção:** transmite o arquivo disponibilizado, sem transformação do áudio. Falha de obtenção deve ser visível, sem usar outra versão silenciosamente.
4. **Preservação e validação:** manter o arquivo recebido; informações adicionadas pelo produto ficam separadas. Verificação de integridade antes da conclusão.
5. **Biblioteca local e fila:** estado por faixa, retomada, duplicatas e histórico das solicitações. A fila aceita novos itens durante o uso e persiste após reinício. Listas por evento são agrupamentos editáveis, não limites de acesso. Condições externas, como espaço disponível e respostas do provedor, exigem pausa/retomada e motivo visível, preservando os demais pedidos.
6. **Saída em arquivos:** FLAC/WAV preservados na pasta escolhida pelo usuário, com validação de integridade e leitura nos dois sistemas. Integração específica com software ou equipamento de DJ não é requisito atual.
7. **Privacidade local:** biblioteca, histórico e processamento no dispositivo; telemetria própria desativada por padrão; logs de diagnóstico opcionais, com retenção controlável e sem tokens ou credenciais. Registrar quais serviços remotos recebem consultas ou arquivos. Essas medidas protegem dados locais e reduzem coleta pelo produto; não controlam registros de provedores, contas de streaming ou infraestrutura externa e não garantem ocultação.

Essa arquitetura não afirma que já existem conectores autorizados ou que uma aplicação com ambos os catálogos cumpre os termos. A pesquisa pode levar à decisão de adotar uma solução existente ou de não iniciar implementação.

## 6. Validação futura

Casos essenciais: master diferente com mesmo ISRC; radio edit versus extended mix; fonte com perdas salva em FLAC; versão inferior enquanto a máxima existe; indisponibilidade territorial; download truncado; retomada que altera bytes; duplicata de outra edição; sessão expirada; espaço insuficiente; FLAC/WAV inválido ou ilegível; adição de pedidos durante execução; inclusão/remoção de faixas em listas; reinício com fila persistida; processamento de sucessivos lotes sem cota acumulada.

Para cada caso, verificar que o produto não declara atendimento aos requisitos indevidamente. Uma faixa pendente ou com falha permanece identificada individualmente; não bloqueia outros pedidos conformes nem exige aprovar uma lista inteira. Uma falha tampouco autoriza substituir a faixa por outra gravação, master ou qualidade inferior. Isso não equivale a uma garantia já comprovada de obtenção de qualquer música.

## 7. Pendências humanas e próximos responsáveis

| Pendência | Responsável | Impacto |
| --- | --- | --- |
| Exemplos adicionais, se úteis em uma etapa concreta | Usuário e DJ | Primeiro exemplo já recebido: In Da Club, de 50 Cent. Nenhuma lista completa é necessária. |
| Condições de uso de uma fonte ou arquivo quando forem relevantes | Avaliação conjunta no caso concreto | Uso pessoal da ferramenta está confirmado; não presumir licenças de conteúdo. |
| Quem obterá os arquivos e quais contas/licenças já possui | Usuário e DJ | Não presumir que a assinatura do desenvolvedor se transfira ao DJ. |
| Evidência aceitável para confirmar o master em cada fonte | Avaliação conjunta após examinar exemplos | Evitar uma certificação baseada apenas em metadados. |

Próxima ação técnica: usar o caso In Da Club para detalhar a avaliação de SpotiFLAC e Votify e preparar um piloto do fluxo contínuo para FLAC/WAV, com critérios por faixa e nenhuma dependência de lista fechada, equipamento ou software do DJ. As informações disponíveis bastam para continuar essa avaliação; eventuais dados de conta só serão solicitados se forem necessários a uma etapa concreta. A intenção de obter qualquer música está registrada, mas sua realização operacional não foi comprovada.
