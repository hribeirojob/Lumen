# Lumen (Mac)

App nativo SwiftUI — **instala como `.app`**, não roda via `swift run`.

- **Sidebar** — Apps / Sobre navigation
- **Dock Grid** — apps fixados em grid 4×2 com Liquid Glass
- **App Picker** — busca e adiciona apps do macOS
- **Drag-to-reorder** — reordena apps no dock via drag-and-drop
- **Menu Bar** — ícone `square.grid.2x2`, status online/offline
- **Auto-start** — server sobe ao abrir o app
- **Atualizações** — verifica releases ao abrir, mostra as mudanças e instala o DMG com confirmação

## Instalar

```sh
cd mac
./install.sh          # → ~/Applications/Lumen.app
./install.sh --open   # instala e abre
./install.sh --system # → /Applications (opcional)
./package-dmg.sh      # gera um DMG com Lumen + atalho Aplicativos
```

Para gerar pacotes locais das duas arquiteturas em `mac/dist`, use nomes separados:

```sh
LUMEN_TARGET_ARCH=arm64 ./mac/package-dmg.sh
LUMEN_TARGET_ARCH=x86_64 LUMEN_NODE=/caminho/para/node-x86_64 ./mac/package-dmg.sh
```

O build Intel em um Mac Apple Silicon precisa de um runtime Node x86_64 disponível ou fornecido em `LUMEN_NODE`.

O servidor embutido copia uma allowlist fixa de `public/`: `index.html`,
`manifest.webmanifest`, `sw.js`, os ícones PWA, `version.json` e `lumen.apk`.
Backups ignorados (`*.bak`), logs e saídas locais não entram no `.app` nem no
DMG. A regressão pode ser executada com:

```sh
node --test --import ./support/isolated-home.mjs test/package-dmg.test.mjs
```

O `--import ./support/isolated-home.mjs` dá um `HOME` próprio a cada processo
de teste. O `npm test` já faz isso pelo script do `package.json`; qualquer
chamada direta a `node --test` precisa repeti-lo, senão os servidores de teste
disputam o mesmo `~/Library/Application Support/Lumen`.

### Builds de Mac em paralelo

`test/package-dmg.test.mjs` empacota seu próprio DMG, então disputa
`mac/.build` (lock do SwiftPM) e `mac/dist` com qualquer `./package-dmg.sh` ou
`install.sh` rodando ao mesmo tempo — a colisão aparece como
`Another instance of SwiftPM is already running` ou
`cp: mac/dist/Lumen.app: File exists`. Em quem não é job de build, pule o
fixture:

```sh
LUMEN_SKIP_DMG_FIXTURE=1 npm test
```

É o que os workflows de macOS fazem na suíte geral, validando o DMG depois, em
um passo só, via `LUMEN_DMG_FIXTURE`.

Depois: Launchpad / Spotlight → **Lumen**.

## Atualizar

Ao abrir, o Lumen consulta a release mais recente no GitHub. Quando há uma versão nova, um banner aparece em qualquer tela do app. **Mudanças** mostra as notas da release; **Baixar e instalar** baixa o DMG, valida o SHA-256 publicado pelo GitHub, substitui o app atual e reabre a versão nova.

O app precisa estar em uma pasta com permissão de escrita, normalmente `/Applications` ou `~/Applications`.

Pré-req: macOS 14+, Xcode CLT (`xcode-select --install`), server `node server.js` na pasta pai.

### Auditoria de dependências de build

`npm audit` e `npm audit --omit=dev` devem permanecer limpos. O builder usa
`hdiutil` e `ds-store` diretamente; `appdmg` e `image-size` não fazem mais
parte da árvore de dependências.

## Desinstalar

```sh
rm -rf ~/Applications/Lumen.app
```

## Estrutura

```
mac/Sources/
├── LumenApp.swift            # Entry point + MenuBarExtra
├── ContentView.swift       # NavigationSplitView + Sidebar + AboutView
├── DockGridView.swift      # Dock grid com Liquid Glass + drag-to-reorder
├── DockIcon.swift          # Ícone individual com hover + context menu
├── AppPickerSheet.swift    # Sheet de busca/adicionar apps
├── DockStore.swift         # Data model + API client + icon cache
└── ServerManager.swift     # Child process management do server
```
