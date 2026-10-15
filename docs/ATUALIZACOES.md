# Atualizações pelo aplicativo

Disponível a partir de 0.1.2. O executável/instalador nativo continua fora desta etapa.

## Experiência do usuário

- Consulta da última GitHub Release estável ao abrir e a cada seis horas enquanto o aplicativo estiver aberto. O botão no rodapé permite uma consulta manual; chamadas consecutivas usam cache por pelo menos um minuto.
- Modal de nova versão com notas em texto, Atualizar e reiniciar e Mais tarde. Adiar é persistido por versão e mantém uma indicação discreta na página.
- Havendo transferência ou preparação ativa, a instalação é agendada para depois dos downloads. Uma fila pausada pode ser preservada e retomada depois da atualização.
- Cancelamento disponível durante o download do pacote ou a espera pela fila. Após iniciar a substituição, a interface aguarda o reinício e reconecta com uma sessão nova.
- A confirmação final só acontece depois de o novo servidor sinalizar prontidão. Se não iniciar, restauração automática dos arquivos anteriores, dependências anteriores e snapshot da fila. Não há garantia de detecção de todo defeito funcional posterior à inicialização.
- Erros na consulta de versões não bloqueiam os downloads. Consultas não acontecem com o aplicativo fechado.

## Componentes e limites

`lib/updates.mjs` consulta um único repositório, `gpradotech/ixpotifai`, por HTTPS. Só aceita tags estáveis `vMAJOR.MINOR.PATCH` maiores que a versão instalada, com asset `ixpotifai-VERSAO.update.json.gz`, tamanho limitado e digest SHA-256 informado pelo GitHub. Respostas condicionais ETag evitam transferências repetidas; HTTP 429/403 respeita o prazo da fonte inclusive em consultas manuais.

`lib/update-package.mjs` confere hash do pacote, conteúdo descompactado limitado, versão do pacote/lock, versão mínima do Node.js e hash de cada arquivo. Rejeita travessia de diretórios, caminhos absolutos, colisões de caixa e arquivos de dados pessoais. O formato é JSON comprimido com gzip, contendo apenas arquivos comuns e permissões limitadas; não extrai ZIPs arbitrários e não oferece uma URL de pacote configurável ao navegador.

`lib/update-installer.mjs` prepara o pacote em `.ixpotifai/updates/`, mantém backups e um diário de instalação e restaura uma instalação interrompida antes de iniciar o servidor. Dependências diferentes são instaladas no estágio antes de substituir o aplicativo. A instalação atual continua intacta se essa preparação falhar. O Node.js existente continua necessário. Backups ficam preservados para diagnóstico; não há limpeza automática nesta versão.

`scripts/run.mjs`, usado por ambos os launchers e por `npm start`, acompanha o processo do servidor. O código de saída 75 solicita instalação do pacote preparado. O novo servidor tem até 30 segundos para sinalizar versão e prontidão por IPC; o launcher confirma a instalação ou restaura o backup e abre a versão anterior. O protocolo do launcher é versionado no pacote; uma mudança incompatível exige um caminho de migração próprio.

A lista e a pasta de downloads não fazem parte do pacote. Arquivos desconhecidos não são apagados. Arquivos gerenciados removidos em uma versão seguinte só são excluídos quando constam no registro de uma instalação anterior. Uma alteração manual detectada nesses arquivos impede sobrescrita automática. Instalações com `.git` não são modificadas pelo atualizador.

A confiança na origem vem do repositório fixo e do HTTPS; os hashes conferem integridade. Não há assinatura digital independente do pacote nesta etapa. A execução em macOS não foi comprovada em um Mac; os testes executados foram no Windows.

## Publicação de cada versão

1. Atualizar as versões em `package.json` e `package-lock.json`, incluindo `packages[""].version`, e escrever as notas para o usuário.
2. Executar `npm test` e `git diff --check`, revisar o escopo e publicar o commit no GitHub.
3. Em checkout correspondente ao commit publicado, executar `npm run build:release`. A pasta ignorada `dist/` recebe o pacote e um arquivo `.sha256`.
4. Criar uma GitHub Release em rascunho com a tag `vVERSAO` apontando para esse commit e anexar os dois arquivos. Conferir o digest do asset pelo GitHub contra o SHA-256 gerado.
5. Publicar a Release como estável e latest somente depois de os assets estarem completos. Confirmar pelo endpoint público que a versão e o asset esperado aparecem.

Um push em `main` sozinho atualiza o ZIP de código, mas não anuncia atualização automática. O atualizador acompanha Releases com pacote completo. Pré-releases, rascunhos, tags sem Release e assets incompletos não são oferecidos.

## Evidência desta etapa

Testes automatizados cobrem formato e integridade do pacote, exclusão de dados pessoais, instalação, dependências, recuperação, arquivos modificados, autenticação das rotas, cache, adiamento, modo offline, espera pela fila e inicialização/rollback pelo launcher com processos Node reais.

Validação no Chromium em desktop (1440 × 1000) e mobile (390 × 844) exercitou modal, adiamento persistido, banner, agendamento, cancelamento, instalação do pacote real em diretório temporário, reinício na mesma porta, renovação da sessão, reconexão da página e preservação da lista e de um arquivo de áudio. Isso não equivale a teste da atualização em um Mac nem a prova de ausência de todo defeito futuro.
