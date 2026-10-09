import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALL_SH = path.join(root, "mac", "install.sh");

// O defeito que originou isto não era lógica errada: era uma MENSAGEM MENTIROSA.
// O script imprimia "Only one copy" sem nunca ter olhado o disco, e uma cópia
// antiga em /Applications passou por atual durante dias. Teste de comportamento
// não pega isso por acidente — a afirmação é que estava errada, não o cálculo.
//
// O contrato aqui é um só: o script não afirma o que não verificou.
//
// As funções são extraídas do install.sh REAL e rodadas num sandbox. Nada de
// executar o install.sh de verdade: ele compila Swift e escreve em ~/Applications.

// Nome próprio do teste: com "Lumen" o candidato /Applications/Lumen.app pode
// existir na máquina de quem roda (foi literalmente o caso do bug) e o resultado
// passaria a depender do disco de cada um.
const APP = "LumenFixtureDeTeste";

/** Recorta `nome() { ... }` do shell real, até o `}` na coluna zero. */
function extrairFuncao(fonte, nome) {
  const inicio = fonte.indexOf(`${nome}() {`);
  assert.ok(inicio >= 0, `função ${nome} não existe mais em mac/install.sh`);
  const fim = fonte.indexOf("\n}\n", inicio);
  assert.ok(fim > inicio, `função ${nome} não fecha em mac/install.sh`);
  return fonte.slice(inicio, fim + 3);
}

const fonteInstall = readFileSync(INSTALL_SH, "utf8");
const FUNCOES = ["canonical_app_path", "app_mtime", "report_app_copies", "report_runtime_health"]
  .map(nome => extrairFuncao(fonteInstall, nome))
  .join("\n");

function sandbox() {
  const base = mkdtempSync(path.join(tmpdir(), "lumen-install-"));
  const casa = path.join(base, "home");
  const raiz = path.join(base, "root");
  mkdirSync(path.join(casa, "Applications"), { recursive: true });
  mkdirSync(path.join(raiz, "dist"), { recursive: true });
  return {
    base,
    casa,
    raiz,
    emCasa: path.join(casa, "Applications", `${APP}.app`),
    emDist: path.join(raiz, "dist", `${APP}.app`),
    criarApp: (destino, { comWs = true } = {}) => {
      mkdirSync(destino, { recursive: true });
      if (comWs) mkdirSync(path.join(destino, "Contents", "Resources", APP, "node_modules", "ws"), { recursive: true });
      writeFileSync(path.join(destino, "Info.plist"), "<plist/>");
      return destino;
    },
    limpar: () => rmSync(base, { recursive: true, force: true }),
  };
}

function rodar(caixa, chamada, { corpo = FUNCOES } = {}) {
  const script = path.join(caixa.base, "roteiro.sh");
  writeFileSync(script, [
    "set -uo pipefail",
    `APP_NAME=${JSON.stringify(APP)}`,
    `ROOT=${JSON.stringify(caixa.raiz)}`,
    corpo,
    chamada,
  ].join("\n"));
  // spawnSync e não execFileSync: separa stdout de stderr numa execução só. A
  // função sob teste não pode ter efeito colateral, e rodar duas vezes para
  // capturar os dois fluxos esconderia justamente isso.
  const r = spawnSync("bash", [script], {
    encoding: "utf8",
    env: { ...process.env, HOME: caixa.casa },
  });
  assert.equal(r.error, undefined, `falha ao executar o sandbox: ${r.error}`);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const AFIRMACAO_DE_COPIA_UNICA = /só existe esta cópia/;

// ---------- o contrato ----------

test("com uma cópia só, o script pode afirmar que é única", () => {
  const caixa = sandbox();
  try {
    caixa.criarApp(caixa.emCasa);
    const r = rodar(caixa, `report_app_copies ${JSON.stringify(caixa.emCasa)}`);
    assert.match(r.stdout, AFIRMACAO_DE_COPIA_UNICA,
      "com uma cópia só, a afirmação é verdadeira e tem que sair");
    assert.match(r.stdout, new RegExp(`Spotlight: ${APP}`));
    assert.equal(r.status, 0);
  } finally { caixa.limpar(); }
});

test("com outra cópia no disco, o script NÃO afirma cópia única", () => {
  const caixa = sandbox();
  try {
    caixa.criarApp(caixa.emCasa);
    caixa.criarApp(caixa.emDist); // a sobra, como a de /Applications no caso do Hugo
    const r = rodar(caixa, `report_app_copies ${JSON.stringify(caixa.emCasa)}`);

    assert.doesNotMatch(r.stdout, AFIRMACAO_DE_COPIA_UNICA,
      "esta é a mensagem mentirosa do bug: não pode sair com duas cópias no disco");
    assert.doesNotMatch(r.stderr, AFIRMACAO_DE_COPIA_UNICA);
    assert.ok(r.stderr.includes(caixa.emDist),
      "quem avisa tem que dizer ONDE está a sobra, senão o aviso não resolve nada");
    assert.match(r.stderr, new RegExp(`rm -rf .*${APP}\\.app`),
      "o aviso tem que entregar o comando exato de remoção");
    assert.equal(r.status, 0, "achar uma sobra avisa, não derruba a instalação");
  } finally { caixa.limpar(); }
});

test("o aviso não remove nada por conta própria", () => {
  const caixa = sandbox();
  try {
    caixa.criarApp(caixa.emCasa);
    caixa.criarApp(caixa.emDist);
    rodar(caixa, `report_app_copies ${JSON.stringify(caixa.emCasa)}`);
    assert.ok(existe(caixa.emDist),
      "apagar cópia do usuário sem pedir é pior que o bug original");
    assert.ok(existe(caixa.emCasa));
  } finally { caixa.limpar(); }
});

test("a cópia recém-instalada não é contada como sobra", () => {
  const caixa = sandbox();
  try {
    caixa.criarApp(caixa.emCasa);
    // mesmo app alcançado por outro caminho: é canônico que decide, não a string
    const atalho = path.join(caixa.base, "atalho");
    symlinkSync(path.join(caixa.casa, "Applications"), atalho);
    const r = rodar(caixa, `report_app_copies ${JSON.stringify(path.join(atalho, `${APP}.app`))}`);
    assert.match(r.stdout, AFIRMACAO_DE_COPIA_UNICA,
      "o app recém-instalado alcançado por symlink não é uma segunda cópia");
  } finally { caixa.limpar(); }
});

test("os três domínios onde o app pode se esconder são procurados", () => {
  // /Applications não dá para forjar num sandbox — e é justamente o domínio que o
  // script ignorava. Fica verificado na fonte, junto com os dois que o sandbox cobre.
  const corpo = extrairFuncao(fonteInstall, "report_app_copies");
  for (const dominio of ['"/Applications/${APP_NAME}.app"', '"${HOME}/Applications/${APP_NAME}.app"', '"${ROOT}/dist/${APP_NAME}.app"']) {
    assert.ok(corpo.includes(dominio),
      `report_app_copies precisa procurar em ${dominio} — instalar num domínio e olhar só ele foi o bug`);
  }
});

// ---------- a mesma família: OK que não foi verificado ----------

test("o app sem a dependência ws não passa por saudável", () => {
  const caixa = sandbox();
  try {
    caixa.criarApp(caixa.emCasa, { comWs: false });
    const r = rodar(caixa, `report_runtime_health ${JSON.stringify(caixa.emCasa)}`);
    assert.match(r.stderr, /ws ausente/,
      "um npm ci falho entregava um app que abre e nunca conecta, com OK na tela");
    assert.equal(r.status, 0, "o aviso não derruba a instalação");
  } finally { caixa.limpar(); }
});

test("o app com ws instalado passa calado", () => {
  const caixa = sandbox();
  try {
    caixa.criarApp(caixa.emCasa);
    const r = rodar(caixa, `report_runtime_health ${JSON.stringify(caixa.emCasa)}`);
    assert.doesNotMatch(r.stderr, /ws ausente/, "aviso falso treina o usuário a ignorar aviso");
  } finally { caixa.limpar(); }
});

function existe(caminho) {
  try { readFileSync(path.join(caminho, "Info.plist")); return true; } catch { return false; }
}
