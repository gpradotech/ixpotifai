# Formato do upload, reprodução e download de Imprevisto

Investigação em 15/10/2026.

## O que cada evidência permite afirmar

| Camada | Evidência | Limite |
| --- | --- | --- |
| Upload do distribuidor | O usuário informa que seu amigo distribuiu a música em WAV. | Relato do usuário; o arquivo e o registro da distribuição não foram inspecionados. |
| Processamento do Spotify | A documentação oficial informa que WAVs recebidos são convertidos para FLAC sem perdas antes da reprodução. | Regra geral; não é inspeção do ativo desta faixa. O Spotify também documenta ajustes de resolução para reprodução. |
| Reprodução do Spotify | Há diferentes qualidades; Lossless usa FLAC até 24 bits / 44,1 kHz. | Não foi inspecionada uma sessão de reprodução desta faixa. O link público não comprova seu formato de reprodução ou de upload. |
| Fonte usada pelo ixpotifai | `tracks.monochrome.st` retornou um arquivo cujo cabeçalho é FLAC, 24 bits / 48.000 Hz. | É uma fonte externa ao Spotify; não comprova a procedência anterior nem igualdade do master. |
| Aplicação | O caminho de arquivo único copia o áudio recebido e publica os mesmos bytes. | Preservar o arquivo da fonte externa não equivale a obter o original do distribuidor. |

Referência: [Imprevisto — Yago Oproprio, Rô Rosa, Skeeter Beats](https://open.spotify.com/track/0gaZCBbtjEyTLhJrjnPbt5). Spotify ID: `0gaZCBbtjEyTLhJrjnPbt5`; ISRC correlacionado: `BXYGQ2200002`; ID retornado pela fonte externa: `165832196132978688`.

O FLAC obtido não demonstra que a aplicação converteu um WAV. Pelo código, o conector padrão exige cabeçalho FLAC na fonte e preserva o arquivo recebido. O conector alternativo segmentado usa remux com `-c:a copy`, sem recodificação, e também não recupera o upload original.

## Implicação para o requisito de original

Preservar o formato e os bytes fornecidos pela fonte de download já ocorre no caminho padrão. Recuperar o WAV exato entregue pelo distribuidor continua sem atendimento: requer acesso ao arquivo do artista/distribuidor ou a uma fonte que entregue esse original com evidência de procedência. Converter o FLAC para WAV ou mudar sua extensão não atende esse requisito.

Não foi introduzida conversão para WAV nem uma alegação de que todos os arquivos do Spotify sejam FLAC. A documentação descreve FLAC para Lossless em quase todo o catálogo; outros modos de reprodução usam outras qualidades e formatos.

## Saída sem JSON

Novos downloads publicam apenas o áudio na pasta escolhida. O relatório técnico fica no item da fila em `.ixpotifai/state.json`, junto da validação e da procedência. Arquivos e JSONs anteriores são preservados. Um JSON antigo não impede baixar um áudio ausente; um áudio existente continua protegido contra sobrescrita.

## Verificação executada

Os 36 testes automatizados passaram, incluindo publicação sem JSON, preservação dos bytes, colisão com áudio existente, convivência com JSON antigo e cancelamento antes da publicação.

Um download real de Imprevisto foi concluído em uma pasta isolada de verificação, com um único arquivo na saída: `Yago Oproprio, Rô Rosa, Skeeter Beats - Imprevisto.flac`. O áudio tem 26.092.814 bytes, dois canais, 24 bits / 48.000 Hz e duração de 139,703125 segundos. A decodificação integral produziu 6.705.750 amostras por canal; o MD5 do PCM coincide com o STREAMINFO. O relatório interno foi lido do disco e conferido contra o SHA-256 do áudio. Consulte a [evidência da execução](VERIFICACAO-IMPREVISTO.json).

Isso comprova o fluxo de download da fonte externa e a saída sem JSON. A igualdade com o WAV do distribuidor e o formato desta faixa em uma reprodução do Spotify continuam não verificados.

## Fontes consultadas

- [Spotify for Artists — Audio file formats for Spotify](https://support.spotify.com/us/artists/article/audio-file-formats/): WAV aceito, conversão interna para FLAC e ajustes de resolução.
- [Spotify — Audio quality](https://support.spotify.com/us/article/audio-quality/): qualidades por cliente/plano e FLAC Lossless até 24 bits / 44,1 kHz.
- [Spotify — anúncio de Lossless](https://newsroom.spotify.com/2025-09-10/lossless-listening-arrives-on-spotify-premium-with-a-richer-more-detailed-listening-experience/): cobertura descrita como quase todo o catálogo.
- [Spotify Web API — Get Track](https://developer.spotify.com/documentation/web-api/reference/get-track): o esquema consultado não fornece formato do upload nem arquivo master para download.

As conclusões sobre a aplicação vêm de `lib/provider.mjs`, `lib/queue.mjs` e `lib/audio.mjs`; o cabeçalho foi consultado pela mesma rotina do conector, com metadados atuais e sem conta autenticada do Spotify.
