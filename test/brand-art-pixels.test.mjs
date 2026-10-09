import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Arte de marca medida por PIXEL, não por hash nem por regex no fonte.
//
// Um literal de cor (`#f5f5f7` ontem, `#8F3DAF` hoje) só responde "mudou?": não
// distingue a arte certa de um retângulo roxo, e cobra atualização a cada mexida.
// Aqui o que é verificado é o que o usuário vê — geometria, faixas livres,
// direção da seta, contraste — e as cores são ancoradas na escala Lumen lida da
// fonte única, nunca digitadas de novo.
//
// Nada aqui depende do DMG montado: este arquivo roda em qualquer máquina e em
// qualquer CI. O que exige montagem ficou em package-dmg.test.mjs.

const TINTA = 0.75; // abaixo disso o pixel é traço, não fundo

const DMG = "mac/dmg-background.png";
const DMG_SVG = "mac/dmg-background.svg";
const SHOT = "docs/assets/lumen-iphone.png";

// A janela do DMG é 640x378 e a arte é 640x400 (mac/write-dmg-ds-store.mjs):
// os 22px de baixo ficam fora da janela.
const ARTE = { largura: 640, altura: 400 };
const JANELA_ALTURA = 378;
// Ícones de 96px centrados em (170,210) e (570,210), com rótulo abaixo: o Finder
// desenha ícone e nome nessas faixas, então a arte precisa deixá-las lisas.
const FAIXAS = { esquerda: [110, 230], direita: [510, 630], ate: 295 };
const EIXO_DOS_ICONES = 210;

let browser;
let dmg;
let dmgSvg;
let shot;

function corDaEscala(nome) {
  const theme = readFileSync(path.join(root, "mac", "Sources", "LumenTheme.swift"), "utf8");
  const m = theme.match(new RegExp(`static let ${nome} = Color\\(red: ([\\d.]+), green: ([\\d.]+), blue: ([\\d.]+)\\)`));
  assert.ok(m, `LumenTheme.${nome} precisa existir para ancorar a cor da arte`);
  return m.slice(1, 4).map(v => Math.round(Number(v) * 255));
}

function luminancia([r, g, b]) {
  const linear = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

const perto = (a, b, folga) => a.every((c, i) => Math.abs(c - b[i]) <= folga);

async function medir(page, arquivo, analise, args, mime = "image/png") {
  const b64 = readFileSync(path.join(root, arquivo)).toString("base64");
  return page.evaluate(async ([b64, fonte, args, mime]) => {
    const img = new Image();
    img.src = `data:${mime};base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const dados = ctx.getImageData(0, 0, img.width, img.height).data;
    const px = (x, y) => {
      const i = (y * img.width + x) * 4;
      return [dados[i], dados[i + 1], dados[i + 2], dados[i + 3]];
    };
    const luz = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // eslint-disable-next-line no-new-func
    return new Function("px", "luz", "w", "h", "args", fonte)(px, luz, img.width, img.height, args);
  }, [b64, `return (${analise.toString()})(px, luz, w, h, args);`, args, mime]);
}

const analiseDmg = (px, luz, w, h, { TINTA, FAIXAS, JANELA_ALTURA }) => {
  const ehTinta = (x, y) => luz(px(x, y)) < TINTA;
  let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0;
  const cores = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!ehTinta(x, y)) continue;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const k = px(x, y).slice(0, 3).join(",");
      cores.set(k, (cores.get(k) || 0) + 1);
    }
  }
  const coluna = x => { let c = 0; for (let y = 0; y < h; y++) if (ehTinta(x, y)) c++; return c; };
  // altura máxima do traço em cada ponta: uma coluna só cai no bico e mede de menos
  const maiorColuna = (xa, xb) => { let m = 0; for (let x = xa; x <= xb; x++) m = Math.max(m, coluna(x)); return m; };
  const regiao = (xa, xb, ya, yb) => {
    let lo = 1, hi = 0, tinta = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const l = luz(px(x, y));
      if (l < lo) lo = l;
      if (l > hi) hi = l;
      if (l < TINTA) tinta++;
    }
    return { lo, hi, tinta };
  };
  // fundo imediatamente ao redor da seta, sem contar a seta
  const fundo = new Map();
  for (let y = Math.max(0, y0 - 40); y < Math.min(h, y1 + 40); y++) {
    for (let x = Math.max(0, x0 - 40); x < Math.min(w, x1 + 40); x++) {
      if (ehTinta(x, y)) continue;
      const k = px(x, y).slice(0, 3).join(",");
      fundo.set(k, (fundo.get(k) || 0) + 1);
    }
  }
  // arte degenerada (tudo traço ou tudo fundo) deixa um dos mapas vazio: devolve
  // null para o teste reprovar com mensagem, em vez de estourar na medição
  const moda = mapa => {
    const topo = [...mapa.entries()].sort((a, b) => b[1] - a[1])[0];
    return topo ? topo[0].split(",").map(Number) : null;
  };
  return {
    w, h,
    tinta: { x0, x1, y0, y1, n },
    corDaTinta: moda(cores),
    corDoFundoLocal: moda(fundo),
    colunaEsquerda: maiorColuna(x0, x0 + Math.round((x1 - x0) * 0.25)),
    colunaDireita: maiorColuna(x1 - Math.round((x1 - x0) * 0.25), x1),
    faixaEsquerda: regiao(FAIXAS.esquerda[0], FAIXAS.esquerda[1], 0, FAIXAS.ate),
    faixaDireita: regiao(FAIXAS.direita[0], FAIXAS.direita[1], 0, FAIXAS.ate),
    foraDaJanela: regiao(0, w, JANELA_ALTURA, h),
  };
};

const analiseShot = (px, luz, w, h) => {
  const x0 = Math.round(w * 0.2), x1 = Math.round(w * 0.8);
  const y0 = Math.round(h * 0.2), y1 = Math.round(h * 0.8);
  const amostras = [];
  const distintas = new Set();
  let claros = 0, total = 0;
  const soma = [0, 0, 0];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const p = px(x, y);
      total++;
      distintas.add(p.slice(0, 3).join(","));
      soma[0] += p[0]; soma[1] += p[1]; soma[2] += p[2];
      if (luz(p) > 0.5) claros++;
      amostras.push([luz(p), p[0], p[1], p[2]]);
    }
  }
  amostras.sort((a, b) => a[0] - b[0]);
  const decil = amostras.slice(0, Math.max(1, Math.floor(amostras.length * 0.1)));
  const mediana = i => decil.map(a => a[i]).sort((a, b) => a - b)[Math.floor(decil.length / 2)];
  return {
    w, h,
    cantos: [px(2, 2), px(w - 3, 2), px(2, h - 3), px(w - 3, h - 3)],
    fracaoDeClaros: claros / total,
    coresDistintas: distintas.size,
    media: soma.map(c => Math.round(c / total)),
    fundoDaTela: [mediana(1), mediana(2), mediana(3)],
  };
};

before(async () => {
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  dmg = await medir(page, DMG, analiseDmg, { TINTA, FAIXAS, JANELA_ALTURA });
  dmgSvg = await medir(page, DMG_SVG, analiseDmg, { TINTA, FAIXAS, JANELA_ALTURA }, "image/svg+xml");
  shot = await medir(page, SHOT, analiseShot, {});
});

after(async () => { if (browser) await browser.close(); });

// ---------- fundo do DMG ----------

test("a arte do DMG cobre a janela e não esconde nada fora dela", () => {
  assert.deepEqual({ largura: dmg.w, altura: dmg.h }, ARTE);
  assert.equal(dmg.foraDaJanela.tinta, 0,
    `${dmg.foraDaJanela.tinta}px de traço abaixo de y=${JANELA_ALTURA}: a janela do DMG corta aí`);
  assert.ok(dmg.foraDaJanela.hi - dmg.foraDaJanela.lo <= 0.05,
    "a faixa cortada pela janela precisa ser lisa, senão a arte parece truncada");
});

test("as faixas dos ícones ficam lisas para o Finder desenhar por cima", () => {
  for (const [nome, faixa] of [["esquerda", dmg.faixaEsquerda], ["direita", dmg.faixaDireita]]) {
    assert.equal(faixa.tinta, 0,
      `faixa ${nome}: ${faixa.tinta}px de traço onde o Finder desenha ícone e rótulo`);
    assert.ok(faixa.hi - faixa.lo <= 0.1,
      `faixa ${nome}: variação de ${(faixa.hi - faixa.lo).toFixed(3)} compete com o ícone`);
  }
});

test("a seta vive no vão entre os ícones e aponta para Applications", () => {
  assert.ok(dmg.tinta.n > 0, "nenhum traço encontrado: a arte perdeu a seta");
  assert.ok(dmg.tinta.x0 > FAIXAS.esquerda[1],
    `a seta começa em x=${dmg.tinta.x0} e invade a faixa do Lumen.app (até ${FAIXAS.esquerda[1]})`);
  assert.ok(dmg.tinta.x1 < FAIXAS.direita[0],
    `a seta termina em x=${dmg.tinta.x1} e invade a faixa do Applications (de ${FAIXAS.direita[0]})`);

  const eixo = (dmg.tinta.y0 + dmg.tinta.y1) / 2;
  assert.ok(Math.abs(eixo - EIXO_DOS_ICONES) <= 4,
    `a seta está centrada em y=${eixo} e os ícones em y=${EIXO_DOS_ICONES}`);

  // a ponta é mais alta que a haste: é isso que dá a direção
  assert.ok(dmg.colunaDireita >= dmg.colunaEsquerda * 2,
    `ponta (${dmg.colunaDireita}px) não se abre sobre a haste (${dmg.colunaEsquerda}px): `
    + "a seta não aponta para a direita");
});

test("a seta se lê sobre o fundo claro que o Finder exige", () => {
  assert.ok(dmg.corDoFundoLocal, "não há fundo em volta da seta: a arte virou um bloco de cor");
  assert.ok(dmg.corDaTinta, "não há traço na arte: a seta sumiu");
  // fundo claro não é estética: o Finder desenha o rótulo com a cor do sistema,
  // que a imagem não acompanha — fundo escuro deixa o nome ilegível em tema claro
  assert.ok(luminancia(dmg.corDoFundoLocal) >= 0.8,
    `fundo local em ${dmg.corDoFundoLocal} é escuro demais para os rótulos do Finder`);

  const razao = contraste(dmg.corDaTinta, dmg.corDoFundoLocal);
  assert.ok(razao >= 4.5,
    `a seta dá ${razao.toFixed(2)}:1 contra o fundo dela — precisa de 4.5:1`);
});

test("a seta usa o accent da escala Lumen, não um roxo qualquer", () => {
  const accent = corDaEscala("selection");
  assert.ok(dmg.corDaTinta, "não há traço na arte para comparar com a escala");
  assert.ok(perto(dmg.corDaTinta, accent, 3),
    `a seta está em ${dmg.corDaTinta} e o accent da escala é ${accent}`);
});

test("o PNG do DMG é o SVG versionado, regerado", () => {
  // o PNG é o que embarca no DMG, mas o SVG é a fonte. Sem esta comparação,
  // editar o SVG e esquecer de rodar `node tools/render-dmg-background.mjs`
  // passaria batido e o DMG sairia com a arte velha.
  const diga = "PNG desatualizado: rode `node tools/render-dmg-background.mjs`";
  assert.deepEqual({ w: dmg.w, h: dmg.h }, { w: dmgSvg.w, h: dmgSvg.h }, diga);
  for (const campo of ["x0", "x1", "y0", "y1"]) {
    assert.ok(Math.abs(dmg.tinta[campo] - dmgSvg.tinta[campo]) <= 2,
      `${diga} (traço ${campo}: PNG ${dmg.tinta[campo]}, SVG ${dmgSvg.tinta[campo]})`);
  }
  assert.ok(perto(dmg.corDaTinta, dmgSvg.corDaTinta, 3),
    `${diga} (cor do traço: PNG ${dmg.corDaTinta}, SVG ${dmgSvg.corDaTinta})`);
});

// ---------- shot do README ----------

test("o shot do README tem o enquadramento que o README espera", () => {
  assert.deepEqual({ largura: shot.w, altura: shot.h }, { largura: 1826, altura: 896 });
  for (const canto of shot.cantos) {
    assert.equal(canto[3], 0, "os cantos do shot são recortados: o aparelho vem emoldurado");
  }
});

test("o shot mostra a PWA em funcionamento, não uma tela morta", () => {
  assert.ok(shot.fracaoDeClaros >= 0.05,
    `só ${(shot.fracaoDeClaros * 100).toFixed(1)}% da tela tem conteúdo claro: parece apagada`);
  assert.ok(shot.coresDistintas >= 500,
    `${shot.coresDistintas} cores distintas: a tela está chapada, não renderizou`);
});

test("o shot mostra a escala roxa, não o chão marrom antigo", () => {
  const [r, g, b] = shot.media;
  // margem, não `b > g` pelado: o chão marrom antigo mede 99,99,106 — azul ACIMA
  // do verde — e mesmo assim não é roxo. Sem a folga de 15% ele passaria.
  const MARGEM_ROXA = 1.15;
  assert.ok(b > g * MARGEM_ROXA,
    `média da tela ${shot.media}: azul ${b} não supera verde ${g} com a folga de `
    + `${MARGEM_ROXA}x (precisaria de mais de ${(g * MARGEM_ROXA).toFixed(1)}). `
    + "Azul só empatando com verde é cinza/marrom, não a escala Lumen");
  assert.ok(r > g, `média da tela ${shot.media} não tem a dominante roxa (vermelho+azul sobre verde)`);

  // o chão da tela tem que ser o mesmo que a PWA declara, não um tom escolhido aqui
  const pwa = readFileSync(path.join(root, "public", "index.html"), "utf8");
  const tema = pwa.match(/<meta name="theme-color" content="#([0-9a-fA-F]{6})">/);
  assert.ok(tema, "a PWA precisa declarar theme-color para ancorar o fundo do shot");
  const chao = [0, 2, 4].map(i => parseInt(tema[1].slice(i, i + 2), 16));
  assert.ok(perto(shot.fundoDaTela, chao, 12),
    `o fundo do shot é ${shot.fundoDaTela} e a PWA declara ${chao}`);
});
