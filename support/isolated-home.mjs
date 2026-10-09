// Isolamento de HOME por processo de teste.
//
// Carregado via `node --test --import ./support/isolated-home.mjs`, roda UMA vez em
// cada processo filho do test runner, antes do arquivo de teste.
//
// Motivo: startServer() resolve o diretório de dados com userDataDir(), que lê
// process.env.HOME. Como `node --test` roda ~45 arquivos em paralelo, todos os
// processos compartilhavam ~/Library/Application Support/Lumen — config.json,
// .j5-pin e j5-sessions.json eram lidos e escritos ao mesmo tempo por servidores
// de testes distintos. Dando um HOME próprio a cada processo, cada servidor
// ganha seu próprio dataDir e a migração legada Dokke -> Lumen vira no-op
// determinístico em vez de depender da máquina de quem roda.
//
// Só mexe em ambiente — nenhuma expectativa de teste depende deste arquivo.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const realHome = process.env.HOME || process.env.USERPROFILE || "";
const realLocalAppData = process.env.LOCALAPPDATA || "";

// O Playwright resolve o registro de browsers a partir do HOME no import. Como
// o HOME vai mudar, fixa o caminho real antes — senão o chromium "some".
// Lê LOCALAPPDATA ANTES da troca abaixo, por isso o valor real fica guardado.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && realHome) {
  const registry = process.platform === "darwin"
    ? join(realHome, "Library", "Caches", "ms-playwright")
    : process.platform === "win32"
      ? join(realLocalAppData || join(realHome, "AppData", "Local"), "ms-playwright")
      : join(process.env.XDG_CACHE_HOME || join(realHome, ".cache"), "ms-playwright");
  process.env.PLAYWRIGHT_BROWSERS_PATH = registry;
}

const home = mkdtempSync(join(tmpdir(), "lumen-test-home-"));

// HOME real continua acessível para quem precisar (nenhum teste precisa hoje).
process.env.LUMEN_REAL_HOME = realHome;
// Marcador consumido por test/home-isolation-guard.test.mjs: é o que distingue
// "a suíte rodou com o preload" de "alguém rodou node --test na mão".
process.env.LUMEN_TEST_HOME = home;
process.env.HOME = home;
process.env.USERPROFILE = home;
// APPDATA e LOCALAPPDATA vão os DOIS para o temp. Antes LOCALAPPDATA preservava
// o valor real e, no win32, userDataDir()/cache do app cairiam em pastas
// diferentes — metade isolada, metade não.
process.env.APPDATA = join(home, "AppData", "Roaming");
process.env.LOCALAPPDATA = join(home, "AppData", "Local");
process.env.XDG_CONFIG_HOME = join(home, ".config");
process.env.XDG_DATA_HOME = join(home, ".local", "share");

let cleaned = false;
function cleanup(){
  if (cleaned) return;
  cleaned = true;
  try { rmSync(home, { recursive: true, force: true }); } catch {}
}

process.on("exit", cleanup);

// Saída por sinal não dispara "exit" — sem isto o temp vazava toda vez que
// alguém interrompia a suíte com Ctrl+C ou o runner matava um filho travado.
// `once` já removeu o listener quando o handler roda, então o process.kill
// seguinte cai no comportamento padrão do sinal e preserva o código de saída.
// SIGKILL não é interceptável: esse caso continua vazando, por design do SO.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
  process.once(signal, () => {
    cleanup();
    process.kill(process.pid, signal);
  });
}
