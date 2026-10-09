import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// CONTRATO DO REGISTRY DE TELAS
//
// Hoje a lista de telas é uma const no script (SCREEN_NAMES) e os elementos
// são um array paralelo (screenElements). Três telas novas significam três
// patches concorrentes nos mesmos dois lugares, mais os pontos onde "recents"
// aparece escrito à mão.
//
// O registry passa a ser DECLARATIVO NO MARKUP: toda <section class="screen">
// dentro de #screens que carrega data-screen="<nome>" é uma entrada. A ordem é
// a do DOM; data-screen-enabled="false" desliga a tela. É a declaração que já
// tem que existir para a tela existir — então não há lista paralela para
// dessincronizar, e cada tela nova é um bloco próprio, sem conflito de merge.
//
// Daqui saem, de graça: vdots, swipe vertical, persistência e t("screen.<nome>").

const PUBLIC_DIR = join(import.meta.dirname, "..", "public");
const SCREEN_KEY = "lumen.lastScreen";
const RECENTS_ANCHOR = '<section class="screen" id="screenRecents"></section>';

const htmlOriginal = await readFile(join(PUBLIC_DIR, "index.html"), "utf8");

function section({ name, enabled = true }) {
  const id = `screen${name[0].toUpperCase()}${name.slice(1)}`;
  const off = enabled ? "" : ' data-screen-enabled="false"';
  return `<section class="screen" id="${id}" data-screen="${name}"${off}></section>`;
}

/** Declara telas novas no markup, antes ou depois de Abertos. */
function comTelas({ antesDeRecents = [], depoisDeRecents = [] } = {}) {
  assert.ok(htmlOriginal.includes(RECENTS_ANCHOR), "âncora de markup das telas mudou");
  return htmlOriginal.replace(
    RECENTS_ANCHOR,
    antesDeRecents.map(section).join("\n") + RECENTS_ANCHOR + depoisDeRecents.map(section).join("\n"),
  );
}

async function serve(html) {
  const server = createServer((req, res) => {
    if ((req.url || "/").split("?")[0] === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { port: server.address().port, close: () => new Promise(r => server.close(r)) };
}

function stubNetwork(page) {
  const json = body => route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  return Promise.all([
    page.addInitScript(() => {
      class DisabledWebSocket {
        static CONNECTING = 0; static OPEN = 1; static CLOSED = 3;
        constructor(url){ this.url = url; this.readyState = DisabledWebSocket.CLOSED; }
        close(){} send(){}
      }
      window.WebSocket = DisabledWebSocket;
    }),
    page.route("**/health", json({ ok: true })),
    page.route("**/api/apps", json({ ok: true, pieces: [], pinned: [], running: [], v: "0" })),
    page.route("**/api/apps/installed", json({ ok: true, apps: [] })),
  ]);
}

async function abrir(html, { persistido } = {}) {
  const site = await serve(html);
  const browser = await chromium.launch({ headless: true });
  // locale fixo: os rótulos vêm do i18n, e o teste precisa saber qual dicionário
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "pt-BR" });
  if (persistido !== undefined) {
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [SCREEN_KEY, persistido]);
  }
  await stubNetwork(page);
  await page.goto(`http://127.0.0.1:${site.port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vdots .d");

  const dots = () => page.$$eval("#vdots .d", ds => ds.map(d => ({
    screen: d.dataset.screen,
    label: d.getAttribute("aria-label"),
    current: d.getAttribute("aria-current"),
  })));
  const ativa = () => page.evaluate(() =>
    (document.querySelector('#vdots .d[aria-current="true"]') || {}).dataset?.screen ?? null);
  const esperarAtiva = nome => page.waitForFunction(
    alvo => document.querySelector('#vdots .d[aria-current="true"]')?.dataset.screen === alvo,
    nome,
    { timeout: 4000 },
  );

  return {
    page,
    dots,
    ativa,
    esperarAtiva,
    nomes: async () => (await dots()).map(d => d.screen),
    salvo: () => page.evaluate(k => localStorage.getItem(k), SCREEN_KEY),
    clicarDot: async nome => page.click(`#vdots .d[data-screen="${nome}"]`),
    rodar: async deltaY => {
      const box = await page.locator("#screens").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, deltaY);
    },
    close: async () => { await browser.close(); await site.close(); },
  };
}

const ROLAR_PARA_PROXIMA = 400;
const ROLAR_PARA_ANTERIOR = -400;

// ---------- a declaração mora no markup ----------

test("as telas de hoje são declaradas no markup, não numa lista do script", async () => {
  // boolean em vez de doesNotMatch: o relatório não precisa do index.html inteiro
  assert.equal(/\[\s*"apps"\s*,\s*"recents"\s*\]/.test(htmlOriginal), false,
    "lista de telas escrita à mão no script é exatamente o que o registry elimina");

  const app = await abrir(htmlOriginal);
  try {
    assert.deepEqual(await app.nomes(), ["apps", "recents"]);
    const sections = await app.page.$$eval("#screens .screen", els => els.map(e => e.dataset.screen));
    assert.deepEqual(sections, ["apps", "recents"],
      "cada <section class='screen'> precisa se declarar com data-screen");
  } finally { await app.close(); }
});

test("tela nova declarada no markup entra no registry, na ordem do DOM", async () => {
  const app = await abrir(comTelas({ antesDeRecents: [{ name: "clock" }] }));
  try {
    assert.deepEqual(await app.nomes(), ["apps", "clock", "recents"],
      "a ordem do registry é a ordem em que as telas estão declaradas");
    const [, clock] = await app.dots();
    assert.equal(clock.label, "screen.clock",
      "o rótulo passa por t('screen.<nome>') — sem entrada no dicionário, sobra a própria chave");
  } finally { await app.close(); }
});

test("rótulo das telas continua vindo do i18n", async () => {
  const app = await abrir(htmlOriginal);
  try {
    assert.deepEqual((await app.dots()).map(d => d.label), ["Apps", "Abertos"]);
  } finally { await app.close(); }
});

// ---------- tela desligada não existe para o usuário ----------

test("tela desligada some dos vdots e da navegação", async () => {
  const app = await abrir(comTelas({
    antesDeRecents: [{ name: "clock" }, { name: "notifications", enabled: false }],
  }));
  try {
    assert.deepEqual(await app.nomes(), ["apps", "clock", "recents"],
      "notifications está declarada mas desligada: não pode virar um ponto");
    assert.equal(await app.page.locator("#screenNotifications").isVisible(), false,
      "tela desligada não pode ocupar a tela do usuário");

    await app.rodar(ROLAR_PARA_PROXIMA);
    await app.esperarAtiva("clock");
    await app.rodar(ROLAR_PARA_PROXIMA);
    await app.esperarAtiva("recents");
    assert.equal(await app.ativa(), "recents", "o swipe pula a tela desligada, não encosta nela");
  } finally { await app.close(); }
});

test("tela desligada nunca é persistida", async () => {
  const app = await abrir(comTelas({ antesDeRecents: [{ name: "clock", enabled: false }] }));
  try {
    await app.page.evaluate(() => localStorage.setItem("lumen.lastScreen", "clock"));
    await app.clicarDot("recents");
    await app.esperarAtiva("recents");
    assert.equal(await app.salvo(), "recents");

    await app.clicarDot("apps");
    await app.esperarAtiva("apps");
    assert.equal(await app.salvo(), "apps", "só tela do registry ativo pode ser gravada");
  } finally { await app.close(); }
});

// ---------- fallback ----------

test("tela persistida que não existe mais cai para apps", async () => {
  const app = await abrir(htmlOriginal, { persistido: "tokens" });
  try {
    assert.equal(await app.ativa(), "apps");
    assert.deepEqual(await app.nomes(), ["apps", "recents"]);
  } finally { await app.close(); }
});

test("tela persistida que foi desligada cai para apps", async () => {
  const app = await abrir(
    comTelas({ antesDeRecents: [{ name: "notifications", enabled: false }] }),
    { persistido: "notifications" },
  );
  try {
    assert.equal(await app.ativa(), "apps",
      "desligar uma tela não pode deixar o usuário preso numa tela que sumiu");
  } finally { await app.close(); }
});

test("tela persistida e ativa é restaurada no boot", async () => {
  const app = await abrir(comTelas({ antesDeRecents: [{ name: "clock" }] }), { persistido: "clock" });
  try {
    assert.equal(await app.ativa(), "clock");
  } finally { await app.close(); }
});

// ---------- aria-current ----------

test("aria-current marca exatamente a tela ativa", async () => {
  const app = await abrir(comTelas({ antesDeRecents: [{ name: "clock" }] }));
  try {
    assert.deepEqual(await app.dots(), [
      { screen: "apps", label: "Apps", current: "true" },
      { screen: "clock", label: "screen.clock", current: "false" },
      { screen: "recents", label: "Abertos", current: "false" },
    ]);

    await app.clicarDot("recents");
    await app.esperarAtiva("recents");
    assert.deepEqual((await app.dots()).map(d => d.current), ["false", "false", "true"],
      "só um ponto por vez pode ser aria-current");
  } finally { await app.close(); }
});

// ---------- as 3 telas da F0, desligadas, não mudam nada ----------

test("com clock, notifications e tokens desligadas o app se comporta como hoje", async () => {
  const novas = [{ name: "clock", enabled: false }, { name: "notifications", enabled: false }, { name: "tokens", enabled: false }];
  const app = await abrir(comTelas({ depoisDeRecents: novas }));
  try {
    assert.deepEqual(await app.nomes(), ["apps", "recents"]);
    assert.deepEqual((await app.dots()).map(d => d.label), ["Apps", "Abertos"]);
    assert.equal(await app.ativa(), "apps");

    await app.rodar(ROLAR_PARA_PROXIMA);
    await app.esperarAtiva("recents");
    assert.equal(await app.salvo(), "recents");

    await app.rodar(ROLAR_PARA_ANTERIOR);
    await app.esperarAtiva("apps");
    assert.equal(await app.salvo(), "apps");
  } finally { await app.close(); }
});
