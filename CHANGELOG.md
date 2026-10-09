# Changelog

O Lumen recomeça a numeração em 0.1.0. Da v0.2.10 para baixo, as entradas são
do Dokke e ficam no arquivo como procedência do fork.

## v0.1.0 — não lançado

Primeira versão do **Lumen**.

### Origem

O Lumen é um fork sob licença MIT de
[felipenalves/Dokke](https://github.com/felipenalves/Dokke), derivado do
**Dokke v0.2.10** (6 de outubro de 2026) — a última versão publicada antes do
fork, e o ponto exato de onde este histórico parte. O copyright original de
Felipe Alves está preservado no `LICENSE`, ao lado do novo.

A numeração recomeça do zero porque o Lumen é um produto próprio: um `v0.1.0`
aqui **não** é anterior ao `v0.2.10` do Dokke, é posterior. Toda a base de
código, o protocolo e os recursos do Dokke v0.2.10 estão presentes; mudam o
nome, os identificadores, as URLs e a identidade visual.

### O que muda para quem vinha do Dokke

- **Android — requer reinstalação manual.** O `applicationId` passou de
  `com.dokke.app` para `com.lumen.app`, e o Android recusa atualizar um app
  instalado quando o identificador muda. Quem já tem o Dokke no celular precisa
  **desinstalar o app antigo e instalar o APK do Lumen**. O pareamento de 4
  dígitos com o Mac precisa ser refeito uma vez; depois disso ele persiste
  normalmente.
- **macOS — migração automática.** No primeiro boot, o servidor copia
  `config.json`, o PIN e as sessões dos devices pareados de
  `~/Library/Application Support/Dokke` para
  `~/Library/Application Support/Lumen`. Nada precisa ser refeito: os apps do
  dock, o PIN e os dispositivos já pareados continuam valendo. A cópia só
  acontece quando a pasta nova ainda está vazia — se a instalação Lumen já
  estiver em uso, nada é importado.
- **PWA — a última tela aberta é preservada.** A chave antiga de armazenamento
  local é lida na primeira abertura, então a PWA volta na mesma tela em que foi
  deixada.

## Histórico do Dokke (antes do fork)

As entradas abaixo são do projeto original, mantidas na íntegra como
procedência. A numeração `v0.2.x` é do Dokke, não do Lumen.

## v0.2.10 — 6 de outubro de 2026

### Correções

- Atalhos do Mac podem ser executados por dispositivos autenticados na mesma sub-rede Ethernet/Wi-Fi, incluindo o APK, sem configuração manual.
- Fora da rede local, a execução exige HTTPS. HTTP local não criptografa o tráfego.
- As notas de versão no macOS agora separam títulos, parágrafos e listas para facilitar a leitura.

### Instalação

- macOS 14 ou posterior: abra o DMG e mova o Lumen para Aplicativos.
- Android 5.0 ou posterior: instale o APK.

### Downloads

- [macOS Apple Silicon](https://github.com/felipenalves/Dokke/releases/download/v0.2.10/Dokke-macOS-apple-silicon-arm64.dmg)
- [macOS Intel](https://github.com/felipenalves/Dokke/releases/download/v0.2.10/Dokke-macOS-intel-x86_64.dmg)
- [macOS universal](https://github.com/felipenalves/Dokke/releases/download/v0.2.10/Dokke-macOS.dmg)
- [Android](https://github.com/felipenalves/Dokke/releases/download/v0.2.10/dokke.apk)

## v0.2.9 — 6 de outubro de 2026

Esta atualização reúne os atalhos do Mac, builds adequados a cada arquitetura e
recuperação da conexão entre o servidor do Mac e a PWA.

### Novidades

- Integra os atalhos do Apple Shortcuts ao picker e ao dock do Lumen no Mac.
- Gera DMGs nativos para Apple Silicon e Intel, além do pacote universal de
  compatibilidade.
- Simplifica o picker de itens e atualiza os botões de atalhos no macOS.

### Correções

- A PWA informa quando perde a conexão ou não consegue carregar dados e oferece
  uma tentativa de reconexão.
- O app do Mac monitora um servidor Lumen já ativo e tenta iniciar sua própria
  instância se o processo adotado parar.
- A instalação do Service Worker exige que o shell da PWA entre no cache; uma
  atualização incompleta preserva o worker e a tela offline anteriores.
- O bundle do servidor Mac inclui as fontes Inter usadas pela PWA.
- Só o picker local do Mac pode consultar a lista e adicionar atalhos do Apple
  Shortcuts.
- Atalhos acionados remotamente exigem HTTPS; a execução local continua disponível.
- O campo de emoji recebe foco acessível quando o prompt de atalho abre.

Esta versão ainda não foi publicada. Os DMGs, o APK de produção assinado e seus
checksums dependem da validação final de build.

## v0.2.8 — 29 de agosto de 2026

Esta versão consolidou a experiência multiplataforma do Lumen, adicionou
suporte a inglês e disponibilizou atualização pelo macOS e Android.

### Novidades

- Suporte a Português (Brasil) e English no PWA/APK, macOS, landing page e documentação.
- Detecção automática de idioma no PWA/APK e seletor persistente no macOS e na landing.
- Descoberta e validação automática de hosts Lumen na rede local.
- Melhorias de conexão, safe area, viewport, gestos e orientação no Android/PWA.
- Ajustes de layout, ícones, hover, picker e reordenação do dock no macOS.
- Website Links com favicon, fallback e confirmação antes da remoção.
- Login do PWA enviado automaticamente ao completar o quarto dígito do PIN.
- Atualização do macOS via DMG com verificação SHA-256.
- Atualização do Android via APK com validação de pacote, versão e assinatura.
- README em inglês, novos assets de marca e documentação dos contratos de host e UI.

### Correções

- APK voltou a exibir os apps após a correção do conflito de escopo do tradutor.
- Mensagens de erro da API, macOS e Android passaram a respeitar o idioma selecionado ou detectado.
- Limites de dock, autenticação e validação de hosts foram reforçados.

### Downloads

- [Dokke para macOS — DMG universal](https://github.com/felipenalves/Dokke/releases/download/v0.2.8/Dokke-macOS-v0.2.8-universal.dmg)
- [Dokke para Android — APK](https://github.com/felipenalves/Dokke/releases/download/v0.2.8/dokke.apk)

### Checksums SHA-256

- DMG universal: e16ea5bbab8dfe79e743ee6cabd4d507f5c84c7b75b499a74266299f6e275e17
- APK: a63a08364e94dc5a2e03845aeed90f9519fbca0064244afaf60f08ebd59e90c4

### Validação

- APK v0.2.8, versionCode 11, com assinatura de produção preservada.
- DMG validado com binários arm64 e x86_64.
- 35 testes de release passando; `npm audit --omit=dev --audit-level=high` sem vulnerabilidades.

## v0.2.7 — 11 de agosto de 2026

Esta versão concentra a rodada de correções de uso real em Android, iPhone e
iPad, com foco em deixar o Lumen mais fluido em aparelhos antigos e mais
previsível em diferentes orientações de tela.

### Gestos e navegação

- Corrigido o retorno da tela **Apps abertos** para a tela principal quando o
  gesto começa em cima de um ícone.
- O toque sobre um app só abre o app quando é realmente um toque; arrastes
  verticais não são mais confundidos com clique.
- O dock horizontal passou a usar o scroll nativo no Android, reduzindo o
  trabalho de JavaScript por frame em WebViews antigos.
- Ajustadas sensibilidade, velocidade e confirmação dos gestos para arrastes
  lentos e rápidos.
- Mantida a troca de slides da tela 1 sem reconstruir todo o HTML ao girar o
  dispositivo.

### Layout e renderização

- Corrigidas frestas e bordas brancas na safe area de iPhone e iPad.
- V-Dots permanecem no lado direito no modo deitado.
- Ícones da tela 2 seguem o mesmo espaçamento da tela 1.
- O landscape curto do Android agora tem margem vertical de segurança para o
  glass não ser cortado.
- Ícones reais dos apps são carregados com cache, pré-carregamento e resolução
  maior quando disponível.
- A identidade do app é resolvida pelo bundle do macOS, respeitando
  `CFBundleIconFile` e evitando ícones trocados ou monogramas temporários.

### Interação e estabilidade

- Adicionado feedback visual de toque nos cards.
- Bloqueado o menu nativo de salvar/arrastar imagem ao pressionar um ícone.
- Atualização da lista de apps abertos ficou mais rápida quando um app é
  fechado no Mac.
- Melhorada a comparação de versão e o fluxo de atualização do APK.
- O APK de release continua separado de builds Debug e usa incremento de
  `versionCode` para o Android aceitar a atualização.

### Correções de manutenção do release

- Safari voltou a aparecer no inventário de apps: no macOS ele pode ser
  exposto como symlink para o Cryptex, e esse caso agora é reconhecido.
- O `ServerManager` agora preserva no `/tmp/lumen-server.log` cada tentativa
  de inicialização, incluindo caminhos ausentes, erros de `Process.run()` e
  encerramentos inesperados.
- Corrigido o banner no Android que continuava avisando sobre uma atualização
  do Mac mesmo quando o APK já estava na versão atual.
- Invalidado o cache antigo do Service Worker para que WebViews Android não
  continuem carregando a página anterior após a atualização.
- Isolada a leitura da versão do APK: se o bridge Android falhar, a página não
  cai no alerta de atualização do Mac.

### Distribuição

- Site atualizado para apontar para `v0.2.7` usando os links permanentes da
  release mais recente.
- Tutorial em slides atualizado para refletir o estado atual do projeto.
- Testes automatizados cobrindo os novos fluxos de gesto, ícones, PWA e
  atualização.

### Downloads

- [Dokke para macOS — DMG](https://github.com/felipenalves/Dokke/releases/download/v0.2.7/Dokke-macOS.dmg)
- [Dokke para Android — APK](https://github.com/felipenalves/Dokke/releases/download/v0.2.7/dokke.apk)

### Checksums SHA-256

```text
f020fb69d46cfc2d0ba03280df8092be7b3a6f7cb3078843c18920334ecd91bc  Dokke-macOS.dmg
4d1a61a65ba2df805adcbafaa195081fb40dec121a2e3cec61b83faa789cbb7f  dokke.apk
```

### Validação

- 126 testes automatizados passando.
- `git diff --check` sem problemas.
- DMG macOS reconstruída; APK Android mantido, pois não houve alteração nativa.
- Checksums SHA-256 publicados junto dos artefatos do GitHub Release.

Relate bugs e proponha melhorias nas
[Issues e Discussions](https://github.com/hribeirojob/Lumen/discussions) do
Lumen.
