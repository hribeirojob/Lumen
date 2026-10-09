# Auditoria de arte binária — rebrand Dokke → Lumen

Status: **arte trocada em 2026-10-08** (task ART-3). Os 47 binários marcados
abaixo foram reestampados com o Halo roxo (conceito A, escolhido pelo Hugo). Antes
disso todo arquivo ainda tinha os bytes originais do Dokke.

A fonte canônica da marca é o **gerador** (`tools/render-brand-icons.mjs`: as
constantes `G` e `SKINS`), não um arquivo de arte. `assets/branding/lumen-icon.svg`
é **saída** dele, não entrada — editar esse SVG à mão não tem efeito nenhum e seria
desfeito na próxima execução.

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
| ✅ `mac/dmg-background.png` | Fundo da janela do DMG (`mac/package-dmg.sh:83`, `mac/write-dmg-ds-store.mjs:16`) | Primeira tela ao abrir o DMG baixado |
| ✅ `mac/dmg-background.svg` | Fonte vetorial do PNG acima; gerado por `tools/render-dmg-background.mjs` | — (origem) |

## 3. PWA / web app

| Arquivo | Para que serve | Onde o usuário vê |
|---|---|---|
| ✅ `public/icon-192.png` | Favicon + `apple-touch-icon` + ícone 192 do manifest | Aba do navegador; ícone na home screen do iPhone/Android |
| ✅ `public/icon-192-dark.png` | Favicon da variante escura (`public/index.html:13`) | Aba do navegador em tema escuro |
| ✅ `public/icon-512.png` | Ícone 512 `any maskable` do `manifest.webmanifest` | Splash screen e ícone do PWA instalado |
| ✅ `public/icon-dock-iOS-Default-1024@1x.png` | Master 1024 do ícone da PWA (validado em `test/brand-icon-assets.test.mjs:79`) | — (origem dos acima) |

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
| ✅ `docs/public/lumen-hero.webp` | Ícone grande da hero / capa do tutorial (`docs/src/main.js:8`, `tutorial-lumen.html:754`) | Topo da landing page e do tutorial |
| ✅ `docs/assets/lumen-iphone.png` | Abertura do README (`README.md:29`); render da PWA real emoldurado, por `tools/render-readme-shot.mjs` | Primeira imagem do README no GitHub |

## Decisões tomadas na estampagem

**Os tamanhos pequenos não são downscale puro do 1024.** O núcleo branco é o que
faz o ícone ler em 16px, e num downscale direto ele cai para ~3,7px e o antialias
o apaga. Então 16/32/64 usam uma variante com núcleo e anel proporcionalmente
maiores (`smallScale()` no gerador) — mesma estrutura, outra proporção. O teto é
1,30x: testei 1,45x e 1,62x e nos dois o núcleo encosta no anel, o vão escuro
entre eles some e o ícone vira um borrão claro, que é exatamente o que o aumento
deveria evitar. Conferido olhando os PNGs de 16px, não no olho da fé.

**O layer do Icon Composer é só a marca, com alpha — a placa vive no `fill`.**
Essa é a autoria correta do formato `.icon`: o fundo é declarado no `fill` do
`icon.json` (`linear-gradient` de #3A0B4F → #140720, as cores de
`LumenTheme.canvas` e `.page`) e o layer carrega apenas bloom, anel e núcleo
sobre transparência. O vão escuro entre núcleo e anel aparece porque o `fill`
está atrás, não porque haja placa assada na imagem.

⚠️ **Não asse a placa dentro do layer.** É o "conserto óbvio" de quem vê o Dark
sem roxo (ver a seção do Dark abaixo), e já aconteceu duas vezes neste projeto.
O custo é invisível no Default — fica pixel-idêntico — e silencioso: Clear e
Tinted viram laje chapada recolorida. `test/brand-icon-assets.test.mjs` trava
isso medindo o alpha da borda do layer; num teste de mutação esse foi o **único**
dos cinco asserts do documento que reprovou a regressão, os outros quatro
passaram. Não "simplifique" esse assert.

O asset é **1024×1024 de propósito** — igual ao canvas de 1024pt do ícone. Com os
dois do mesmo tamanho, tanto faz se o Icon Composer mapeia pixel-a-ponto ou ajusta
ao canvas: as duas leituras dão o mesmo resultado, e por isso o transform é
**identidade** (`scale: 1`, `translation: [0,0]`), sem constante calibrada à mão.
Enquanto o asset era 1254px, o `scale: 1.4` e o `translation: [2.7, 32.47]` tinham
sido ajustados contra a arte do Dokke (conteúdo 0,641 do canvas, centro 17px acima)
e continuaram aplicados depois que a arte mudou (Halo: 0,686, centrado) — o halo
saía 7% maior e 3,2% baixo.

**O adaptativo do Android é a decomposição natural do Halo.** A placa virou o
*background* (sangra até a borda — existe para ser recortada pelo launcher) e o
halo virou o *foreground*, dimensionado pela zona segura. A arte 1:1 **não** cabe:
o anel tem raio externo 0,3262 do canvas contra 0,3056 da zona garantida de 66dp.
O foreground entra a **0,90**; 0,937 seria o fator
em que ele encosta exato na borda, e 0,85 encolheria 10% mais que o necessário.
O anel medido nas cinco densidades fica entre **0,2870 e 0,2963** conforme onde se
corta o antialias — não exatamente no 0,2936 teórico, porque `smallScale()` engorda
o anel 3% abaixo de 128px (o mdpi, de 108px, fica *acima* do teórico). Pior caso
0,2963 contra zona segura 0,3056: 3% de folga, nenhuma densidade corta.
Isso não era polimento: sem adaptativo, os launchers do Android 8+ aplicam
tratamento legado por conta própria e põem a placa escura sobre um fundo branco.

**As três identidades byte-a-byte foram preservadas** (`test/brand-icon-assets.test.mjs`
depende delas): `mac/AppIcon.iconset/icon_512x512.png` == `public/icon-512.png`;
`icon_512x512@2x.png` == `Icon-lumen-iOS-Default-1024@1x.png`;
`docs/public/lumen-icon.png` == `public/icon-512.png`.

**O fundo do DMG é claro, e isso resolve metade do problema — a outra metade
fica em aberto.** O Finder desenha o nome do ícone com a cor do sistema, que uma
imagem de fundo estática não acompanha. Medido via AppKit (`NSColor.labelColor`):
tema claro = preto a 85%, tema escuro = branco a 85%. Contra a faixa do rótulo da
arte nova (y 262–292, média 253,250,254):

| rótulo | contraste |
|---|---|
| preto (tema claro) | 20,3:1 |
| branco (tema escuro) | **1,04:1 — invisível** |

Ou seja: arte clara não resolve o problema, escolhe qual metade da base quebra.
Inverter para escuro só trocaria de vítima. Isso é **herdado, não regressão** — o
fundo do Dokke era #f5f5f7 e tinha exatamente o mesmo buraco.

O que decide e **ainda não foi verificado**: se o Finder desenha algum backdrop
atrás do rótulo em icon view no tema escuro. Se desenha, não há nada a fazer; se
não desenha, o conserto é uma pastilha clara só nas duas faixas de rótulo (que já
são lisas de propósito), não inverter a arte. Fechar isso exige montar o DMG com o
Mac em tema escuro e olhar — medir cor não prova ausência de backdrop. Por isso a arte nova é um wash
lavanda (#F7F0FC → branco) com o bloom do Halo atrás da seta, e não a placa
escura da marca. As faixas onde o Finder desenha ícone e rótulo (x 110–230 e
x 510–630 até y≈295, ícones de 96px em 170,210 e 570,210) ficam lisas de
propósito — toda a identidade vive no vão entre os dois ícones.

**O shot do README é render da PWA real, não foto de aparelho.** `tools/
render-readme-shot.mjs` sobe o servidor num HOME temporário, abre a PWA num
chromium no viewport de iPhone em paisagem e compõe numa moldura desenhada em
SVG. Os ícones vêm do iconService do próprio servidor, então a imagem mostra o
produto de verdade. Limite declarado: o determinismo é **por máquina** — os
ícones saem do `/Applications` de quem roda, então outro Mac gera bytes
diferentes. Por isso nenhum teste trava hash dessa imagem.

**A aparência Dark do ícone não é roxa, e isso é do formato.** O `icon.json`
declara a placa no `fill` (`linear-gradient` de #3A0B4F → #140720) e o layer é
só a marca, com alpha — que é a autoria correta do `.icon`. Medido com o
`ictool` (dentro do Icon Composer.app): a rendition **Dark ignora o `fill` por
completo** e usa material escuro do sistema, qualquer que seja o tipo de fill.
Não é compromisso nosso: todo app recebe material do sistema nessa aparência.

A tentação é reassar a placa dentro do layer para "consertar" o Dark. Medimos:
isso mata a marca — no Dark o brilho do halo vem do backdrop do sistema
atravessando o material, e uma placa opaca atrás derruba o núcleo de 0.92 para
0.14 de luminância. Como o núcleo já é branco na fonte, nenhuma arte mais clara
resolve. E custaria Clear/Tinted virarem laje chapada. O estado atual mantém a
marca legível em 6/6 aparências; só a placa do Dark é do sistema.

Duas limitações do formato, confirmadas e não contornáveis: o `fill` **não
aceita radial** (o parser enumera `orientation`, `solid`, `linear-gradient`,
`automatic-gradient`; três sintaxes radiais plausíveis foram rejeitadas), então
a composição do `.icon` é linear enquanto os 6 exports standalone continuam
radiais; e `fill-specializations` é **ignorado em silêncio** — o parser descarta
chave desconhecida de topo sem erro, então "não deu erro" nunca prova que
funcionou ali.

## Pendências conhecidas

- ~~`actool` quebrado~~ **resolvido em 2026-10-09.** Ele falhava na inicialização
  até em `actool --version` ("A required plugin failed to load" / "ibtoold failed
  IDE initialization"), e com isso `mac/install.sh` caía no fallback do `.icns`
  legado — o ícone adaptativo nunca chegava a compilar. O conserto é
  `xcodebuild -runFirstLaunch`, e **não precisa de sudo**: roda como usuário comum
  (a mensagem de erro não diz isso, e a suposição de que exigia admin custou um
  dia). Validado depois disso: o documento compila sem erro nem warning, e o
  `Assets.car` resultante traz `NSAppearanceNameAqua`, `NSAppearanceNameDarkAqua`
  e `ISAppearanceTintable`, mais duas entradas `Named Gradient` — que é o nosso
  `fill` atravessando o compilador da Apple. A suíte continua sem depender de
  `actool` de propósito.
- Toda a arte binária do Dokke foi substituída. Nenhum binário continha a string
  "Dokke"; o risco era puramente visual e está fechado.
- `test/brand-icon-assets.test.mjs` passou a medir geometria em vez de travar sha256, e
  ganhou dois testes para o adaptativo (camadas declaradas + halo dentro da zona segura).
  Validados contra negativos: arte 1:1 reprova por estourar a zona, 0,70 reprova por
  encolher demais. O Crivo assumiu o arquivo e acrescentou o contrato do documento
  Icon Composer; `test/brand-art-pixels.test.mjs` (novo) mede o fundo do DMG e o shot
  do README sem precisar montar o DMG, fechando a lacuna de a arte só ser verificada
  com o fixture ligado. Suíte: **494 testes, 494 pass, 0 fail, 0 skip**.
