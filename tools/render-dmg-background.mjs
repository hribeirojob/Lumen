// Rasteriza mac/dmg-background.svg para mac/dmg-background.png em 640x400.
// Usa o chromium do Playwright (ja e devDependency) — nada de rsvg/ImageMagick.
//   node tools/render-dmg-background.mjs [--out <dir>]
//
// O PNG e o que o Finder mostra como fundo da janela do DMG; o SVG e a fonte.
// Nunca editar o PNG na mao — os comentarios do SVG explicam as zonas que
// precisam ficar lisas (os dois icones de 96px e seus rotulos).
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : root;

// Tamanho da arte, nao da janela: write-dmg-ds-store.mjs abre 640x378 e os 22px
// de baixo ficam fora. Ver o comentario no topo do SVG.
const WIDTH = 640;
const HEIGHT = 400;
const SOURCE = path.join(root, "mac", "dmg-background.svg");
const TARGET = path.join(OUT, "mac", "dmg-background.png");

const markup = await readFile(SOURCE, "utf8");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  // omitBackground fica FALSE: este fundo e opaco de proposito (o Finder nao
  // compoe nada atras dele), ao contrario dos icones de marca.
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block}</style>${markup}`,
    { waitUntil: "load" },
  );
  const buf = await page.screenshot({ omitBackground: false, type: "png" });
  await mkdir(path.dirname(TARGET), { recursive: true });
  await writeFile(TARGET, buf);
  console.log(`${path.relative(root, TARGET) || TARGET}  ${WIDTH}x${HEIGHT}  ${buf.length} bytes`);
} finally {
  await browser.close();
}
