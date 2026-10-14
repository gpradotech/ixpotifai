# Etapas após o primeiro download funcional

Estado: 14/10/2026. O núcleo já obtém arquivos e verifica sua integridade. Os itens abaixo delimitam o que falta para cumprir a exigência completa, sem condicionar o avanço a um repertório fechado ou a informações sobre equipamentos.

1. **Proveniência e master.** Integrar uma fonte que forneça evidência da edição/master e do áudio anterior à distribuição. ISRC igual e PCM íntegro não resolvem esse requisito. Comparar com uma referência lossless verificável do mesmo master; registrar a evidência e a incerteza. Não afirmar equivalência ao master do Spotify com análise espectral ou título sozinho.
2. **Máxima qualidade entre fontes.** Adicionar conectores independentes e retornar os candidatos por gravação/edição antes de selecionar. Comparar resolução genuína, sem procurar um remaster diferente ou fazer upsampling. Resoluções incomparáveis e masters distintos precisam permanecer explícitos.
3. **Cobertura cotidiana.** Testar solicitações diversificadas e registrar disponibilidade, edição, resolução e falhas por faixa. A intenção de atender qualquer música permanece; não há evidência que permita prometer cobertura universal.
4. **macOS.** Executar instalação e download real em um Mac, conferir os mesmos critérios de integridade, pause/resume e arquivo final. O launcher existe; execução nesse sistema ainda não ocorreu.
5. **Listas completas.** Usar metadados paginados com total conhecido para playlists e álbuns extensos. Não apresentar uma lista parcial como completa.
6. **Distribuição.** Empacotar os runtimes e dependências por sistema, com procedência e licenças, se a versão com Node.js não for suficiente. Instaladores assinados e notarização não fazem parte desta entrega.

Nenhum desses itens exige comprar faixas ou contratar um serviço no estado atual. Se a fonte capaz de comprovar master/qualidade depender de pagamento ou credenciais, isso será uma decisão concreta a apresentar, sem presumir autorização.

## Fonte do protocolo do conector

A documentação pública do [plugin Lossless Sources](https://github.com/kipavy/spotube-plugin-lossless-sources) e seu [conector Monochrome](https://github.com/kipavy/spotube-plugin-lossless-sources/blob/main/src/sources/monochrome.ht) forneceram o formato dos endpoints. O Skeeter implementa seu próprio cliente em Node.js e mede a resolução no cabeçalho FLAC; não estima bits ou taxa de amostragem a partir do tamanho do arquivo. A disponibilidade foi verificada diretamente neste ambiente, e não inferida do README do fornecedor.
