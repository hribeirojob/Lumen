import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..');
const scriptPath = path.join(projectRoot, 'mac', 'package-dmg.sh');
const installScriptPath = path.join(projectRoot, 'mac', 'install.sh');
const backgroundFileName = 'dmg-background.png';
const skipDmgFixture = process.env.LUMEN_SKIP_DMG_FIXTURE === '1'
  ? { skip: 'CI validates the built DMG after the general test suite' }
  : {};
const macOnly = process.platform === 'darwin'
  ? skipDmgFixture
  : { skip: 'DMG packaging requires macOS' };
const expectedPublicFiles = [
  'fonts',
  'icon-192-dark.png',
  'icon-192.png',
  'icon-512.png',
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'version.json'
];

let fixturePromise;
let fixture;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 240_000,
    ...options
  });
}

function attach(imagePath) {
  const result = run('hdiutil', ['attach', imagePath, '-nobrowse', '-noautoopen']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = `${result.stdout}\n${result.stderr}`
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.includes('/Volumes/'));
  assert.ok(line, `mount point not found in hdiutil output: ${result.stdout}`);
  return line.slice(line.indexOf('/Volumes/')).trim();
}

function detach(mountPoint) {
  if (!mountPoint) return;
  run('hdiutil', ['detach', mountPoint, '-force']);
}

function hasPosition(dsStore, x, y) {
  const needle = Buffer.alloc(8);
  needle.writeUInt32BE(x, 0);
  needle.writeUInt32BE(y, 4);
  return dsStore.includes(needle);
}

async function getFixture() {
  if (fixturePromise) return fixturePromise;

  fixturePromise = Promise.resolve().then(() => {
    if (process.env.LUMEN_DMG_FIXTURE) {
      const imagePath = path.resolve(projectRoot, process.env.LUMEN_DMG_FIXTURE);
      assert.ok(fs.existsSync(imagePath), `built DMG fixture is missing: ${imagePath}`);
      fixture = {
        imagePath,
        tempDir: null,
        mountPoint: attach(imagePath)
      };
      return fixture;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-dmg-layout-'));
    const imagePath = path.join(tempDir, 'Lumen-layout-test.dmg');
    const result = run('bash', [scriptPath, imagePath], { cwd: projectRoot });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    fixture = {
      imagePath,
      tempDir,
      mountPoint: attach(imagePath)
    };
    return fixture;
  });

  return fixturePromise;
}

function rootEntries(mountPoint) {
  return fs.readdirSync(mountPoint, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

function dsStore(mountPoint) {
  return fs.readFileSync(path.join(mountPoint, '.DS_Store'));
}

test.after(() => {
  if (fixture) {
    detach(fixture.mountPoint);
    if (fixture.tempDir) fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
});

test('@spec:AC-001 DMG monta normalmente', macOnly, async () => {
  const current = await getFixture();
  assert.ok(fs.existsSync(current.mountPoint));
});

test('@spec:AC-002 raiz contém apenas app e Applications visíveis', macOnly, async () => {
  const current = await getFixture();
  assert.deepEqual(rootEntries(current.mountPoint), ['Applications', 'Lumen.app']);
});

test('@spec:AC-003 Applications é symlink nativo para /Applications', macOnly, async () => {
  const current = await getFixture();
  const applications = path.join(current.mountPoint, 'Applications');
  assert.equal(fs.lstatSync(applications).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(applications), '/Applications');
});

// A ARTE do fundo não mora mais aqui: ela era verificada por `#f5f5f7` e pelo
// path da seta no SVG — literais que não distinguem a arte certa de um retângulo
// e que, pior, só rodavam com o fixture do DMG montado (desligado por padrão via
// LUMEN_SKIP_DMG_FIXTURE), ou seja, não rodavam em CI nenhuma. A medição de
// pixel não precisa de montagem e vive em test/brand-art-pixels.test.mjs.
// Aqui fica só o que depende mesmo do DMG: o arquivo chegar e o DS_Store apontar.
test('@spec:AC-004 fundo é entregue em .background e referenciado pelo DS_Store', macOnly, async () => {
  const current = await getFixture();
  const background = path.join(current.mountPoint, '.background', backgroundFileName);
  assert.ok(fs.existsSync(background), 'o fundo não chegou em .background/ dentro do DMG');
  assert.deepEqual(
    fs.readFileSync(background),
    fs.readFileSync(path.join(projectRoot, 'mac', backgroundFileName)),
    'o fundo embarcado no DMG tem que ser o mesmo arquivo versionado no repo',
  );
  assert.ok(dsStore(current.mountPoint).includes(Buffer.from('.background')),
    'o DS_Store precisa apontar para a pasta do fundo');
});

test('@spec:AC-005 posições persistem à esquerda e à direita', macOnly, async () => {
  const current = await getFixture();
  const store = dsStore(current.mountPoint);
  assert.equal(hasPosition(store, 170, 210), true);
  assert.equal(hasPosition(store, 570, 210), true);
});

test('@spec:AC-006 layout não depende de ordenação global', macOnly, async () => {
  const current = await getFixture();
  const store = dsStore(current.mountPoint).toString('latin1');
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(store, /arrangeBy/);
  assert.match(store, /none/);
  assert.doesNotMatch(script, /set arrangement|Sort By|Ordenar por/);
});

test('@spec:AC-007 fundo e posições sobrevivem à remontagem', macOnly, async () => {
  const current = await getFixture();
  detach(current.mountPoint);
  current.mountPoint = attach(current.imagePath);
  assert.ok(fs.existsSync(path.join(current.mountPoint, '.background', backgroundFileName)));
  assert.equal(hasPosition(dsStore(current.mountPoint), 170, 210), true);
  assert.equal(hasPosition(dsStore(current.mountPoint), 570, 210), true);
});

test('@spec:AC-008 janela persiste composição compacta', macOnly, async () => {
  const current = await getFixture();
  assert.match(dsStore(current.mountPoint).toString('latin1'), /\{\{120, 120\}, \{640, 400\}\}/);
});

test('@spec:AC-009 app mantém servidor embutido e executável', macOnly, async () => {
  const current = await getFixture();
  const app = path.join(current.mountPoint, 'Lumen.app');
  assert.equal(fs.statSync(path.join(app, 'Contents', 'MacOS', 'Lumen')).mode & 0o111, 0o111);
  assert.ok(fs.existsSync(path.join(app, 'Contents', 'Resources', 'Lumen', 'server.js')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(app, 'Contents', 'Resources', 'Lumen', 'config.json'), 'utf8')), { pinned: [] });
});

test('@spec:AC-010 bash -n passa', async () => {
  execFileSync('bash', ['-n', scriptPath], { stdio: 'pipe' });
});

test('@spec:AC-011 não existe Arraste para instalar.png visível', macOnly, async () => {
  const current = await getFixture();
  assert.equal(fs.existsSync(path.join(current.mountPoint, 'Arraste para instalar.png')), false);
  assert.equal(rootEntries(current.mountPoint).some((name) => name.endsWith('.png')), false);
});

test('@spec:AC-012 bundle e DMG não carregam backups, logs ou arquivos ignorados de public', macOnly, async () => {
  const current = await getFixture();
  const appPaths = [
    path.join(projectRoot, 'mac', 'dist', 'Lumen.app'),
    path.join(current.mountPoint, 'Lumen.app')
  ];

  for (const app of appPaths) {
    const publicDir = path.join(app, 'Contents', 'Resources', 'Lumen', 'public');
    assert.deepEqual(fs.readdirSync(publicDir).sort(), expectedPublicFiles);
    assert.deepEqual(fs.readdirSync(path.join(publicDir, 'fonts')).sort(), [
      'Inter-Regular.otf',
      'Inter-SemiBold.otf'
    ]);
    assert.equal(fs.existsSync(path.join(publicDir, 'index.html.bak')), false);
    assert.equal(fs.readdirSync(publicDir).some((name) => /(?:\.bak|\.log)$/i.test(name)), false);
  }
});

test('@spec:AC-013 install.sh usa allowlist pública explícita', () => {
  const script = fs.readFileSync(installScriptPath, 'utf8');
  const assetsScript = fs.readFileSync(path.join(projectRoot, 'mac', 'copy-public-assets.sh'), 'utf8');
  assert.match(script, /copy-public-assets\.sh/);
  assert.match(assetsScript, /PUBLIC_FILES=\(/);
  assert.match(assetsScript, /fonts\/Inter-Regular\.otf/);
  assert.match(assetsScript, /fonts\/Inter-SemiBold\.otf/);
  assert.doesNotMatch(assetsScript, /public\/mascot|usage\.js/);
  assert.doesNotMatch(assetsScript, /cp -R .*public/);
});

test('@spec:AC-343 install.sh verifica orçamento e runtime único no bundle Release', () => {
  const script = fs.readFileSync(installScriptPath, 'utf8');
  assert.match(script, /MAX_BUNDLE_SIZE_MB=121/);
  assert.match(script, /find .*node-bin\/node/);
  assert.match(script, /node_count.*-ne 1/);
  assert.match(script, /bundle_kib.*MAX_BUNDLE_SIZE_MB/);
});

test('pacote macOS não exige bundle de recursos vazio', () => {
  const script = fs.readFileSync(installScriptPath, 'utf8');
  const manifest = fs.readFileSync(path.join(projectRoot, 'mac', 'Package.swift'), 'utf8');
  assert.doesNotMatch(manifest, /resources:\s*\[\.process\("Resources"\)\]/);
  assert.doesNotMatch(script, /Lumen_Lumen\.bundle|RESOURCE_BUNDLE/);
});

test('builder do DMG não usa appdmg nem image-size vulneráveis', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(script, /appdmg|image-size/);
  assert.match(script, /hdiutil create/);
  assert.match(script, /write-dmg-ds-store\.mjs/);
});
