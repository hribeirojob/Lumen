import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "assets", "branding", "lumen-icon");

// Documento do Icon Composer: a placa é o `fill` do documento e o layer é SÓ a
// marca, com alpha. É sutil e já regrediu duas vezes: quem vê o Dark sem roxo
// tende a "consertar" assando a placa dentro do layer — e aí Clear e Tinted
// viram laje chapada sem ninguém perceber. Por isso tem contrato próprio.
const DOCUMENTO = "assets/branding/lumen-icon/Lumen.icon";

let browser;
let page;

before(async () => {
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});

after(async () => { if (browser) await browser.close(); });

function documento() {
  const dir = path.join(root, DOCUMENTO);
  const json = JSON.parse(readFileSync(path.join(dir, "icon.json"), "utf8"));
  const layers = (json.groups ?? []).flatMap(g => g.layers ?? []);
  return { dir, json, layers };
}

function corDaEscala(nome) {
  const theme = readFileSync(path.join(root, "mac", "Sources", "LumenTheme.swift"), "utf8");
  const m = theme.match(new RegExp(`static let ${nome} = Color\\(red: ([\\d.]+), green: ([\\d.]+), blue: ([\\d.]+)\\)`));
  assert.ok(m, `LumenTheme.${nome} precisa existir para ancorar a cor do ícone`);
  return m.slice(1, 4).map(v => Math.round(Number(v) * 255));
}

const perto = (a, b, folga) => a.every((c, i) => Math.abs(c - b[i]) <= folga);

const luminancia = ([r, g, b]) => {
  const linear = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

const sourceVariants = [
  "Icon-lumen-iOS-ClearDark-1024@1x.png",
  "Icon-lumen-iOS-ClearLight-1024@1x.png",
  "Icon-lumen-iOS-Dark-1024@1x.png",
  "Icon-lumen-iOS-Default-1024@1x.png",
  "Icon-lumen-iOS-TintedDark-1024@1x.png",
  "Icon-lumen-iOS-TintedLight-1024@1x.png",
];


function pngDimensions(filePath) {
  const png = readFileSync(filePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

test("exports de aparência do Lumen ficam versionados no projeto", () => {
  for (const name of sourceVariants) {
    assert.deepEqual(pngDimensions(path.join(sourceDir, name)), { width: 1024, height: 1024 });
  }
});

test("o ícone Default sincroniza Mac, PWA, docs e Android", () => {
  const outputs = new Map([
    ["public/icon-dock-iOS-Default-1024@1x.png", 1024],
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
    ["docs/public/lumen-icon.png", 512],
    ["android/app/src/main/res/mipmap-mdpi/ic_launcher.png", 48],
    ["android/app/src/main/res/mipmap-hdpi/ic_launcher.png", 72],
    ["android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", 96],
    ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", 144],
    ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", 192],
  ]);

  for (const [relativePath, size] of outputs) {
    assert.ok(existsSync(path.join(root, relativePath)), `${relativePath} ausente`);
    assert.deepEqual(pngDimensions(path.join(root, relativePath)), { width: size, height: size });
  }

  assert.deepEqual(
    createHash("sha256").update(readFileSync(path.join(root, "docs/public/lumen-icon.png"))).digest("hex"),
    createHash("sha256").update(readFileSync(path.join(root, "public/icon-512.png"))).digest("hex"),
    "o ícone exibido no README deve usar o artwork Default atual",
  );
});

// Hash fixo só responde "mudou?". Não distingue o ícone certo de um quadrado
// preto, quebra em toda mexida de arte e pede de volta um número que ninguém
// consegue conferir de cabeça. O que este teste quer garantir — "o Android usa
// o MESMO artwork Default do resto" — dá para medir sem constante mágica:
// identidade de bytes com o PWA onde o tamanho bate, e a forma da marca
// (núcleo claro, vão escuro, anel, fundo) nas outras densidades.

const densidadesAndroid = new Map([
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
]);

const launcher = densidade =>
  path.join(root, "android/app/src/main/res", `mipmap-${densidade}`, "ic_launcher.png");

// raios amostrados do centro até a borda, em fração do raio
const RAIOS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const ANEL = 0.55;

test("o launcher de 192 é o mesmo arquivo que o ícone do PWA", () => {
  // mesma arte, mesmo tamanho: nada justifica dois bytes diferentes
  assert.deepEqual(
    readFileSync(launcher("xxxhdpi")),
    readFileSync(path.join(root, "public", "icon-192.png")),
    "o launcher xxxhdpi e o icon-192 do PWA saem do mesmo master no mesmo tamanho",
  );
});

test("as cinco densidades do launcher desenham a mesma marca", async () => {
  {
    const perfis = new Map();
    for (const [densidade, tamanho] of densidadesAndroid) {
      const b64 = readFileSync(launcher(densidade)).toString("base64");
      perfis.set(densidade, await page.evaluate(async ([b64, tamanho, raios, anel]) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = tamanho;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dados = ctx.getImageData(0, 0, tamanho, tamanho).data;
        const centro = (tamanho - 1) / 2;
        const pixel = fracao => {
          const i = (Math.round(centro) * tamanho + Math.round(centro + fracao * centro)) * 4;
          return [dados[i], dados[i + 1], dados[i + 2], dados[i + 3]];
        };
        const luz = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return {
          luzes: raios.map(f => luz(pixel(f))),
          alfas: raios.map(f => pixel(f)[3] / 255),
          anel: pixel(anel),
        };
      }, [b64, tamanho, RAIOS, ANEL]));
    }

    // (1) a FORMA da marca, independente de tom: anéis concêntricos, não um bloco
    for (const [densidade, perfil] of perfis) {
      const [nucleo, , , vao] = perfil.luzes;
      const anel = perfil.luzes[5];
      const fundo = perfil.luzes[8];
      assert.ok(nucleo >= 0.6, `${densidade}: o núcleo do ícone sumiu (luz ${nucleo.toFixed(2)})`);
      assert.ok(vao <= nucleo - 0.4, `${densidade}: sem vão escuro separando o núcleo do anel`);
      assert.ok(anel >= vao + 0.15, `${densidade}: o anel não se destaca do vão`);
      assert.ok(fundo <= anel - 0.15, `${densidade}: o fundo não se destaca do anel`);
      assert.equal(perfil.alfas[0], 1, `${densidade}: o centro do ícone deve ser opaco`);
      assert.equal(perfil.alfas[10], 0, `${densidade}: o ícone é recortado, não preenche o quadrado`);
    }

    // (2) as cinco são o MESMO desenho: o perfil radial tem que coincidir
    const referencia = perfis.get("xxxhdpi");
    for (const [densidade, perfil] of perfis) {
      if (densidade === "xxxhdpi") continue;
      perfil.luzes.forEach((luz, i) => {
        assert.ok(Math.abs(luz - referencia.luzes[i]) <= 0.06,
          `${densidade} destoa de xxxhdpi em ${RAIOS[i]} do raio `
          + `(${luz.toFixed(2)} contra ${referencia.luzes[i].toFixed(2)}): não é a mesma arte`);
      });
    }

    // (3) o anel usa accent-hi da escala — mesma fonte única do Mac e do PWA
    const theme = readFileSync(path.join(root, "mac", "Sources", "LumenTheme.swift"), "utf8");
    const accentHi = theme.match(
      /static let accentHi = Color\(red: ([\d.]+), green: ([\d.]+), blue: ([\d.]+)\)/);
    assert.ok(accentHi, "LumenTheme.accentHi precisa existir para ancorar a cor do ícone");
    const esperado = accentHi.slice(1, 4).map(v => Math.round(Number(v) * 255));
    for (const [densidade, perfil] of perfis) {
      perfil.anel.slice(0, 3).forEach((canal, i) => {
        assert.ok(Math.abs(canal - esperado[i]) <= 2,
          `${densidade}: o anel está em ${perfil.anel.slice(0, 3)} e accent-hi é ${esperado} `
          + "— ícone gerado de um master fora da escala Lumen");
      });
    }
  }
});

test("o AppIcon do macOS contém todas as escalas e o icns regenerado", () => {
  const iconset = path.join(root, "mac", "AppIcon.iconset");
  const scales = new Map([
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ]);

  for (const [name, size] of scales) {
    assert.deepEqual(pngDimensions(path.join(iconset, name)), { width: size, height: size });
  }

  const icns = readFileSync(path.join(root, "mac", "AppIcon.icns"));
  assert.equal(icns.subarray(0, 4).toString("ascii"), "icns");
});

test("o fallback legado do Mac usa o mesmo ícone Default atualizado", () => {
  const iconset = path.join(root, "mac", "AppIcon.iconset");
  assert.deepEqual(
    readFileSync(path.join(iconset, "icon_512x512.png")),
    readFileSync(path.join(root, "public", "icon-512.png"))
  );
  assert.deepEqual(
    readFileSync(path.join(iconset, "icon_512x512@2x.png")),
    readFileSync(path.join(sourceDir, "Icon-lumen-iOS-Default-1024@1x.png"))
  );
});

// ---- ícone adaptativo do Android (API 26+) ----
// O invariante que importa aqui é geométrico, não de bytes: o launcher recorta o
// foreground e só garante os 66dp centrais. A arte 1:1 do Halo NÃO cabe (anel em
// 0.3262 contra 0.3056 da zona segura), por isso ela entra reduzida. Se alguém
// regenerar sem a redução, o anel volta a ser fatiado — e é isso que se mede.
const ZONA_SEGURA = 66 / 108 / 2; // 0.3056 do canvas
const MASCARA = 72 / 108 / 2; // 0.3333 — o que o launcher chega a mostrar

const densidadesAdaptativo = new Map([
  ["mdpi", 108],
  ["hdpi", 162],
  ["xhdpi", 216],
  ["xxhdpi", 324],
  ["xxxhdpi", 432],
]);

const camada = (densidade, nome) =>
  path.join(root, "android/app/src/main/res", `mipmap-${densidade}`, `ic_launcher_${nome}.png`);

test("o Android declara o ícone adaptativo com as três camadas", () => {
  const xml = readFileSync(
    path.join(root, "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"), "utf8");
  assert.match(xml, /<adaptive-icon/);
  for (const nome of ["background", "foreground", "monochrome"]) {
    assert.match(xml, new RegExp(`<${nome}\\s+android:drawable="@mipmap/ic_launcher_${nome}"`),
      `a camada ${nome} precisa estar declarada — sem ela o launcher cai no tratamento legado`);
  }
  // as camadas são 108dp, não 48dp: tabela de densidade diferente da do legado
  for (const [densidade, tamanho] of densidadesAdaptativo) {
    for (const nome of ["background", "foreground", "monochrome"]) {
      assert.deepEqual(pngDimensions(camada(densidade, nome)), { width: tamanho, height: tamanho },
        `${densidade}/${nome} fora da grade de 108dp`);
    }
  }
});

test("o halo do adaptativo cabe na zona segura e o fundo sangra", async () => {
  {
    const medir = async (arquivo, tamanho) => {
      const b64 = readFileSync(arquivo).toString("base64");
      return page.evaluate(async ([b64, tamanho]) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = tamanho;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, tamanho, tamanho).data;
        const at = (x, y) => { const i = (y * tamanho + x) * 4; return [d[i], d[i+1], d[i+2], d[i+3]]; };
        const meio = Math.floor(tamanho / 2);
        // raio externo do traço sólido, varrendo do centro para a direita
        let ultimo = meio;
        for (let x = meio; x < tamanho; x++) if (at(x, meio)[3] >= 128) ultimo = x;
        const opacos = [];
        for (let x = 0; x < tamanho; x++) if (at(x, meio)[3] > 200) opacos.push(at(x, meio).slice(0, 3).join());
        return {
          raio: (ultimo - tamanho / 2) / tamanho,
          cantos: [at(0, 0), at(tamanho - 1, 0), at(0, tamanho - 1), at(tamanho - 1, tamanho - 1)]
            .map(p => p[3]),
          tons: [...new Set(opacos)],
        };
      }, [b64, tamanho]);
    };

    for (const [densidade, tamanho] of densidadesAdaptativo) {
      const fg = await medir(camada(densidade, "foreground"), tamanho);
      assert.ok(fg.raio <= ZONA_SEGURA,
        `${densidade}: o anel vai até ${fg.raio.toFixed(4)} do canvas e a zona segura é `
        + `${ZONA_SEGURA.toFixed(4)} — o launcher vai fatiar o halo`);
      assert.ok(fg.raio >= ZONA_SEGURA * 0.85,
        `${densidade}: o anel está em ${fg.raio.toFixed(4)}, encolhido demais dentro da zona segura `
        + "— o ícone vai ler pequeno ao lado dos outros na gaveta");
      assert.ok(fg.raio < MASCARA, `${densidade}: o halo passa até da máscara visível`);
      assert.deepEqual(fg.cantos, [0, 0, 0, 0],
        `${densidade}: o foreground precisa ser transparente — o fundo vem da camada de trás`);

      const bg = await medir(camada(densidade, "background"), tamanho);
      assert.deepEqual(bg.cantos, [255, 255, 255, 255],
        `${densidade}: o background tem que sangrar até a borda — quem recorta é o launcher`);

      const mono = await medir(camada(densidade, "monochrome"), tamanho);
      assert.deepEqual(mono.cantos, [0, 0, 0, 0], `${densidade}: o monochrome não pode ter fundo`);
      assert.deepEqual(mono.tons, ["255,255,255"],
        `${densidade}: o monochrome é silhueta de cor única — quem pinta é o sistema`);
    }
  }
});

// ---------- documento do Icon Composer ----------
//
// A autoria aqui é dividida de propósito: a PLACA é o `fill` do documento e o
// LAYER é só a marca, com alpha. O Icon Composer usa essa separação para
// recompor o ícone por aparência — Clear e Tinted descartam a placa e ficam só
// com a marca. Assar a placa dentro do layer deixa o Default igualzinho e
// destrói as outras renditions em silêncio, que é por onde isso já regrediu
// duas vezes.
//
// A rendition real sai do ictool (Xcode), que é lento e depende de ambiente;
// conferi contra ele que compor o fill com o layer aqui reproduz o renderizador
// dentro de 0.005 de luminância. Então o contrato mede os arquivos versionados.

const RAIOS_DA_MARCA = { nucleo: 0, vao: 0.35, anel: 0.55, chao: 0.8 };

test("o documento tem um único layer, que é a marca", () => {
  const { layers } = documento();
  assert.equal(layers.length, 1,
    "um layer extra normalmente é a placa entrando por outro caminho");
});

test("o layer é transparente na borda e opaco no núcleo", async () => {
  const { dir, layers } = documento();
  const arquivo = path.join(dir, "Assets", layers[0]["image-name"]);
  assert.ok(existsSync(arquivo), `o layer aponta para ${layers[0]["image-name"]}, que não existe`);

  const b64 = readFileSync(arquivo).toString("base64");
  const alfa = await page.evaluate(async b64 => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const dados = ctx.getImageData(0, 0, img.width, img.height).data;
    const a = (x, y) => dados[(y * img.width + x) * 4 + 3];
    const margem = Math.round(img.width * 0.02);
    let borda = 0, vazios = 0, total = 0;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (x < margem || y < margem || x >= img.width - margem || y >= img.height - margem) {
          borda = Math.max(borda, a(x, y));
        }
      }
    }
    for (let y = 0; y < img.height; y += 4) {
      for (let x = 0; x < img.width; x += 4) { total++; if (a(x, y) === 0) vazios++; }
    }
    return { borda, centro: a(img.width >> 1, img.height >> 1), vazio: vazios / total };
  }, b64);

  // ESTE é o assert que pega a regressão: placa assada no layer enche a borda
  assert.equal(alfa.borda, 0,
    `a borda do layer tem alpha ${alfa.borda}: a placa foi assada dentro da marca, `
    + "e Clear/Tinted viram laje chapada");
  assert.ok(alfa.vazio >= 0.4,
    `só ${(alfa.vazio * 100).toFixed(0)}% do layer é vazio: isso é placa, não marca`);
  assert.equal(alfa.centro, 255, "o núcleo da marca precisa ser opaco");
});

test("a placa é o fill do documento, nas cores da escala Lumen", () => {
  const { json } = documento();
  const paradas = json.fill?.["linear-gradient"];
  assert.ok(Array.isArray(paradas), "sem fill no documento a placa teria que vir do layer");
  assert.equal(paradas.length, 2, "a placa é um gradiente de duas paradas");

  const canais = parada => {
    const m = /^srgb:([\d.]+),([\d.]+),([\d.]+)/.exec(parada);
    assert.ok(m, `parada em formato inesperado: ${parada}`);
    return m.slice(1, 4).map(v => Math.round(Number(v) * 255));
  };
  for (const [i, nome] of [[0, "canvas"], [1, "page"]]) {
    const esperado = corDaEscala(nome);
    assert.ok(perto(canais(paradas[i]), esperado, 2),
      `parada ${i} da placa está em ${canais(paradas[i])} e LumenTheme.${nome} é ${esperado}`);
  }
});

test("o layer fica em transform identidade", () => {
  const { layers } = documento();
  const posicao = layers[0].position ?? {};
  assert.equal(posicao.scale, 1, "escala calibrada à mão desenquadra o halo");
  assert.deepEqual(posicao["translation-in-points"], [0, 0],
    "translação calibrada à mão desenquadra o halo");
  assert.equal(layers[0].hidden, false, "o layer da marca não pode estar oculto");
});

test("as faixas da marca sobrevivem à composição sobre a placa", async () => {
  const { dir, json, layers } = documento();
  assert.ok(json.fill?.["linear-gradient"],
    "sem a placa no fill não há sobre o que compor a marca");
  const paradas = json.fill["linear-gradient"].map(p => {
    const m = /^srgb:([\d.]+),([\d.]+),([\d.]+)/.exec(p);
    return m.slice(1, 4).map(v => Math.round(Number(v) * 255));
  });
  const b64 = readFileSync(path.join(dir, "Assets", layers[0]["image-name"])).toString("base64");

  const faixas = await page.evaluate(async ([b64, paradas, raios]) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, img.height);
    grad.addColorStop(0, `rgb(${paradas[0].join(",")})`);
    grad.addColorStop(1, `rgb(${paradas[1].join(",")})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    const dados = ctx.getImageData(0, 0, img.width, img.height).data;
    const centro = (img.width - 1) / 2;
    const px = f => {
      const i = (Math.round(centro) * img.width + Math.round(centro + f * centro)) * 4;
      return [dados[i], dados[i + 1], dados[i + 2]];
    };
    return Object.fromEntries(Object.entries(raios).map(([nome, f]) => [nome, px(f)]));
  }, [b64, paradas, RAIOS_DA_MARCA]);

  const luz = Object.fromEntries(Object.entries(faixas).map(([k, v]) => [k, luminancia(v)]));
  assert.ok(luz.nucleo >= 0.6, `núcleo em ${luz.nucleo.toFixed(2)}: a marca sumiu sobre a placa`);
  assert.ok(luz.vao <= luz.nucleo - 0.4, "sem vão escuro separando o núcleo do anel");
  assert.ok(luz.anel >= luz.vao + 0.15, "o anel não se destaca do vão");
  assert.ok(luz.chao <= luz.anel - 0.15, "a placa não se destaca do anel");

  const accentHi = corDaEscala("accentHi");
  assert.ok(perto(faixas.anel, accentHi, 3),
    `o anel está em ${faixas.anel} e accent-hi é ${accentHi}`);
});
