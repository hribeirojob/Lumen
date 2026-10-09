import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC_DIR = join(import.meta.dirname, "..", "public");
const NEW_KEY = "lumen.lastScreen";
const OLD_KEY = "dokke.lastScreen";

// servidor estático mínimo: a migração é do PWA, não precisa (e não deve) subir o
// servidor real, que mexeria na pasta de dados do usuário desta máquina.
async function servePublic() {
  const html = await readFile(join(PUBLIC_DIR, "index.html"), "utf8");
  const server = createServer((req, res) => {
    if ((req.url || "/").split("?")[0] === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

function stubNetwork(page){
  return Promise.all([
    page.addInitScript(() => {
      class DisabledWebSocket {
        static CONNECTING = 0; static OPEN = 1; static CLOSED = 3;
        constructor(url){ this.url = url; this.readyState = DisabledWebSocket.CLOSED; }
        close(){} send(){}
      }
      window.WebSocket = DisabledWebSocket;
    }),
    page.route("**/health", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })),
    page.route("**/api/apps", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, pieces: [], pinned: [], running: [], v: "0" }) })),
    page.route("**/api/apps/installed", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, apps: [] }) })),
  ]);
}

async function openWith(seed) {
  const site = await servePublic();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.addInitScript(entries => {
    for (const [k, v] of entries) localStorage.setItem(k, v);
  }, Object.entries(seed));
  await stubNetwork(page);
  await page.goto(`http://127.0.0.1:${site.port}/`, { waitUntil: "domcontentloaded" });
  return {
    page,
    storage: key => page.evaluate(k => localStorage.getItem(k), key),
    isRecents: () => page.locator("body").evaluate(el => el.classList.contains("is-recents")),
    close: async () => { await browser.close(); await site.close(); },
  };
}

test("PWA adota dokke.lastScreen quando lumen.lastScreen não existe e grava na chave nova", async () => {
  const app = await openWith({ [OLD_KEY]: "recents" });
  try {
    assert.equal(await app.isRecents(), true, "a tela salva na chave antiga deve ser restaurada");
    assert.equal(await app.storage(NEW_KEY), "recents", "o valor herdado deve ser gravado na chave nova");
  } finally { await app.close(); }
});

test("PWA ignora dokke.lastScreen quando lumen.lastScreen já existe", async () => {
  const app = await openWith({ [NEW_KEY]: "apps", [OLD_KEY]: "recents" });
  try {
    assert.equal(await app.isRecents(), false, "a chave nova é a fonte da verdade");
    assert.equal(await app.storage(NEW_KEY), "apps");
  } finally { await app.close(); }
});

test("PWA não quebra quando nenhuma das duas chaves existe", async () => {
  const app = await openWith({});
  try {
    assert.equal(await app.isRecents(), false, "sem valor salvo o padrão continua sendo a tela de apps");
    assert.equal(await app.storage(OLD_KEY), null, "a chave antiga não pode ser recriada");
  } finally { await app.close(); }
});
