# Evidências e avaliação de fontes

Consulta documental: 14/10/2026. Leitura de documentação e, na pesquisa anterior desta conversa, de código público. Nenhuma conta autenticada, instalação, música baixada ou teste funcional. Interpretação atualizada para uso contínuo, pessoal e experimental, com listas vivas e sem cotas artificiais. A pesquisa das fontes não depende de receber uma lista completa do DJ.

## Matriz de candidatas

| Fonte | Obtenção gratuita documentada | Qualidade e master | Limite para o objetivo |
| --- | --- | --- | --- |
| Bandcamp | Lançamentos gratuitos ou com preço mínimo zero, conforme liberação do artista. | Downloads sem perdas disponíveis; master deve ser verificado por faixa. | Disponibilidade depende do lançamento e pode mudar. Não comprova obtenção de qualquer solicitação futura. |
| SoundCloud | Download oficial quando habilitado pelo autor. | Entrega o original enviado, que pode ser com ou sem perdas. | O original do upload pode divergir do Spotify. Automação pela API não aprovada. |
| Fornecimento direto pelo titular | Possível quando artista/gravadora libera o arquivo sem cobrança. | Depende da entrega e de prova da versão. | É hipótese a verificar com fontes reais, não uma disponibilidade comprovada. |
| Free Music Archive | Conteúdo com licenças abertas, sujeito às condições de cada faixa. | Formato, qualidade e master dependem da faixa. | Não há prova de correspondência para pedidos futuros. |
| Votify/Spotify | Código disponibilizado; Lossless exige Premium segundo o projeto. | Declara FLAC nativo; origem e preservação têm evidência em código previamente consultado. | Não oficial; direitos, conta, funcionamento, macOS e atendimento de novas solicitações não comprovados. |
| SpotiFLAC | Declara operação sem conta ou assinatura por APIs de terceiros. | Declara FLAC de Tidal, Qobuz e Amazon Music. | Candidato reaberto após flexibilização da origem; arquivo, edição, master, funcionamento e segurança não comprovados. |
| Tidal | Assinatura/integradores não dão, por si, exportação gratuita de arquivos. | FLAC disponível; equivalência do master não é automática. | Serviços adicionais pagos não atendem ao orçamento. |
| YouTube Music/spotDL | Mecanismo de obtenção deve ser avaliado. | O streaming usual documentado é AAC/Opus com perdas; spotDL usa outras fontes. | A empresa não é excluída; esse áudio específico não comprova equivalência sem perdas. Outro arquivo/mecanismo exige avaliação própria. |
| Beatport/Qobuz e outras lojas pagas | Compra não atende ao orçamento atual. | Arquivos sem perdas podem existir. | Não aprovadas como solução gratuita. |

## Evidências verificadas nesta etapa

### E01 — Bandcamp: gratuidade depende da liberação

O suporte documenta faixas/álbuns gratuitos e itens de preço livre sem mínimo quando o comprador informa zero. O limite de créditos citado é do artista/gravadora, não um limite escolhido para o usuário final deste projeto. Isso impede tratar toda publicação como gratuitamente obtenível.

[Bandcamp — downloads gratuitos e créditos](https://get.bandcamp.help/en/articles/15263450-you-guys-said-i-d-get-200-more-codes-for-free-every-month-well-where-are-they).

### E02 — Bandcamp: resolução preservada

O suporte informa que downloads em FLAC, WAV e AIFF preservam profundidade de bits e taxa de amostragem do upload. Essa documentação não comprova o master de uma faixa específica nem demonstra que o arquivo enviado nunca derivou de áudio com perdas.

[Bandcamp — áudio de alta resolução](https://get.bandcamp.help/en/articles/15263308-can-i-upload-higher-resolution-audio).

### E03 — SoundCloud: download do original

A ajuda descreve downloads na web quando o autor os habilita, entregando o formato original enviado. Nem toda faixa é baixável e o recurso descrito atende faixas individuais. O formato original pode ser inadequado ao requisito de áudio sem perdas.

[SoundCloud — downloading tracks](https://help.soundcloud.com/hc/en-us/articles/115003448787-Downloading-tracks).

### E04 — SoundCloud: limites da API

Os termos da API, na seção Caching and Downloading, proíbem funcionalidades de salvamento persistente e downloads offline, inclusive quando o autor permite download na própria plataforma. Logo, a permissão no site não autoriza um conector downloader pela API padrão. A documentação de cadastro também exige Artist Pro para registrar aplicações. Essa exigência conflita com contratação adicional zero.

[SoundCloud — termos da API](https://developers.soundcloud.com/docs/api/terms-of-use), [cadastro de aplicativo](https://developers.soundcloud.com/docs/api/register-app).

### E05 — Spotify: integração entre fontes é uma pendência específica

A política III.5 restringe produtos integrados a conteúdo/streams de outros serviços; III.9 traz uma exceção para transferência de dados pessoais e metadados de playlists do usuário. Aplicar essa exceção ao fluxo desejado requer análise do caso concreto; não é uma aprovação automática do identificador de faixas ou downloader. Integração com a API não será presumida permitida apenas porque o áudio vem de outra plataforma.

[Spotify — Developer Policy](https://developer.spotify.com/policy).

### E06 — Spotify: cópias permanentes

Os termos IV.2 restringem funcionalidades de stream ripping e cópias permanentes. Código disponível, assinatura Premium ou gratuidade não demonstram autorização para a obtenção e o uso pretendidos.

[Spotify — Developer Terms](https://developer.spotify.com/terms).

### E07 — Votify: candidato documental, sem prova operacional

O README declara download direto do Spotify, formatos FLAC nativos incluindo 24 bits, exigência Premium e dependências de descriptografia. Também registra relatos de suspensão de contas. A leitura anterior do caminho de FLAC nativo no código mostrou processamento sem recodificação de áudio, seguido de escrita de tags. Nada disso comprova funcionamento na conta brasileira, no macOS ou atendimento a qualquer pedido futuro. É candidato de pesquisa, não motor escolhido.

[Votify — documentação](https://github.com/glomatico/votify), [código de áudio anteriormente consultado](https://github.com/glomatico/votify/blob/main/votify/downloader/audio.py).

### E08 — ISRC não certifica o master

A IFPI permite manter o ISRC em certas remasterizações. Portanto, igualdade desse identificador apoia a identificação da gravação, mas não é prova suficiente da equivalência exigida neste produto.

[IFPI — FAQ, pergunta 8](https://isrc.ifpi.org/faqs).

### E09 — Free Music Archive: condições por faixa

A FAQ apresenta música com licenças abertas e orienta verificar restrições de uso, atribuição e transformações. Não certifica qualidade sem perdas, mesmo master do Spotify ou correspondência para uma nova solicitação.

[Free Music Archive — FAQ](https://freemusicarchive.org/FAQ).

### E10 — YouTube Music: áudio com perdas

A ajuda informa qualidade alta de 256 kbps AAC/Opus. Esse streaming documentado tem perdas; gravar ou converter sua saída para FLAC não restabelece informação perdida. A conclusão se refere ao áudio efetivamente oferecido por esse mecanismo, não a uma exclusão arbitrária de toda origem relacionada à empresa.

[YouTube Music — qualidade do áudio](https://support.google.com/youtubemusic/answer/9076559).

### E11 — Tidal: qualidade não equivale a permissão de exportação

O suporte documenta FLAC até 24 bits/192 kHz. Essa informação não demonstra exportação gratuita de arquivo independente ou identidade do master. A existência de conteúdo em streaming e de qualidade alta não basta para aprovar a fonte para este projeto.

[Tidal — HiRes FLAC](https://support.tidal.com/hc/en-us/articles/17412130162961-HiRes-FLAC-audio).

### E12 — Brasil: uso pessoal não garante ausência de implicações

A Lei 9.610/1998 prevê autorização para reprodução no art. 29; a hipótese de uso privado do art. 46, II refere-se a pequenos trechos. Isso não sustenta uma garantia geral para copiar músicas integrais sem autorização. O art. 107 também trata de dispositivos de proteção contra cópia. A avaliação de métodos não oficiais não será apresentada como certificação jurídica.

[Lei 9.610/1998 — texto oficial](https://www.planalto.gov.br/ccivil_03/leis/l9610.htm).

### E13 — SpotiFLAC: candidato multifonte reavaliado

O README declara FLAC de Tidal/Qobuz/Amazon, sem conta ou assinatura, por APIs de terceiros. Isso passa a ser relevante com a flexibilização da origem. As alegações do autor sobre segurança e ausência de suspensão não foram validadas. Auditoria parcial: a checagem de duração usa tolerância de 25% para faixas longas; a análise interna decodifica uma representação mono em 16 bits, que não comprova o master integral nem altera necessariamente o arquivo baixado. Não houve execução. Esses achados exigem validação mais rigorosa do arquivo real.

[SpotiFLAC — README](https://github.com/spotbye/SpotiFLAC), [checagem de duração](https://github.com/spotbye/SpotiFLAC/blob/main/backend/download_validation.go), [análise interna](https://github.com/spotbye/SpotiFLAC/blob/main/backend/analysis.go).

## Inferências e limites

- Bandcamp e SoundCloud são vias reais para investigar solicitações individuais; a disponibilidade deve ser reavaliada ao longo do uso. Sua existência não aprova uma solução limitada a um conjunto pré-selecionado de arquivos.
- Ter uma API técnica não prova permissão de download, integração ou análise do conteúdo.
- Não houve avaliação operacional de solicitações, prova de master por faixa ou avaliação de licença para um evento específico. A ausência de uma lista completa não impede a continuação da pesquisa.
- Não há fundamento nesta pesquisa para prometer uma solução gratuita que obtenha qualquer música escolhida no Spotify, nem para declarar uma impossibilidade técnica absoluta.
- Fontes com uso permitido somente em certas condições devem ser confrontadas com o contexto do DJ quando informado. Esta análise de documentação não constitui certificação jurídica.
