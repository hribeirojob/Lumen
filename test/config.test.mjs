import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfig,
  saveConfig,
  normalizeConfig,
  normalizePinned,
  PINNED_PAGE_SIZE,
  PINNED_MAX_PAGES,
  MAX_PINNED_APPS,
  CONFIG_SCHEMA_VERSION,
  SCREEN_KEYS,
  normalizeScreens,
} from "../config.js";

// F0-T2: toda tela opcional nasce desligada — o dock de hoje é o default.
const emptyScreens = { clock: false, notifications: false, tokens: false };

const emptyConfig = {
  schemaVersion: 3,
  revision: 0,
  pieces: [],
  pinned: [],
  screens: { ...emptyScreens },
};

test("limite do dock cabe em cinco páginas completas", () => {
  assert.equal(PINNED_PAGE_SIZE, 8);
  assert.equal(PINNED_MAX_PAGES, 5);
  assert.equal(MAX_PINNED_APPS, 40);
});

test("loadConfig cria com defaults e saveConfig persiste", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j5cfg-"));
  const file = join(dir, "config.json");
  try {
    const c = await loadConfig(file);
    assert.deepEqual(c, emptyConfig);
    c.pieces.push({ type: "app", name: "Figma" });
    await saveConfig(file, c);
    assert.deepEqual((await loadConfig(file)).pinned, ["Figma"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("configuração obsoleta de atalhos locais não afeta mais os defaults", () => {
  assert.deepEqual(normalizeConfig({ allowLocalNetworkShortcuts: false }), emptyConfig);
});

test("loadConfig com JSON corrupto retorna defaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j5cfg-"));
  const file = join(dir, "config.json");
  try {
    await writeFile(file, "{isso nao é json válido");
    assert.deepEqual(await loadConfig(file), emptyConfig);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("loadConfig com partial {} preenche defaults e guard de tipo normaliza pinned", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j5cfg-"));
  try {
    const parcial = join(dir, "parcial.json");
    await saveConfig(parcial, {});
    assert.deepEqual(await loadConfig(parcial), emptyConfig);
    const guard = join(dir, "guard.json");
    await saveConfig(guard, { pinned: "nao-array" });
    assert.deepEqual(await loadConfig(guard), emptyConfig);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("normalizePinned trim, dedupe e ignora lixo", () => {
  assert.deepEqual(normalizePinned([" A ", "B", "A", "", 1, null]), ["A", "B"]);
});

test("normaliza a configuração sem incluir campos de Uso", () => {
  const config = normalizeConfig({ usage: { enabled: true }, usageProvider: "codex" });
  assert.equal(Object.hasOwn(config, "usage"), false);
  assert.equal(Object.hasOwn(config, "usageProvider"), false);
});

test("saveConfig mantém preferências antigas de Uso no arquivo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j5cfg-"));
  const file = join(dir, "config.json");
  const usage = { enabled: false, display: "remaining", providers: ["codex"] };
  try {
    await writeFile(file, JSON.stringify({ pieces: [], pinned: [], usage, usageProvider: "codex" }));
    const current = await loadConfig(file);
    current.pieces.push({ type: "app", name: "Figma" });
    await saveConfig(file, current);

    const stored = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(stored.usage, usage);
    assert.equal(stored.usageProvider, "codex");
    assert.deepEqual((await loadConfig(file)).pinned, ["Figma"]);
    assert.equal(Object.hasOwn(await loadConfig(file), "usage"), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// ---------- F0-T2: telas opcionais ----------

test("schemaVersion ativo é 3 e as telas conhecidas estão travadas", () => {
  assert.equal(CONFIG_SCHEMA_VERSION, 3);
  assert.deepEqual([...SCREEN_KEYS], ["clock", "notifications", "tokens"]);
});

test("normalizeScreens: default tudo desligado e lixo não vira tela", () => {
  assert.deepEqual(normalizeScreens(undefined), emptyScreens);
  assert.deepEqual(normalizeScreens(null), emptyScreens);
  assert.deepEqual(normalizeScreens("clock"), emptyScreens);
  assert.deepEqual(normalizeScreens([true, true, true]), emptyScreens);
  assert.deepEqual(normalizeScreens({ clock: true, inexistente: true }),
    { ...emptyScreens, clock: true });
});

test("normalizeScreens só aceita boolean — valor truthy frouxo fica desligado", () => {
  assert.deepEqual(normalizeScreens({ clock: "true", notifications: 1, tokens: {} }), emptyScreens);
  assert.deepEqual(normalizeScreens({ clock: false, notifications: true, tokens: false }),
    { clock: false, notifications: true, tokens: false });
});

test("normalizeScreens devolve sempre as três chaves, na ordem canônica", () => {
  assert.deepEqual(Object.keys(normalizeScreens({ tokens: true })), [...SCREEN_KEYS]);
});

test("config v2 legado carrega sem erro e vira v3 com todas as telas desligadas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j5cfg-"));
  const file = join(dir, "config.json");
  try {
    const v2 = { schemaVersion: 2, revision: 7, pieces: [{ type: "app", name: "Figma" }], pinned: ["Figma"] };
    await writeFile(file, JSON.stringify(v2));

    const loaded = await loadConfig(file);
    assert.equal(loaded.schemaVersion, 3);
    assert.equal(loaded.revision, 7, "a migração não mexe na revisão: nada mudou para o device");
    assert.deepEqual(loaded.pinned, ["Figma"]);
    assert.deepEqual(loaded.screens, emptyScreens);

    // migração em memória: o arquivo do usuário só muda quando ele salva
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), v2,
      "loadConfig nunca reescreve o config.json do usuário");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("saveConfig grava v3 com screens e preserva a escolha do usuário", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j5cfg-"));
  const file = join(dir, "config.json");
  try {
    await writeFile(file, JSON.stringify({ schemaVersion: 2, pieces: [], pinned: [] }));
    const cfg = await loadConfig(file);
    cfg.screens.clock = true;
    await saveConfig(file, cfg);

    const stored = JSON.parse(await readFile(file, "utf8"));
    assert.equal(stored.schemaVersion, 3);
    assert.deepEqual(stored.screens, { ...emptyScreens, clock: true });
    assert.deepEqual((await loadConfig(file)).screens, { ...emptyScreens, clock: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("screens corrompido no disco não derruba o load: volta ao default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j5cfg-"));
  const file = join(dir, "config.json");
  try {
    await writeFile(file, JSON.stringify({ schemaVersion: 3, pieces: [], pinned: [], screens: "tudo" }));
    assert.deepEqual((await loadConfig(file)).screens, emptyScreens);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
