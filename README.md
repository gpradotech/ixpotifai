# Skeeter

Aplicativo local gratuito para obter arquivos FLAC a partir de músicas escolhidas no Spotify. Primeira versão funcional: 14/10/2026.

## Usar agora

**Windows:** abra `Iniciar Skeeter.cmd`. O Node.js 22.19 ou superior já está instalado neste computador e a dependência FFmpeg já foi instalada neste projeto.

**macOS:** copie os arquivos do projeto, instale [Node.js 22.19 ou superior](https://nodejs.org/), abra o Terminal na pasta e execute:

```sh
npm ci --cache .skeeter/npm-cache
npm start
```

Também há um `start.command`: execute `chmod +x start.command` uma vez para permitir sua abertura. A instalação baixa o FFmpeg para a plataforma do computador. Não copie o `node_modules` do Windows para o Mac.

Acesse **http://127.0.0.1:4317**. Cole links de faixas, um por linha, e adicione à fila. Os arquivos e os relatórios ficam em `downloads/`. A biblioteca possui um botão para salvar cada arquivo pelo navegador. Para encerrar, pressione Ctrl+C no terminal do aplicativo.

## Implementado

- Referências públicas do Spotify, correlação entre serviços por Songlink e ISRC.
- Download efetivo por uma fonte não oficial: `tracks.monochrome.st`. Não usa YouTube como áudio de substituição.
- Conferência dos cabeçalhos de todos os arquivos compatíveis retornados pela fonte, escolhendo uma resolução que domine as demais em bits e taxa de amostragem.
- Preservação dos bytes do FLAC recebido. Nenhuma normalização, reamostragem ou conversão de áudio com perdas.
- Validação da duração, resolução, decodificação integral, número real de amostras, MD5 do PCM quando disponível e SHA-256 do arquivo.
- Fila persistente, pausa, retomada, cancelamento, nova tentativa e deduplicação. Sem cotas por dia, evento ou biblioteca; uma transferência por vez.
- Importação das faixas visíveis de álbuns públicos. Playlists sem total comprovável são recusadas para evitar importação parcial silenciosa. Essa funcionalidade ainda precisa de um conector paginado.
- Conector compatível com hifi-api para FLAC aberto, incluindo segmentos sem criptografia; instâncias públicas dessa família não comprovaram disponibilidade neste ambiente e não são o padrão.

## Resultado real e limites

A faixa fornecida pelo usuário, **In Da Club — 50 Cent**, foi baixada em FLAC estéreo, **16 bits / 44.100 Hz**, **193,466667 segundos**, **20.968.971 bytes**. O ISRC correlacionado é `USIR10300033`. A decodificação produziu 8.531.880 amostras por canal, e seu MD5 coincide com o STREAMINFO do arquivo. Uma segunda execução ponta a ponta verificou o código revisado. Consulte [a evidência executável](docs/VERIFICACAO-LIVE.json).

**Isso comprova a obtenção e a integridade de um arquivo FLAC, não a identidade do master do Spotify nem a ausência de uma etapa com perdas anterior à publicação nessa fonte.** O aplicativo exibe “Master: não comprovado”. A maior resolução é comparada dentro dos resultados compatíveis desta fonte; a maior qualidade existente em todos os serviços não foi comprovada. A exigência completa do produto continua pendente, e este protótipo não é uma declaração de sucesso de todos os requisitos.

O Windows foi executado e testado. O código e o launcher atendem às APIs do macOS, mas não houve execução num Mac nesta sessão. Não há instalador nativo assinado nesta versão. O downloader produz FLAC; o validador também aceita WAV PCM. Exportar WAV não está implementado.

A disponibilidade depende da fonte, da correlação e da faixa. Não há promessa de baixar qualquer música. Uma falha não gera um arquivo marcado como concluído, e versões divergentes não são substituídas automaticamente.

## Privacidade

O servidor escuta somente em `127.0.0.1`, sem telemetria ou conta no aplicativo. Alterações da fila exigem uma sessão local; origem externa e Host inesperado são recusados. Fontes precisam usar HTTPS público com TLS verificado; DNS validado é fixado à conexão e endereços privados são rejeitados, inclusive em redirecionamentos.

Pedidos de metadados e arquivos contatam Spotify, Songlink, Deezer e a fonte de áudio. Esses serviços podem observar o IP e as requisições. Não há promessa de anonimato ou imunidade jurídica. Nenhum cookie de conta Spotify ou credencial pessoal foi solicitado ou utilizado. URLs assinadas não são gravadas nos relatórios. `.skeeter/` guarda o histórico local da fila, portanto esse diretório contém as escolhas musicais do usuário.

## Desenvolvimento e configuração

```sh
npm test
node --use-system-ca scripts/probe.mjs
node --use-system-ca scripts/verify-live.mjs
```

`npm test` usa áudio sintético e testa rejeição de arquivos truncados, falsos FLAC, resolução inferior, gravação divergente, fontes privadas, ações sem sessão, persistência e cancelamento. Os scripts `probe` e `verify-live` fazem requisições reais; `verify-live` baixa a faixa de exemplo numa pasta isolada de verificação e atualiza a evidência.

Variáveis opcionais: `SKEETER_PORT`, `SKEETER_DOWNLOAD_DIR` (pasta absoluta), `SKEETER_PROVIDER` (uma API pública HTTPS compatível com hifi-api), `SKEETER_FFMPEG` (caminho do executável). Os testes não usam credenciais. A dependência está fixada em `package-lock.json`.

- [Plano e requisitos](docs/PLANO.md).
- [Fontes da investigação](docs/FONTES.md).
- [Caso concreto e validação](docs/EXEMPLO-IN-DA-CLUB.md).
- [Próximas etapas objetivas](docs/PROXIMAS-ETAPAS.md).
