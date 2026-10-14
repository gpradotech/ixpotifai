# Primeiro caso: In Da Club, de 50 Cent

Data: 14/10/2026. Estado atual: arquivo FLAC obtido e validado no Windows. A investigação documental abaixo é anterior à implementação; a identidade do master e a qualidade máxima global continuam não comprovadas.

## Prova executada no Skeeter

- Fonte efetiva: `tracks.monochrome.st`, sem YouTube na obtenção do áudio.
- ISRC correlacionado: `USIR10300033`; versão explícita, duração e artista compatíveis.
- Arquivo: FLAC estéreo, 16 bits, 44.100 Hz, 193,466667 segundos e 20.968.971 bytes.
- Decodificação: 8.531.880 amostras por canal, sem falhas; MD5 do PCM `4304c4f7e44544a434aa7bb410d8cad0`, idêntico ao checksum do STREAMINFO.
- SHA-256: `1c682b4657018bef1f3925cad9bea3a5d95d2c452fe46f3ba6f2d0a1b0ad45e1`.
- Duas execuções reais entregaram o mesmo SHA-256, incluindo uma execução isolada após as revisões do núcleo.
- Evidência: [VERIFICACAO-LIVE.json](VERIFICACAO-LIVE.json). Relatório adicional acompanha o arquivo em `downloads/`.

O cabeçalho e a integridade do FLAC não comprovam que a fonte jamais tenha recodificado áudio com perdas, nem que o master corresponda ao Spotify. Não promover esse caso a aceite completo de R04/R05.

## Referência fornecida

- URL original: https://open.spotify.com/intl-pt/track/7iL6o9tox1zgHpKUfh9vuC?si=8937f19bb51d4f9d
- ID da faixa: `7iL6o9tox1zgHpKUfh9vuC`.
- Título e artista confirmados no embed oficial: In Da Club — 50 Cent.
- Duração pública: 193.466 ms; álbum correlacionado: Get Rich Or Die Tryin'; ISRC correlacionado: `USIR10300033`. Resolução máxima e master do Spotify não confirmados por uma leitura autenticada.

[Spotify — referência](https://open.spotify.com/track/7iL6o9tox1zgHpKUfh9vuC), [embed oficial consultado](https://open.spotify.com/embed/track/7iL6o9tox1zgHpKUfh9vuC).

## Candidatas observadas

| Candidata | Evidência consultada | O que falta provar |
| --- | --- | --- |
| Qobuz, álbum Get Rich Or Die Tryin', edição `n2xby3zy8bhdc` | Página declara 16 bits/44,1 kHz estéreo e faixa In Da Club explicit de 3:13. Exibe também Download not available. | Mesma edição/master do ID Spotify, obtenção gratuita e efetiva do arquivo, disponibilidade no Brasil e existência de resolução superior genuína. |
| Qobuz, single `0060249863114` | Página declara 16 bits/44,1 kHz estéreo; In Da Club explicit de 3:46, em publicação de compra. | Não presumir equivalência com a versão do álbum. Compra não atende ao custo adicional zero. |
| Publicação da Universal no YouTube | Descrição identifica 50 Cent, Get Rich Or Die Tryin' e o fonograma publicado pela Universal. | Formato/resolução efetivos, edição/master e obtenção de arquivo sem perdas. Publicação oficial não implica entrega do upload original ao ouvinte. |
| SoundCloud, página `50_cent/in-da-club-2` | Título e artista aparecem; a página mostra all-rights-reserved. | A leitura não comprovou download original habilitado, formato sem perdas ou master. Não inferir permissão a partir do acesso à página. |
| SpotiFLAC/Votify | Candidatos de software com documentação pública analisada. | Resultado real para esta faixa; nenhum deles foi executado. |

Fontes: [Qobuz — álbum](https://www.qobuz.com/us-en/album/get-rich-or-die-tryin-50-cent/n2xby3zy8bhdc), [Qobuz — single](https://www.qobuz.com/ie-en/album/in-da-club-50-cent/0060249863114), [YouTube — publicação Universal](https://www.youtube.com/watch?v=bykSx6ewuac), [SoundCloud](https://soundcloud.com/50_cent/in-da-club-2).

## Achado útil para o piloto

A checagem de duração do SpotiFLAC admite, para faixas longas, diferenças de até 25% da duração esperada, com mínimo de 15 segundos. Hipótese ilustrativa: uma referência de 193 segundos e uma candidata de 226 segundos diferem 33 segundos, abaixo da tolerância de 48 segundos. Esse teste isolado poderia aceitar ambas; não comprova que o aplicativo realmente selecionou a edição errada. O piloto precisa examinar a edição e o áudio, além dessa tolerância.

[Código da checagem](https://github.com/spotbye/SpotiFLAC/blob/main/backend/download_validation.go).

## Próximo passo técnico

Definir qual edição o ID Spotify identifica, auditar o caminho de correspondência/obtenção e preparar execução isolada para validar um arquivo real, com origem, formato e qualidade registrados. Nenhuma lista completa, informação de equipamento ou nova preferência do usuário é necessária para continuar essa investigação.

Uma tentativa de consultar a API pública do Songlink pelo navegador de pesquisa retornou que a URL não era acessível pela ferramenta. Isso não é evidência de que a API ou seus mapeamentos estejam indisponíveis no aplicativo.

## Privacidade e limites da conclusão

A solicitação é parte de um uso cotidiano sem cotas artificiais. Minimização de dados locais e proteção de credenciais são propostas de projeto. Elas não eliminam registros de acessos em serviços externos nem autorizam downloads. Não houve uso de conta, alteração de configurações de privacidade, instalação ou download de música nesta etapa.
