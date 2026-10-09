# AGENTS.md — Lumen

Estas regras complementam o `AGENTS.md` do repositório pai. O Lumen é um
repositório aninhado e tem ciclo próprio de teste, release e publicação.

## Escopo

- O Lumen é o dock que roda um servidor Node no Mac e entrega a PWA/APK para
  Android, iPhone e navegador na rede local.
- O Mac é o host; não transformar o J5 em daemon do Lumen nem deixar serviço
  permanente no Mac fora do fluxo existente do app.
- Não misturar commits deste repositório com o monorepo pai.

## Desenvolvimento e verificação

- Trabalhar em `develop`; `main` é reservado para release.
- Transferências para `main` acontecem por PR autorizado; o trabalho normal
  permanece em `develop`.
- Após mudanças Node/PWA, rodar `npm test`.
- Rodar a suíte sempre por `npm test`, nunca por `node --test` direto. O script
  carrega `--import ./support/isolated-home.mjs`, que dá a cada processo de
  teste um `HOME` temporário próprio. Sem esse preload, `startServer()` resolve
  `userDataDir()` para o `~/Library/Application Support/Lumen` real da máquina:
  os testes passam a ler e escrever o `config.json`, o `.j5-pin` e as sessões
  de quem está rodando, e os ~45 processos paralelos disputam os mesmos
  arquivos. `test/home-isolation-guard.test.mjs` falha alto quando o preload
  está ausente.
- Para rodar um arquivo isolado, repetir o preload na mão — a guarda não é
  coletada nesse caso e o vazamento passaria despercebido:
  `node --test --import ./support/isolated-home.mjs test/ui.test.mjs`.
- Após mudanças Swift/macOS, rodar `npm test` e `cd mac && swift build`.
- Testes de contrato que leem Swift comprovam estrutura; não substituem
  inspeção visual renderizada quando a tarefa for visual.
- Alterações Android devem ser verificadas no dispositivo real quando o
  comportamento depender de WebView, teclado, viewport, ADB ou descoberta.
- Não aumentar timeout nem alterar expectativa para esconder falha: investigar
  a causa e manter o teste focado no contrato real.

## Segurança e release

- Nunca commitar PIN real, token, senha, keystore ou credencial de instalação.
- Não editar `SECURITY.md` para resolver uma tarefa comum.
- Não publicar APK Debug. Release exige validação do DMG montado, assinatura
  do APK, checksums e `npm audit` conforme o fluxo existente.
- O mínimo de release é: `npm test`; `cd mac && swift build -c release
  --product Lumen`; `cd mac && ./package-dmg.sh`; e, para Android, `cd
  android && ./gradlew assembleRelease` com os quatro valores de assinatura
  externos documentados em `android/README.md`. Conferir o APK com
  `keytool -printcert -jarfile public/lumen.apk` e publicar SHA-256 dos
  artefatos entregues.
- Em macOS, `npm test` pode recriar artefatos em `mac/dist`; revisar o diff
  antes de finalizar e separar artefatos locais de alterações do produto.
- Não fazer commit, push, PR, deploy ou release sem pedido explícito do mantenedor.
- Preservar alterações de outros agentes; revisar `git status` antes de editar
  e commitar somente o conjunto autorizado.
