# Auditoria de arte binária — rebrand Dokke → Lumen

Status: **arte trocada em 2026-10-08** (task ART-3). Os 29 binários abaixo foram
reestampados a partir de `assets/branding/lumen-icon.svg` — o Halo roxo, conceito A,
escolhido pelo Hugo. Antes disso todo arquivo ainda tinha os bytes originais do Dokke.

Reproduzir: `node tools/render-brand-icons.mjs` (chromium do Playwright, que já é
devDependency — sem `rsvg-convert`, sem ImageMagick, sem dep nova). A saída é
determinística: rodar duas vezes dá os mesmos bytes. O `.icns` é o único passo
separado, porque depende do `iconutil` do macOS:

    node tools/render-brand-icons.mjs
    iconutil -c icns mac/AppIcon.iconset -o mac/AppIcon.icns

Legenda: ✅ trocado · ⬜ ainda com arte antiga.

## 1. macOS — ícone do app (prioridade máxima)

| Arquivo | Para que serve | Onde o usuário vê |
|---|---|---|
| ✅ `mac/AppIcon.icns` | Ícone legado do bundle; `mac/install.sh:219` copia para `Lumen.app/Contents/Resources/Lumen.icns` | Finder, Dock, Launchpad, Cmd+Tab, menu bar |
| ✅ `mac/AppIcon.iconset/*.png` (10 arquivos, 16→512@2x) | Fonte do `.icns` | idem acima |
| ✅ `assets/branding/lumen-icon/Lumen.icon/Assets/exec-*.png` | Arte do ícone moderno (`.icon`, Icon Composer); `mac/install.sh:227` usa este bundle | Ícone do app no macOS 26+, incluindo variantes claro/escuro/tinted |
| ✅ `assets/branding/lumen-icon/Icon-lumen-iOS-*-1024@1x.png` (6) | Exports das 6 aparências (Default, Dark, ClearLight, ClearDark, TintedLight, TintedDark) | Fonte de referência da identidade; alimenta os ícones acima |

## 2. macOS — instalador DMG

| Arquivo | Para que serve | Onde o usuário vê |
|---|---|---|
| ⬜ `mac/dmg-background.png` | Fundo da janela do DMG (`mac/package-dmg.sh:83`, `mac/write-dmg-ds-store.mjs:16`) | Primeira tela ao abrir o DMG baixado |
| ⬜ `mac/dmg-background.svg` | Fonte vetorial do PNG acima | — (origem) |

## 3. PWA / web app

| Arquivo | Para que serve | Onde o usuário vê |
|---|---|---|
| ✅ `public/icon-192.png` | Favicon + `apple-touch-icon` + ícone 192 do manifest | Aba do navegador; ícone na home screen do iPhone/Android |
| ✅ `public/icon-192-dark.png` | Favicon da variante escura (`public/index.html:13`) | Aba do navegador em tema escuro |
| ✅ `public/icon-512.png` | Ícone 512 `any maskable` do `manifest.webmanifest` | Splash screen e ícone do PWA instalado |
| ✅ `public/icon-dock-iOS-Default-1024@1x.png` | Master 1024 do ícone da PWA (validado em `test/brand-icon-assets.test.mjs:45`) | — (origem dos acima) |

## 4. Android — APK

| Arquivo | Para que serve | Onde o usuário vê |
|---|---|---|
| ✅ `android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` (5) | Ícone **legado** (API < 26) | Android 7 e anteriores |
| ✅ `.../mipmap-anydpi-v26/ic_launcher.xml` | Ícone **adaptativo** (API 26+); o manifest aponta `@mipmap/ic_launcher` e o Android prefere este | Gaveta de apps, home screen, recentes, notificações |
| ✅ `.../mipmap-*/ic_launcher_{background,foreground,monochrome}.png` (15) | Camadas do adaptativo, grade de 108dp | idem acima; `monochrome` alimenta o ícone temático do Android 13+ |

## 5. Site de documentação (docs/)

| Arquivo | Para que serve | Onde o usuário vê |
|---|---|---|
| ✅ `docs/public/lumen-favicon.png` | Favicon do site (`docs/index.html:8`, `tutorial-lumen.html:8`) | Aba do navegador no site |
| ✅ `docs/public/lumen-icon.png` | `apple-touch-icon` do site (`docs/index.html:9`) | Atalho do site na home screen |
| ✅ `docs/public/lumen-hero.webp` | Ícone grande da hero / capa do tutorial (`docs/src/main.js:8`, `tutorial-lumen.html:752`) | Topo da landing page e do tutorial |
| ⬜ `docs/assets/lumen-iphone.png` | Screenshot do app rodando num iPhone (`README.md:29`) | Primeira imagem do README no GitHub |

## Decisões tomadas na estampagem

**Os tamanhos pequenos não são downscale puro do 1024.** O núcleo branco é o que
faz o ícone ler em 16px, e num downscale direto ele cai para ~3,7px e o antialias
o apaga. Então 16/32/64 usam uma variante com núcleo e anel proporcionalmente
maiores (`smallScale()` no gerador) — mesma estrutura, outra proporção. O teto é
1,30x: testei 1,45x e 1,62x e nos dois o núcleo encosta no anel, o vão escuro
entre eles some e o ícone vira um borrão claro, que é exatamente o que o aumento
deveria evitar. Conferido olhando os PNGs de 16px, não no olho da fé.

**O foreground do Icon Composer sangra até a borda, em 1024×1024.** Sem fundo
escuro o bloom clareia o centro e núcleo e anel viram uma mancha só — a estrutura
depende do vão escuro. Em vez de um disco (que deixava os cantos a cargo do
`fill` e não resolvia o `scale`), o `exec-*.png` leva a placa sangrando: quem
arredonda é o próprio Icon Composer, e arredondar aqui arredondaria duas vezes.

O asset é **1024×1024 de propósito** — igual ao canvas de 1024pt do ícone. Com os
dois do mesmo tamanho, tanto faz se o Icon Composer mapeia pixel-a-ponto ou ajusta
ao canvas: as duas leituras dão o mesmo resultado, e por isso o transform em
`icon.json` é **identidade** (`scale: 1`, `translation: [0,0]`), sem constante
calibrada à mão. Enquanto o asset era 1254px, o `scale: 1.4` e o
`translation: [2.7, 32.47]` tinham sido ajustados contra a arte do Dokke (conteúdo
0,641 do canvas, centro 17px acima) e continuaram aplicados depois que a arte mudou
(Halo: 0,686, centrado) — o halo saía 7% maior e 3,2% baixo.

**O adaptativo do Android é a decomposição natural do Halo.** A placa virou o
*background* (sangra até a borda — existe para ser recortada pelo launcher) e o
halo virou o *foreground*, dimensionado pela zona segura. A arte 1:1 **não** cabe:
o anel tem raio externo 0,3262 do canvas contra 0,3056 da zona garantida de 66dp.
O foreground entra a **0,90** (anel em 0,2917, folga de 4,5%); 0,937 seria o fator
em que ele encosta exato na borda, e 0,85 encolheria 10% mais que o necessário.
Isso não era polimento: sem adaptativo, os launchers do Android 8+ aplicam
tratamento legado por conta própria e põem a placa escura sobre um fundo branco.

**As três identidades byte-a-byte foram preservadas** (`test/brand-icon-assets.test.mjs`
depende delas): `mac/AppIcon.iconset/icon_512x512.png` == `public/icon-512.png`;
`icon_512x512@2x.png` == `Icon-lumen-iOS-Default-1024@1x.png`;
`docs/public/lumen-icon.png` == `public/icon-512.png`.

## Pendências conhecidas

- **`fill` por aparência no `icon.json`.** O foreground é opaco e cobre o
  `fill: automatic`, então as aparências Clear/Tinted mostram a placa roxa em vez da
  composição do sistema. Resolver de verdade é tirar a placa do layer e declarar o
  gradiente no `fill` — não fiz porque não dá para conferir o schema nem o resultado
  sem o Icon Composer no macOS 26. Os 6 exports standalone de 1024 não passam por esse
  caminho e continuam corretos.
- `docs/assets/lumen-iphone.png` é um **screenshot**, não um ícone: só fica correto
  depois que a UI/arte da PWA mudar — refazer por último.
- `mac/dmg-background.png` / `.svg`: fundo do instalador, ainda com arte Dokke.
- Nenhum desses binários contém a string "Dokke"; o risco é puramente visual.
- `test/brand-icon-assets.test.mjs` passou a medir geometria em vez de travar sha256, e
  ganhou dois testes para o adaptativo (camadas declaradas + halo dentro da zona segura).
  Validados contra negativos: arte 1:1 reprova por estourar a zona, 0,70 reprova por
  encolher demais. Dono do arquivo é o Crivo — os dois testes novos estão prontos para ele
  assumir. `test/package-dmg.test.mjs` e `test/mac-icon-appearance.test.mjs` continuam verdes.
