import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  userDataDir,
  legacyUserDataDir,
  migrateLegacyUserData,
  startServer,
} from "../server.js";

// CONTRATO DA MIGRAÇÃO Dokke -> Lumen
//
// Princípio: nunca sobrescrever dado REAL do usuário — e reconhecer que um
// destino default (dock vazio, nenhuma sessão ativa) não é dado real.
//
// 1. Arquivo a arquivo. A presença de um arquivo no destino nunca aborta a
//    migração dos outros (a regra tudo-ou-nada esvaziava o dock do usuário).
// 2. config.json: importado quando o config do destino está AUSENTE, vazio
//    (pieces e pinned vazios) ou corrompido — e o config legado tem conteúdo.
// 3. .j5-pin + j5-sessions.json são UM GRUPO ATÔMICO. Sessão só vale sob o pin
//    que a emitiu: importar sessão sem o pin autoriza token de outro
//    pareamento; trocar o pin sem trazer as sessões desloga o celular.
//    O grupo só é importado quando o destino NÃO tem nenhuma sessão ativa —
//    um pin sem sessão nunca pareou ninguém e é descartável.
// 4. config é independente do grupo: adotar o dock antigo mantendo o pareamento
//    atual do destino é estritamente melhor para o usuário, nos dois sentidos.
// 5. Só reporta (e só escreve) o que de fato mudou — por isso é idempotente.
// 6. Nunca lança: IO/permissão degrada para resultado parcial ou vazio.

const CONFIG_FILE = "config.json";
const PIN_FILE = ".j5-pin";
const SESSIONS_FILE = "j5-sessions.json";

const PIN_LEGADO = "7391";
const PIN_DESTINO = "1120";

const DOCK_DO_HUGO = JSON.stringify({
  schemaVersion: 2,
  revision: 31,
  pieces: [{ type: "app", name: "Figma" }, { type: "app", name: "Notion" }],
  pinned: ["Figma", "Notion"],
});
// o que um boot limpo deixa no disco: estrutura completa, dock vazio
const CONFIG_DEFAULT = JSON.stringify({ schemaVersion: 2, revision: 0, pieces: [], pinned: [] });

const agora = Date.now();
const hash = n => createHash("sha256").update(`token-${n}`).digest("hex");
const sessoesAtivas = JSON.stringify({ [hash("celular")]: agora + 7 * 24 * 3600 * 1000 });
const sessoesExpiradas = JSON.stringify({ [hash("velho")]: agora - 60_000 });

async function tmp(prefix = "lumen-mig-") {
  return mkdtemp(join(tmpdir(), prefix));
}

async function seed(dir, files) {
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
}

const read = (dir, name) => readFile(join(dir, name), "utf8");
const has = (dir, name) => existsSync(join(dir, name));

async function cenario(legacy, destino) {
  const base = await tmp();
  const dataDir = join(base, "Lumen");
  const legacyDir = join(base, "Dokke");
  if (legacy) await seed(legacyDir, legacy);
  if (destino) await seed(dataDir, destino);
  return { base, dataDir, legacyDir, cleanup: () => rm(base, { recursive: true, force: true }) };
}

// ---------- caminhos ----------

test("userDataDir aponta para Lumen em cada plataforma", () => {
  assert.equal(
    userDataDir({ platform: "darwin", env: { HOME: "/Users/ninguem" } }),
    join("/Users/ninguem", "Library", "Application Support", "Lumen"),
  );
  assert.equal(
    userDataDir({ platform: "win32", env: { APPDATA: "C:\\Users\\ninguem\\AppData\\Roaming" } }),
    join("C:\\Users\\ninguem\\AppData\\Roaming", "Lumen"),
  );
  assert.equal(
    userDataDir({ platform: "linux", env: { HOME: "/home/ninguem" } }),
    join("/home/ninguem", ".config", "lumen"),
  );
});

test("legacyUserDataDir aponta para a pasta Dokke antiga em cada plataforma", () => {
  assert.equal(
    legacyUserDataDir({ platform: "darwin", env: { HOME: "/Users/ninguem" } }),
    join("/Users/ninguem", "Library", "Application Support", "Dokke"),
  );
  assert.equal(
    legacyUserDataDir({ platform: "win32", env: { APPDATA: "C:\\Users\\ninguem\\AppData\\Roaming" } }),
    join("C:\\Users\\ninguem\\AppData\\Roaming", "Dokke"),
  );
  assert.equal(
    legacyUserDataDir({ platform: "linux", env: { HOME: "/home/ninguem" } }),
    join("/home/ninguem", ".config", "dokke"),
  );
});

// ---------- o caso real do Hugo ----------

test("destino default criado por um boot anterior não bloqueia a migração", async () => {
  // máquina real: a pasta Lumen já existe com config default e um pin gerado
  // no primeiro boot, enquanto todo o dado de verdade ainda está no Dokke
  const c = await cenario(
    { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas },
    { [CONFIG_FILE]: CONFIG_DEFAULT, [PIN_FILE]: PIN_DESTINO },
  );
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

    assert.deepEqual([...copied].sort(), [CONFIG_FILE, SESSIONS_FILE, PIN_FILE].sort(),
      "dock default + pin sem sessão não são dado do usuário: tudo deve ser herdado");
    assert.equal(await read(c.dataDir, CONFIG_FILE), DOCK_DO_HUGO, "o dock do usuário não pode sumir");
    assert.equal(await read(c.dataDir, PIN_FILE), PIN_LEGADO, "o pin pareado precisa sobreviver");
    assert.equal(await read(c.dataDir, SESSIONS_FILE), sessoesAtivas, "o celular não pode deslogar");
  } finally { await c.cleanup(); }
});

// ---------- config.json ----------

test("config do destino realmente em uso é respeitado", async () => {
  const emUso = JSON.stringify({ schemaVersion: 2, revision: 4, pieces: [{ type: "app", name: "Safari" }], pinned: ["Safari"] });
  const c = await cenario(
    { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO },
    { [CONFIG_FILE]: emUso },
  );
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.equal(copied.includes(CONFIG_FILE), false, "dock com apps é dado real: nunca sobrescrever");
    assert.equal(await read(c.dataDir, CONFIG_FILE), emUso);
  } finally { await c.cleanup(); }
});

test("config do destino corrompido conta como ausente", async () => {
  const c = await cenario({ [CONFIG_FILE]: DOCK_DO_HUGO }, { [CONFIG_FILE]: "{isso nao é json" });
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual(copied, [CONFIG_FILE], "config ilegível não representa nada que o usuário possa perder");
    assert.equal(await read(c.dataDir, CONFIG_FILE), DOCK_DO_HUGO);
  } finally { await c.cleanup(); }
});

test("config legado vazio não é importado sobre um destino vazio", async () => {
  const c = await cenario({ [CONFIG_FILE]: CONFIG_DEFAULT }, { [CONFIG_FILE]: CONFIG_DEFAULT });
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual(copied, [], "copiar vazio sobre vazio não ganha nada e quebra a idempotência");
  } finally { await c.cleanup(); }
});

// ---------- grupo pin + sessões ----------

test("pin e sessões migram como grupo atômico", async () => {
  const c = await cenario({ [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas }, null);
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual([...copied].sort(), [PIN_FILE, SESSIONS_FILE].sort());
    assert.equal(await read(c.dataDir, PIN_FILE), PIN_LEGADO);
    assert.equal(await read(c.dataDir, SESSIONS_FILE), sessoesAtivas);
  } finally { await c.cleanup(); }
});

test("sessão ativa no destino congela o grupo, mas o dock ainda é herdado", async () => {
  // alguém já pareou o celular com o Lumen novo: trocar o pin agora desloga
  const c = await cenario(
    { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas },
    { [PIN_FILE]: PIN_DESTINO, [SESSIONS_FILE]: sessoesAtivas },
  );
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual(copied, [CONFIG_FILE], "config é independente do grupo de pareamento");
    assert.equal(await read(c.dataDir, PIN_FILE), PIN_DESTINO, "pareamento ativo do destino manda");
    assert.equal(await read(c.dataDir, CONFIG_FILE), DOCK_DO_HUGO);
  } finally { await c.cleanup(); }
});

test("destino só com j5-sessions.json ativo: o pin legado não entra", async () => {
  // sem o pin que as emitiu, adotar o pin legado validaria sessões de outro pareamento
  const c = await cenario(
    { [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: JSON.stringify({ [hash("outro")]: agora + 3600_000 }) },
    { [SESSIONS_FILE]: sessoesAtivas },
  );
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual(copied, [], "sessão ativa no destino é pareamento real");
    assert.equal(has(c.dataDir, PIN_FILE), false);
    assert.equal(await read(c.dataDir, SESSIONS_FILE), sessoesAtivas);
  } finally { await c.cleanup(); }
});

test("destino só com sessões expiradas: o grupo migra", async () => {
  const c = await cenario(
    { [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas },
    { [PIN_FILE]: PIN_DESTINO, [SESSIONS_FILE]: sessoesExpiradas },
  );
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual([...copied].sort(), [PIN_FILE, SESSIONS_FILE].sort(),
      "sessão vencida não autoriza ninguém: o destino está livre");
    assert.equal(await read(c.dataDir, PIN_FILE), PIN_LEGADO);
  } finally { await c.cleanup(); }
});

test("nunca importa sessões sem o pin que as emitiu", async () => {
  const c = await cenario({ [SESSIONS_FILE]: sessoesAtivas }, { [PIN_FILE]: PIN_DESTINO });
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.equal(copied.includes(SESSIONS_FILE), false,
      "sessão legada sob o pin do destino autorizaria token de outro pareamento");
    assert.equal(has(c.dataDir, SESSIONS_FILE), false);
    assert.equal(await read(c.dataDir, PIN_FILE), PIN_DESTINO);
  } finally { await c.cleanup(); }
});

// ---------- bordas ----------

test("nenhuma das duas pastas existe: não copia nada e não lança", async () => {
  const c = await cenario(null, null);
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual(copied, []);
    assert.equal(has(c.dataDir, CONFIG_FILE), false,
      "sem origem a migração não inventa config — o seed do bundle é quem manda");
  } finally { await c.cleanup(); }
});

test("Dokke incompleto: copia o que existe sem quebrar", async () => {
  const c = await cenario({ [CONFIG_FILE]: DOCK_DO_HUGO }, null);
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual(copied, [CONFIG_FILE]);
    assert.equal(has(c.dataDir, PIN_FILE), false);
    assert.equal(has(c.dataDir, SESSIONS_FILE), false);
  } finally { await c.cleanup(); }
});

test("migração é idempotente: a segunda chamada não copia nem reescreve", async () => {
  const c = await cenario(
    { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas },
    { [CONFIG_FILE]: CONFIG_DEFAULT, [PIN_FILE]: PIN_DESTINO },
  );
  try {
    await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

    // usuário mexeu no Lumen depois de migrar
    const depois = JSON.stringify({ schemaVersion: 2, revision: 32, pieces: [{ type: "app", name: "Mail" }], pinned: ["Mail"] });
    await writeFile(join(c.dataDir, CONFIG_FILE), depois);
    await writeFile(join(c.dataDir, PIN_FILE), "5555");

    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

    assert.deepEqual(copied, [], "a migração acontece uma vez só");
    assert.equal(await read(c.dataDir, CONFIG_FILE), depois);
    assert.equal(await read(c.dataDir, PIN_FILE), "5555");
  } finally { await c.cleanup(); }
});

test("Dokke sem permissão de leitura: migração falha em silêncio e não derruba o boot", async t => {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    t.skip("root ignora permissões de arquivo");
    return;
  }
  const c = await cenario({ [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO }, null);
  try {
    await chmod(c.legacyDir, 0o000);
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.ok(Array.isArray(copied), "a migração precisa retornar normalmente mesmo sem permissão");
  } finally {
    await chmod(c.legacyDir, 0o700).catch(() => {});
    await c.cleanup();
  }
});

// ---------- fiação real ----------

test("startServer herda dock e pin do Dokke mesmo com a pasta Lumen já criada", async t => {
  if (process.platform === "win32") {
    t.skip("o teste de HOME cobre darwin e linux");
    return;
  }
  const home = await tmp("lumen-home-");
  const homeOriginal = process.env.HOME;
  const xdgOriginal = process.env.XDG_CONFIG_HOME;
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  try {
    const legacyDir = legacyUserDataDir({ platform: process.platform, env: process.env });
    const dataDir = userDataDir({ platform: process.platform, env: process.env });
    assert.ok(dataDir.startsWith(home), "o teste nunca pode tocar o HOME real");
    await seed(legacyDir, { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas });
    // reproduz a máquina do Hugo: um boot anterior já deixou a pasta Lumen pronta
    await seed(dataDir, { [CONFIG_FILE]: CONFIG_DEFAULT, [PIN_FILE]: PIN_DESTINO });

    const { port, close } = await startServer({ port: 0, obs: null });
    try {
      assert.equal(await read(dataDir, CONFIG_FILE), DOCK_DO_HUGO,
        "o servidor deve subir com o dock herdado do Dokke");
      assert.equal(await read(dataDir, PIN_FILE), PIN_LEGADO,
        "o pin pareado precisa sobreviver ao rebrand");
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(r.status, 200);
    } finally { await close(); }
  } finally {
    if (homeOriginal === undefined) delete process.env.HOME; else process.env.HOME = homeOriginal;
    if (xdgOriginal !== undefined) process.env.XDG_CONFIG_HOME = xdgOriginal;
    await rm(home, { recursive: true, force: true });
  }
});

// ---------- one-shot de verdade: a migração não pode reabrir ----------
//
// O critério "destino sem sessão ativa" descreve um Lumen recém-criado, mas um
// Lumen VETERANO volta a esse estado toda vez que o usuário rotaciona o pin
// (rotação revoga tudo). Sem uma marca de conclusão no dataDir, o boot seguinte
// confunde os dois e desfaz uma decisão que o usuário tomou. A migração é
// avaliada UMA vez por instalação — o que ela não trouxe naquela hora, não vem
// mais.

test("pin rotacionado no Lumen não volta para o do Dokke no boot seguinte", async () => {
  const c = await cenario(
    { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas },
    { [CONFIG_FILE]: CONFIG_DEFAULT, [PIN_FILE]: PIN_DESTINO },
  );
  try {
    await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

    // o usuário pediu pin novo: rotacionar revoga todas as sessões
    const rotacionado = "5555\n";
    await writeFile(join(c.dataDir, PIN_FILE), rotacionado);
    await writeFile(join(c.dataDir, SESSIONS_FILE), "{}");

    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

    assert.deepEqual(copied, [], "a migração já aconteceu: não pode rodar de novo");
    assert.equal(await read(c.dataDir, PIN_FILE), rotacionado,
      "reverter o pin desfaz uma rotação que o usuário pediu — e o pin velho volta a valer");
    assert.equal(await read(c.dataDir, SESSIONS_FILE), "{}",
      "sessões revogadas não podem ser ressuscitadas pela migração");
  } finally { await c.cleanup(); }
});

test("dock esvaziado pelo usuário não ressuscita o dock do Dokke", async () => {
  const c = await cenario(
    { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas },
    { [CONFIG_FILE]: CONFIG_DEFAULT, [PIN_FILE]: PIN_DESTINO },
  );
  try {
    await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    await writeFile(join(c.dataDir, CONFIG_FILE), CONFIG_DEFAULT); // usuário limpou o dock

    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

    assert.deepEqual(copied, []);
    assert.equal(await read(c.dataDir, CONFIG_FILE), CONFIG_DEFAULT,
      "dock vazio depois da migração é escolha do usuário, não destino default");
  } finally { await c.cleanup(); }
});

test("migração avaliada com o destino em uso não volta a atacar quando a sessão expira", async () => {
  const emUso = JSON.stringify({ schemaVersion: 2, revision: 4, pieces: [{ type: "app", name: "Safari" }], pinned: ["Safari"] });
  const c = await cenario(
    { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas },
    { [CONFIG_FILE]: emUso, [PIN_FILE]: PIN_DESTINO, [SESSIONS_FILE]: sessoesAtivas },
  );
  try {
    const primeira = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual(primeira, [], "destino inteiro em uso: nada a herdar");

    await writeFile(join(c.dataDir, SESSIONS_FILE), sessoesExpiradas); // o celular saiu de cena

    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

    assert.deepEqual(copied, [],
      "não trazer nada também encerra a migração: o pin do Dokke não pode chegar meses depois");
    assert.equal(await read(c.dataDir, PIN_FILE), PIN_DESTINO);
  } finally { await c.cleanup(); }
});

// ---------- o grupo também é atômico na escrita ----------

test("falha ao gravar o pin aborta o grupo: nunca sobra sessão sem pin", async () => {
  const c = await cenario({ [PIN_FILE]: PIN_LEGADO, [SESSIONS_FILE]: sessoesAtivas }, null);
  try {
    // destino com .j5-pin ocupado por um diretório: a escrita do pin falha (EISDIR)
    await mkdir(join(c.dataDir, PIN_FILE), { recursive: true });

    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

    assert.equal(copied.includes(PIN_FILE), false, "um write que falhou não pode ser reportado");
    assert.equal(copied.includes(SESSIONS_FILE), false,
      "sem o pin gravado, as sessões não podem entrar");
    assert.equal(has(c.dataDir, SESSIONS_FILE), false,
      "sessão sem o pin que a emitiu é exatamente o que o contrato proíbe");
  } finally { await c.cleanup(); }
});

// ---------- o pin legado é entrada não confiável ----------

test("pin legado inválido não entra no plano, mas o dock ainda é herdado", async () => {
  for (const lixo of ["abcd", "", "   ", "99999", "12\n34", "{}"]) {
    const c = await cenario(
      { [CONFIG_FILE]: DOCK_DO_HUGO, [PIN_FILE]: lixo, [SESSIONS_FILE]: sessoesAtivas },
      null,
    );
    try {
      const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });

      assert.equal(copied.includes(PIN_FILE), false,
        `pin legado ${JSON.stringify(lixo)} viraria o pin ativo do Lumen`);
      assert.equal(copied.includes(SESSIONS_FILE), false,
        `sem pin válido o grupo inteiro cai (pin ${JSON.stringify(lixo)})`);
      assert.equal(has(c.dataDir, PIN_FILE), false);
      assert.equal(has(c.dataDir, SESSIONS_FILE), false);
      assert.deepEqual(copied, [CONFIG_FILE], "config não depende do grupo de pareamento");
    } finally { await c.cleanup(); }
  }
});

test("pin legado com quebra de linha continua válido", async () => {
  // writePinFile grava `pin + "\n"` — validar sem aparar rejeitaria todo pin real
  const c = await cenario({ [PIN_FILE]: `${PIN_LEGADO}\n`, [SESSIONS_FILE]: sessoesAtivas }, null);
  try {
    const copied = await migrateLegacyUserData({ dataDir: c.dataDir, legacyDir: c.legacyDir });
    assert.deepEqual([...copied].sort(), [PIN_FILE, SESSIONS_FILE].sort());
    assert.equal(await read(c.dataDir, PIN_FILE), `${PIN_LEGADO}\n`, "o arquivo migra byte a byte");
  } finally { await c.cleanup(); }
});
