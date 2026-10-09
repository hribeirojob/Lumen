// Gera docs/assets/lumen-iphone.png — a primeira imagem do README.
//
// Nao e foto de aparelho: sobe o server.js de verdade, abre a PWA real num
// chromium headless (o do Playwright, que ja e devDependency) no viewport de
// iPhone em paisagem e compoe o resultado dentro de uma moldura desenhada.
// Zero dep nova e regeneravel por um comando, como os outros geradores de
// tools/. Mas NAO com a mesma garantia deles, e a diferenca importa:
//
//   render-brand-icons.mjs / render-dmg-background.mjs
//       dependem so de SVG versionado -> mesmos bytes em qualquer maquina.
//   este script
//       REPRODUTIVEL NA MESMA MAQUINA, nao machine-independent.
//
// Por que: os icones do dock nao sao fixture, sao os de verdade. O servidor os
// extrai com sips sobre o .icns de cada app do /Applications local, e escolhe a
// aparencia lendo `defaults read -g AppleInterfaceStyle`. Entao o resultado
// acompanha quais apps a maquina tem, a arte deles na versao de macOS instalada
// e se o sistema esta em claro ou escuro — e o .icon-cache/ e populado a cada
// run. Dois runs seguidos aqui dao bytes identicos (conferido com cmp); o mesmo
// comando em outro Mac, nao.
//
// Isso e escolha, nao descuido: a alternativa seria versionar PNG de icone da
// Apple como fixture. Usar so app de stock do macOS mantem a variacao pequena.
// A mesma ressalva esta no docs/rebrand-art-audit.md.
//
//   node tools/render-readme-shot.mjs [--out <arquivo>] [--raw]
//
// --raw escreve tambem a captura da tela sem moldura, ao lado do destino.
//
// HOME temporario: o server resolve o dataDir por process.env.HOME e geraria
// .j5-pin e config.json. O padrao e o do support/isolated-home.mjs usado pelos
// testes — aqui so em versao local, porque isto e um script, nao um preload.
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0
  ? path.resolve(process.argv[outArg + 1])
  : path.join(root, "docs", "assets", "lumen-iphone.png");

// O Playwright resolve o registro de browsers pelo HOME no import, entao fixa o
// caminho real ANTES de trocar o HOME — senao o chromium "some".
const realHome = process.env.HOME || process.env.USERPROFILE || "";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && realHome){
  process.env.PLAYWRIGHT_BROWSERS_PATH = process.platform === "darwin"
    ? path.join(realHome, "Library", "Caches", "ms-playwright")
    : path.join(process.env.XDG_CACHE_HOME || path.join(realHome, ".cache"), "ms-playwright");
}
const home = mkdtempSync(path.join(tmpdir(), "lumen-readme-shot-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.APPDATA = path.join(home, "AppData", "Roaming");
process.env.LOCALAPPDATA = path.join(home, "AppData", "Local");
process.env.XDG_CONFIG_HOME = path.join(home, ".config");
process.env.XDG_DATA_HOME = path.join(home, ".local", "share");
const dropHome = () => { try { rmSync(home, { recursive: true, force: true }); } catch {} };
process.on("exit", dropHome);

// Imports depois da troca de HOME: server.js resolve o dataDir no import.
const { startServer } = await import("../server.js");
const { chromium } = await import("playwright");

// Dock de vitrine. So app de stock do macOS, que existe em qualquer Mac — o
// icone vem do iconService real do proprio servidor, nao de fixture. Dois
// atalhos entram para a imagem mostrar que o dock nao e so de aplicativo.
const PIECES = [
  { type: "app", name: "Safari" },
  { type: "app", name: "Calendar" },
  { type: "app", name: "Notes" },
  { type: "app", name: "Music" },
  { type: "shortcut", name: "Foco", emoji: "🎧" },
  { type: "app", name: "Photos" },
  { type: "app", name: "Maps" },
  { type: "shortcut", name: "Casa", emoji: "🏠" },
];

// iPhone em paisagem: 844x390 CSS a 2x = 1688x780 de captura.
const SCREEN = { w: 1688, h: 780, cssW: 844, cssH: 390, scale: 2 };
const FRAME = { w: 1826, h: 896 };
const SCREEN_X = Math.round((FRAME.w - SCREEN.w) / 2);
const SCREEN_Y = Math.round((FRAME.h - SCREEN.h) / 2);

function frameMarkup(dataUri){
  const { w, h } = FRAME;
  const r = 118;                 // raio do corpo
  const rim = 7;                 // espessura do aro metalico
  const screenR = 92;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <!-- Aro de titanio: claro o bastante para ler, escuro o bastante para o
         contorno nao sumir no fundo branco do README do GitHub. -->
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7E8696"/><stop offset=".18" stop-color="#4E5565"/>
      <stop offset=".5" stop-color="#AEB6C4"/><stop offset=".82" stop-color="#474E5D"/>
      <stop offset="1" stop-color="#737B8B"/>
    </linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#191C23"/><stop offset="1" stop-color="#0A0C10"/>
    </linearGradient>
    <clipPath id="screenClip">
      <rect x="${SCREEN_X}" y="${SCREEN_Y}" width="${SCREEN.w}" height="${SCREEN.h}" rx="${screenR}"/>
    </clipPath>
  </defs>

  <!-- botoes: volume na borda de cima, power na de baixo (aparelho deitado) -->
  <g fill="#9AA2B1">
    <rect x="470" y="-9" width="34" height="18" rx="7"/>
    <rect x="540" y="-9" width="62" height="18" rx="7"/>
    <rect x="636" y="-9" width="62" height="18" rx="7"/>
    <rect x="1140" y="${h - 9}" width="104" height="18" rx="7"/>
  </g>

  <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" fill="url(#rim)"/>
  <rect x="${rim}" y="${rim}" width="${w - rim * 2}" height="${h - rim * 2}" rx="${r - rim}" fill="url(#body)"/>
  <!-- linha escura separando aro e corpo: sem ela o metal derrete no preto -->
  <rect x="${rim}" y="${rim}" width="${w - rim * 2}" height="${h - rim * 2}" rx="${r - rim}"
        fill="none" stroke="rgba(0,0,0,.55)" stroke-width="2"/>

  <image x="${SCREEN_X}" y="${SCREEN_Y}" width="${SCREEN.w}" height="${SCREEN.h}"
         href="${dataUri}" clip-path="url(#screenClip)" preserveAspectRatio="none"/>

  <!-- Dynamic Island: deitado, fica na borda esquerda da tela -->
  <rect x="${SCREEN_X + 20}" y="${Math.round(h / 2) - 58}" width="27" height="116" rx="13.5" fill="#06070A"/>
  <circle cx="${SCREEN_X + 33.5}" cy="${Math.round(h / 2) + 36}" r="7" fill="#11141B"/>

  <!-- brilho do vidro, bem discreto -->
  <rect x="${SCREEN_X}" y="${SCREEN_Y}" width="${SCREEN.w}" height="${SCREEN.h}" rx="${screenR}"
        fill="none" stroke="rgba(255,255,255,.07)" stroke-width="2"/>
</svg>`;
}

const server = await startServer({
  port: 0,
  obs: null,
  config: { pieces: PIECES },          // config em memoria: nao escreve config.json
  appTools: {
    listAppProcesses: async () => [],  // nada "rodando": sem bolinha verde piscando
    listInstalledApps: async () => PIECES.filter(p => p.type === "app").map(p => ({ name: p.name, icon: true })),
  },
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: SCREEN.cssW, height: SCREEN.cssH },
    deviceScaleFactor: SCREEN.scale,
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    colorScheme: "dark",
    reducedMotion: "reduce",           // nada de animacao a meio caminho na captura
  });
  await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".launchpad .atile", { timeout: 20000 });
  // Espera os icones reais chegarem: enquanto nao chegam, o tile mostra monograma.
  await page.waitForFunction(
    n => document.querySelectorAll(".launchpad .atile img.aicon.ready").length >= n,
    PIECES.filter(p => p.type === "app").length,
    { timeout: 20000 },
  );
  // O toast "Connected" entra no load e some sozinho; sair agora deixaria um
  // balao a meio caminho no meio da imagem.
  await page.waitForFunction(() => {
    const el = document.getElementById("toast");
    return !el || !el.classList.contains("show");
  }, null, { timeout: 20000 });

  const shot = await page.screenshot({ type: "png", animations: "disabled" });
  await mkdir(path.dirname(OUT), { recursive: true });
  if (process.argv.includes("--raw")){
    await writeFile(OUT.replace(/\.png$/, "-raw.png"), shot);
  }

  const composer = await browser.newPage({ viewport: { width: FRAME.w, height: FRAME.h }, deviceScaleFactor: 1 });
  await composer.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>`
    + frameMarkup(`data:image/png;base64,${shot.toString("base64")}`),
    { waitUntil: "load" },
  );
  await writeFile(OUT, await composer.screenshot({ omitBackground: true, type: "png" }));
  console.log(`${OUT}  ${FRAME.w}x${FRAME.h}`);
} finally {
  await browser.close();
  await server.close();
}
