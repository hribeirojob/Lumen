// Rasteriza assets/branding/lumen-icon.svg nos tamanhos exatos de cada alvo.
// Usa o chromium do Playwright (ja e devDependency) — nada de rsvg/ImageMagick.
//   node tools/render-brand-icons.mjs [--out <dir>] [--check]
// --check escreve tambem _check/ com o recorte circular do adaptativo Android.
import { chromium } from "playwright";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : root;

// Geometria do Halo, em unidades do viewBox 1024. Fonte: assets/branding/lumen-icon.svg.
const G = { plate: 32, plateSize: 960, radius: 216, bloom: 338, ring: 282, ringW: 104, core: 120 };

// Paletas por aparencia. Default/Dark vem da nota palette-lumen; Clear e Tinted
// sao as aparencias monocromaticas do Icon Composer.
const SKINS = {
  Default:     { p0:"#3A0B4F", p1:"#140720", edge:"#70288E", bloom:"#D9A8EC", ring:"#AD56D3", c0:"#FFFFFF", c1:"#F0DCFA" },
  Dark:        { p0:"#2A0739", p1:"#0B0412", edge:"#501669", bloom:"#C68EDF", ring:"#8F3DAF", c0:"#FFFFFF", c1:"#EBD2F7" },
  ClearLight:  { p0:"#EDEDEF", p1:"#D2D2D6", edge:"#B6B6BC", bloom:"#FFFFFF", ring:"#8A8A90", c0:"#FFFFFF", c1:"#F2F2F4" },
  ClearDark:   { p0:"#4A4A4F", p1:"#1D1D20", edge:"#6E6E74", bloom:"#D8D8DC", ring:"#AFAFB5", c0:"#FFFFFF", c1:"#EDEDEF" },
  TintedLight: { p0:"#DCCBEA", p1:"#B79AD0", edge:"#9A78BA", bloom:"#FFFFFF", ring:"#7B55A0", c0:"#FFFFFF", c1:"#F4ECFA" },
  TintedDark:  { p0:"#2E1340", p1:"#150A1E", edge:"#4C2566", bloom:"#C9A3DE", ring:"#9A62BE", c0:"#FFFFFF", c1:"#EEDCF8" },
};

// O nucleo branco e o ponto de luz que faz o icone ler em 16px. Num downscale
// direto de 1024 ele cai para ~3.7px e o antialias o apaga, entao os tamanhos
// pequenos usam uma variante com nucleo e anel proporcionalmente maiores. A
// estrutura (placa + bloom + anel + nucleo) e a mesma, so a proporcao muda.
//
// Os fatores foram escolhidos olhando os 16px renderizados, nao chutados:
// 1.62x e 1.45x engordam tanto o nucleo que ele encosta no anel e o vao escuro
// entre os dois some — vira borrao claro, que e exatamente o que se quer evitar.
// 1.30x e o maior fator que ainda preserva o vao, entao e o teto.
function smallScale(size){
  if (size >= 128) return { core: 1, ring: 1 };
  if (size >= 64)  return { core: 1.12, ring: 1.03 };
  if (size >= 32)  return { core: 1.22, ring: 1.06 };
  return { core: 1.30, ring: 1.08 };
}

// plate:
//   "rounded" placa com canto arredondado — alvo que NAO aplica mascara propria
//             (PWA, iconset, launcher legado do Android).
//   "bleed"   placa sangrando ate a borda, sem arredondar — alvo que aplica a
//             PROPRIA mascara (foreground do Icon Composer, background adaptativo
//             do Android). Arredondar aqui arredondaria duas vezes.
//   "none"    so o halo, fundo transparente (foreground adaptativo do Android,
//             onde o fundo vem da camada de tras).
// layer "mono": silhueta de cor unica para o icone tematico do Android 13+. Sem
//   bloom de proposito — o sistema pinta por alpha, e o gradiente do bloom vira
//   um borrao cinza em vez de glow.
function svg({ skin = "Default", size, plate = "rounded", scale = 1, layer = "full" } = {}){
  const s = SKINS[skin];
  const k = smallScale(size);
  const core = Math.round(G.core * k.core);
  const ringW = Math.round(G.ringW * k.ring);
  const plateLayer = plate === "rounded" ? `
  <rect x="${G.plate}" y="${G.plate}" width="${G.plateSize}" height="${G.plateSize}" rx="${G.radius}" fill="url(#la-plate)"/>
  <rect x="35" y="35" width="954" height="954" rx="213" fill="none" stroke="${s.edge}" stroke-width="6" opacity="0.55"/>`
    : plate === "bleed" ? `
  <rect x="0" y="0" width="1024" height="1024" fill="url(#la-plate)"/>` : "";
  // escala em torno do centro: usada para o halo caber na zona segura do Android.
  const open = scale === 1 ? "" : `<g transform="translate(512,512) scale(${scale}) translate(-512,-512)">`;
  const close = scale === 1 ? "" : "</g>";
  const halo = layer === "mono" ? `
  <circle cx="512" cy="512" r="${G.ring}" fill="none" stroke="#FFFFFF" stroke-width="${ringW}"/>
  <circle cx="512" cy="512" r="${core}" fill="#FFFFFF"/>` : `
  <circle cx="512" cy="512" r="${G.bloom}" fill="url(#la-bloom)"/>
  <circle cx="512" cy="512" r="${G.ring}" fill="none" stroke="${s.ring}" stroke-width="${ringW}"/>
  <circle cx="512" cy="512" r="${core}" fill="url(#la-core)"/>`;
  const haloLayer = layer === "none" ? "" : `${open}${halo}${close}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">
  <defs>
    <radialGradient id="la-plate" cx="50%" cy="36%" r="80%">
      <stop offset="0" stop-color="${s.p0}"/><stop offset="1" stop-color="${s.p1}"/>
    </radialGradient>
    <radialGradient id="la-bloom" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${s.bloom}" stop-opacity="0.55"/>
      <stop offset="0.45" stop-color="${s.ring}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${s.ring}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="la-core" cx="42%" cy="36%" r="72%">
      <stop offset="0" stop-color="${s.c0}"/><stop offset="1" stop-color="${s.c1}"/>
    </radialGradient>
  </defs>${plateLayer}${haloLayer}
</svg>`;
}

async function shoot(page, markup, size, type = "png"){
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${markup}`,
    { waitUntil: "load" },
  );
  return page.screenshot({ omitBackground: true, type, ...(type === "webp" ? { quality: 92 } : {}) });
}

const write = async (rel, buf) => {
  const dest = path.join(OUT, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return dest;
};

const ICONSET = [
  ["icon_16x16.png", 16], ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32], ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128], ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256], ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512], ["icon_512x512@2x.png", 1024],
];
const ANDROID = [["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192]];

// Icone adaptativo: as camadas sao 108dp (vs 48dp do legado), entao a tabela de
// densidade e outra. A mascara do launcher mostra 72dp e so 66dp sao garantidos.
const ANDROID_ADAPTIVE = [["mdpi", 108], ["hdpi", 162], ["xhdpi", 216], ["xxhdpi", 324], ["xxxhdpi", 432]];

// O anel do Halo tem raio externo (282 + 104/2)/1024 = 0.3262 do canvas. A zona
// segura do adaptativo e 66/108/2 = 0.3056. A arte 1:1 NAO cabe: o anel passa
// 6.7% da zona e o launcher corta. 0.937 e o fator em que o anel encosta exato na
// borda; 0.90 poe o anel em 0.2936 e deixa folga real sem encolher o icone a toa.
const ADAPTIVE_SCALE = 0.90;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const made = [];
const put = async (rel, buf) => { made.push(rel); return write(rel, buf); };

try {
  // ---- masters 1024 das 6 aparencias ----
  const masters = {};
  for (const skin of Object.keys(SKINS)){
    masters[skin] = await shoot(page, svg({ skin, size: 1024 }), 1024);
    await put(`assets/branding/lumen-icon/Icon-lumen-iOS-${skin}-1024@1x.png`, masters[skin]);
  }

  // ---- foreground do Icon Composer ----
  // 1024 e NAO 1254: o canvas do icone e 1024pt, e com o asset no mesmo tamanho
  // nao importa se o Icon Composer mapeia pixel-a-ponto ou ajusta ao canvas — as
  // duas leituras dao o mesmo resultado. Por isso o transform em icon.json pode
  // ser identidade (scale 1, translation 0,0), sem constante calibrada a mao.
  // Placa sangrando: quem arredonda e o proprio Icon Composer.
  await put("assets/branding/lumen-icon/Lumen.icon/Assets/exec-ec4df0b2-9e7a-491c-bf6b-ca9c2a65f8e0.png",
    await shoot(page, svg({ size: 1024, plate: "bleed" }), 1024));

  // ---- PWA ----
  const i512 = await shoot(page, svg({ size: 512 }), 512);
  await put("public/icon-512.png", i512);
  await put("public/icon-192.png", await shoot(page, svg({ size: 192 }), 192));
  await put("public/icon-192-dark.png", await shoot(page, svg({ skin: "Dark", size: 192 }), 192));
  await put("public/icon-dock-iOS-Default-1024@1x.png", masters.Default);

  // ---- macOS iconset (icon_512 e icon_512@2x precisam bater byte a byte) ----
  for (const [name, size] of ICONSET){
    if (name === "icon_512x512.png") { await put(`mac/AppIcon.iconset/${name}`, i512); continue; }
    if (name === "icon_512x512@2x.png") { await put(`mac/AppIcon.iconset/${name}`, masters.Default); continue; }
    await put(`mac/AppIcon.iconset/${name}`, await shoot(page, svg({ size }), size));
  }

  // ---- Android ----
  for (const [dpi, size] of ANDROID){
    await put(`android/app/src/main/res/mipmap-${dpi}/ic_launcher.png`, await shoot(page, svg({ size }), size));
  }

  // ---- Android adaptativo (API 26+) ----
  // Decomposicao natural do Halo: a placa e o background (existe para ser cortada
  // pela mascara, por isso sangra) e o halo e o foreground (dimensionado pela
  // zona segura). Nada e "encolhido para caber" — cada camada faz o seu papel.
  for (const [dpi, size] of ANDROID_ADAPTIVE){
    const dir = `android/app/src/main/res/mipmap-${dpi}`;
    await put(`${dir}/ic_launcher_background.png`,
      await shoot(page, svg({ size, plate: "bleed", layer: "none" }), size));
    await put(`${dir}/ic_launcher_foreground.png`,
      await shoot(page, svg({ size, plate: "none", scale: ADAPTIVE_SCALE }), size));
    await put(`${dir}/ic_launcher_monochrome.png`,
      await shoot(page, svg({ size, plate: "none", scale: ADAPTIVE_SCALE, layer: "mono" }), size));
  }

  // ---- docs ----
  await put("docs/public/lumen-icon.png", i512);
  await put("docs/public/lumen-favicon.png", await shoot(page, svg({ size: 64 }), 64));
  await put("docs/public/lumen-hero.webp", await shoot(page, svg({ size: 512 }), 512, "webp"));

  // ---- conferencia da zona segura do adaptativo Android (so com --check) ----
  if (process.argv.includes("--check")) await put("_check/android-circular-mask.png", await shoot(page, `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="512" height="512">
      <defs><clipPath id="m"><circle cx="512" cy="512" r="368"/></clipPath></defs>
      <g clip-path="url(#m)">${svg({ size: 1024 }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>
    </svg>`, 512));
} finally {
  await browser.close();
}
console.log(made.join("\n"));
console.log(`\n${made.length} arquivos em ${OUT}`);
