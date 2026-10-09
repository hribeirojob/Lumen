import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Lumen é produto novo: não herda a numeração do Dokke. O applicationId mudou
// (com.lumen.app), então não existe upgrade in-place a preservar e o versionCode
// recomeça em 1 — assim como o build number do bundle macOS.
const VERSION = "0.1.0";
const ANDROID_VERSION_CODE = 1;
const MAC_BUILD = 1;

const [packageJson, packageLock, publicVersion, androidGradle, macPlist, serverManager, contentView, changelog] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  readFile(new URL("../public/version.json", import.meta.url), "utf8"),
  readFile(new URL("../android/app/build.gradle", import.meta.url), "utf8"),
  readFile(new URL("../mac/Info.plist", import.meta.url), "utf8"),
  readFile(new URL("../mac/Sources/ServerManager.swift", import.meta.url), "utf8"),
  readFile(new URL("../mac/Sources/ContentView.swift", import.meta.url), "utf8"),
  readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8"),
]);

test(`todos os metadados apontam para o primeiro Lumen v${VERSION}`, () => {
  assert.equal(JSON.parse(packageJson).version, VERSION);
  assert.equal(JSON.parse(packageLock).version, VERSION);
  assert.equal(JSON.parse(packageLock).packages[""].version, VERSION);
  assert.deepEqual(JSON.parse(publicVersion), { tag: `v${VERSION}`, apkVersion: VERSION });
  assert.match(androidGradle, new RegExp(`versionName = "${VERSION.replace(/\./g, "\\.")}"`));
  assert.match(macPlist, new RegExp(`<key>CFBundleShortVersionString</key>\\s*<string>${VERSION.replace(/\./g, "\\.")}</string>`));
  assert.match(serverManager, new RegExp(`packageVersionFallback = "${VERSION.replace(/\./g, "\\.")}"`));
  assert.match(contentView, new RegExp(`\\?\\? "${VERSION.replace(/\./g, "\\.")}"`));
  assert.match(contentView, /accessibilityAddTraits\(\.isHeader\)/);
});

test("a numeração de build recomeça do zero: nada do Dokke sobrevive", () => {
  // âncora de fim de linha: `versionCode = 1` não pode passar com `versionCode = 14`
  assert.match(androidGradle, new RegExp(`versionCode = ${ANDROID_VERSION_CODE}\\s*$`, "m"));
  assert.match(macPlist, new RegExp(`<key>CFBundleVersion</key>\\s*<string>${MAC_BUILD}</string>`));
});

test("o CHANGELOG abre com a entrada do primeiro release Lumen", () => {
  const firstEntry = changelog.match(/^## v.+$/m);
  assert.ok(firstEntry, "o CHANGELOG precisa ter ao menos uma entrada de versão");
  // a data é de quem fecha o release; o contrato aqui é a versão no topo
  assert.match(firstEntry[0], new RegExp(`^## v${VERSION.replace(/\./g, "\\.")} — .+`));
});
