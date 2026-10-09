// Guarda do isolamento de HOME.
//
// Falha ruidosamente quando a suíte roda SEM o preload
// `support/isolated-home.mjs`. Sem ele, cada startServer() volta a resolver
// userDataDir() para o ~/Library/Application Support/Lumen real da máquina —
// os testes passam a ler e escrever o config.json, o .j5-pin e as sessões de
// quem está rodando, e ~45 processos paralelos disputam os mesmos arquivos.
//
// Não quebra nenhum fluxo normal: `npm test` já carrega o preload. Quem rodar
// um arquivo isolado (`node --test test/ui.test.mjs`) não coleta esta guarda —
// por isso o AGENTS.md também documenta a flag.
import test from "node:test";
import assert from "node:assert/strict";

const COMO_RODAR = [
  "",
  "A suíte precisa do preload de isolamento de HOME.",
  "",
  "  use:     npm test",
  "  ou:      node --test --import ./support/isolated-home.mjs",
  "",
  "Sem ele os testes escrevem no diretório de dados REAL do Lumen",
  "(~/Library/Application Support/Lumen) em vez de um temporário por processo.",
  "",
].join("\n");

test("a suíte roda com HOME isolado por processo", () => {
  assert.ok(
    process.env.LUMEN_TEST_HOME,
    `preload de isolamento não foi carregado.${COMO_RODAR}`,
  );
  assert.equal(
    process.env.HOME,
    process.env.LUMEN_TEST_HOME,
    `HOME não aponta para o diretório isolado deste processo.${COMO_RODAR}`,
  );
  // os.homedir() segue o $HOME no macOS/Linux, então não serve de referência:
  // o preload guarda o HOME original em LUMEN_REAL_HOME justamente para isto.
  assert.notEqual(
    process.env.HOME,
    process.env.LUMEN_REAL_HOME,
    `HOME ainda é o diretório real do usuário.${COMO_RODAR}`,
  );
});
