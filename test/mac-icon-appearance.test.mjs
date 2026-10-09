import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDocument = path.join(root, "assets", "branding", "lumen-icon", "Lumen.icon");
const plist = readFileSync(path.join(root, "mac", "Info.plist"), "utf8");
const installScript = readFileSync(path.join(root, "mac", "install.sh"), "utf8");

test("o documento Icon Composer do Lumen está completo e versionado", () => {
  assert.ok(existsSync(path.join(iconDocument, "icon.json")));
  assert.ok(existsSync(path.join(iconDocument, "Assets")));
  assert.match(readFileSync(path.join(iconDocument, "icon.json"), "utf8"), /supported-platforms/);
});

test("o bundle Mac declara o ícone adaptativo e o fallback legado", () => {
  assert.match(plist, /<key>CFBundleIconFile<\/key>\s*<string>Lumen\.icns<\/string>/);
  assert.match(plist, /<key>CFBundleIconName<\/key>\s*<string>Lumen<\/string>/);
});

test("install.sh compila o Icon Composer e não empacota o fonte cru", () => {
  assert.match(installScript, /actool/);
  assert.match(installScript, /Lumen\.icon/);
  assert.match(installScript, /Assets\.car/);
  assert.match(installScript, /Lumen\.icns/);
  assert.match(installScript, /raw.*\.icon.*bundle|\.icon.*not.*bundle/i);
});
