import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readText = async (url) => {
  try {
    return await readFile(url, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
};

const [workflow, releaseWorkflow, updater, website, readme, englishReadme, verifyDmg, smokeServer, packageDmg, mergeArchitectures, packageDmgTests] = await Promise.all([
  readText(new URL("../.github/workflows/macos-dmg.yml", import.meta.url)),
  readText(new URL("../.github/workflows/release-macos.yml", import.meta.url)),
  readText(new URL("../mac/Sources/LumenUpdateManager.swift", import.meta.url)),
  readText(new URL("../docs/src/main.js", import.meta.url)),
  readText(new URL("../README.md", import.meta.url)),
  readText(new URL("../README.en.md", import.meta.url)),
  readText(new URL("../mac/verify-dmg.sh", import.meta.url)),
  readText(new URL("../mac/smoke-packaged-server.mjs", import.meta.url)),
  readText(new URL("../mac/package-dmg.sh", import.meta.url)),
  readText(new URL("../mac/merge-app-architectures.sh", import.meta.url)),
  readText(new URL("./package-dmg.test.mjs", import.meta.url)),
]);

test("macOS matrix builds native Intel and Apple Silicon targets", () => {
  for (const buildWorkflow of [workflow, releaseWorkflow]) {
    assert.match(buildWorkflow, /runner:\s*macos-26-intel\s*\n\s*target_arch:\s*x86_64/);
    assert.match(buildWorkflow, /runner:\s*macos-26\s*\n\s*target_arch:\s*arm64/);
    assert.match(buildWorkflow, /LUMEN_TARGET_ARCH:\s*\$\{\{\s*matrix\.target_arch\s*\}\}/);
    assert.match(buildWorkflow, /mac\/verify-dmg\.sh/);
  }
});

test("native builds archive app bundles for the universal compatibility package", () => {
  for (const buildWorkflow of [workflow, releaseWorkflow]) {
    assert.match(buildWorkflow, /tar -czf[^\n]*Lumen\.app/);
    assert.match(buildWorkflow, /Lumen-macOS-\$\{\{ matrix\.artifact_suffix \}\}-app\.tar\.gz/);
    assert.match(buildWorkflow, /build-legacy-universal:/);
    const universalJob = buildWorkflow.slice(buildWorkflow.indexOf("build-legacy-universal:"));
    assert.match(universalJob, /run: npm ci/);
    assert.match(universalJob, /\(cd mac\/dist && shasum -a 256 Lumen-macOS\.dmg/);
    assert.doesNotMatch(universalJob, /shasum -a 256 mac\/dist\/Lumen-macOS\.dmg/);
    assert.match(buildWorkflow, /merge-app-architectures\.sh/);
    assert.match(buildWorkflow, /verify-dmg\.sh[^\n]* universal/);
    assert.match(buildWorkflow, /node-version:\s*24\.21\.0/);
  }
});

test("macOS workflow reruns when app, web, server, or adaptive icon inputs change", () => {
  for (const path of [
    "mac/**",
    "assets/branding/lumen-icon/**",
    "server.js",
    "package.json",
    "package-lock.json",
    "public/**",
  ]) {
    assert.ok(workflow.includes(path), `workflow does not watch ${path}`);
  }
});

test("third-party Actions are pinned to immutable commit SHAs", () => {
  const uses = [...`${workflow}\n${releaseWorkflow}`.matchAll(/^\s*uses: (.+)$/gm)].map((match) => match[1]);
  assert.ok(uses.length >= 7, `expected pinned CI and release Actions; found ${uses.length}`);
  for (const action of uses) {
    assert.match(action, /^actions\/[a-z-]+@[a-f0-9]{40} # v\d+\.\d+\.\d+$/);
  }
});

test("native CI has no PR trigger that could run edited workflow permissions", () => {
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflow, /contents:\s*write|gh release create|publish-release/);
  assert.match(workflow, /push:/);
  assert.doesNotMatch(workflow, /pull_request(?:_target)?:/);
  assert.match(workflow, /actions\/upload-artifact@/);
});

test("macOS release is manually dispatched from main and validates a main tag", () => {
  assert.match(releaseWorkflow, /workflow_dispatch:/);
  assert.match(releaseWorkflow, /if:\s*github\.ref == 'refs\/heads\/main'/);
  assert.match(releaseWorkflow, /permissions:\n  contents: read/);
  assert.match(releaseWorkflow, /git merge-base --is-ancestor/);
  assert.match(releaseWorkflow, /RELEASE_TAG/);
  assert.match(releaseWorkflow, /package\.json/);
  assert.match(releaseWorkflow, /needs:\s*validate-release/);
  assert.match(releaseWorkflow, /pattern:\s*['"]\*['"]/);
  assert.match(releaseWorkflow, /Lumen-macOS\.dmg/);
  assert.match(releaseWorkflow, /lumen\.apk/);
  assert.match(releaseWorkflow, /"\$\{apksigner\}" verify --print-certs/);
  // badging, assinatura e checksum do APK saíram daqui: eram três literais com o
  // caminho public/ cravado, e o APK deixou o git. O contrato deles virou o teste
  // "o preflight valida o MESMO APK que publica", abaixo, que não fixa caminho.
  assert.match(releaseWorkflow, /previous_version_code/);
  assert.match(releaseWorkflow, /previous_signers/);
  assert.match(releaseWorkflow, /android_version_code/);
  assert.match(releaseWorkflow, /2100000000/);
  assert.match(releaseWorkflow, /latest_apk_version_code/);
  assert.match(releaseWorkflow, /group:\s*lumen-release-publisher/);
  assert.match(releaseWorkflow, /queue:\s*max/);
  assert.match(releaseWorkflow, /EXPECTED_SHA/);
  assert.match(releaseWorkflow, /android\/app\/build\.gradle/);
  assert.match(releaseWorkflow, /public\/version\.json/);
  assert.match(releaseWorkflow, /refs\/tags\/\$\{RELEASE_TAG\}/);
  assert.match(releaseWorkflow, /permissions:\n\s+contents:\s*write/);
  assert.match(releaseWorkflow, /gh release create/);
  assert.match(releaseWorkflow, /sha256sum -c/);
  assert.doesNotMatch(releaseWorkflow.slice(releaseWorkflow.indexOf("gh release create")), /\.sha256/);
  assert.match(releaseWorkflow, /lumen-release-notes\.md/);
  assert.match(releaseWorkflow, /--notes-file "\$\{notes_file\}"/);
  assert.doesNotMatch(releaseWorkflow, /--generate-notes/);
  assert.doesNotMatch(releaseWorkflow, /pull_request:/);
});

test("release workflow invokes the resolved apksigner binary to verify every APK", () => {
  const commands = releaseWorkflow
    .split("\n")
    .filter((line) => /apksigner.*verify /.test(line));

  assert.equal(commands.length, 4, "expected current and previous APK verification in both release jobs");
  for (const command of commands) {
    assert.match(command, /"\$\{apksigner\}" verify /);
  }
});

test("release workflow captures signing certificates from each APK with apksigner", () => {
  const commands = releaseWorkflow
    .split("\n")
    .filter((line) => /apksigner.*verify --print-certs/.test(line));

  assert.equal(commands.length, 4, "expected current and previous signer checks in both release jobs");
  for (const command of commands) {
    assert.match(command, /_signer_output="\$\("\$\{apksigner\}" verify --print-certs/);
  }
});

test("release signer parser captures legacy and scheme-specific APK certificate fingerprints", () => {
  const signerParsers = [...releaseWorkflow.matchAll(/sed -nE '([^']*SHA-256 digest[^']*)'/g)]
    .map(([, pattern]) => pattern);
  const legacyDigest = "1".repeat(64);
  const v2Digest = "2".repeat(64);
  const v31Digest = "3".repeat(64);
  const signerOutput = [
    `Signer #1 certificate SHA-256 digest: ${legacyDigest}`,
    `V2 Signer: certificate SHA-256 digest: ${v2Digest}`,
    `V3.1 Signer (minSdkVersion=33, maxSdkVersion=2147483647): certificate SHA-256 digest: ${v31Digest}`,
  ].join("\n");

  assert.equal(signerParsers.length, 4, "expected all current and previous certificate parsers");
  for (const pattern of signerParsers) {
    const result = spawnSync("sed", ["-nE", pattern], { input: `${signerOutput}\n`, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${legacyDigest}\n${v2Digest}\n${v31Digest}\n`, "failed to parse every signer scheme");
  }
});

test("release workflow audits npm dependencies before tests and packaging", () => {
  const installDependencies = releaseWorkflow.indexOf("run: npm ci");
  const auditDependencies = releaseWorkflow.indexOf("run: npm audit --audit-level=high");
  const runTests = releaseWorkflow.indexOf("run: npm test");
  assert.ok(installDependencies >= 0, "dependency installation step is missing");
  assert.ok(auditDependencies > installDependencies, "dependency audit must follow npm ci");
  assert.ok(runTests > auditDependencies, "dependency audit must finish before tests and packaging");
});

test("Mac download entry points direct users to the Intel or Apple Silicon package", () => {
  assert.match(website, /releases\/latest/);
  assert.doesNotMatch(website, /releases\/latest\/download\/Lumen-macOS\.dmg/);
  for (const content of [readme, englishReadme]) {
    assert.match(content, /releases\/latest/);
    assert.match(content, /Lumen-macOS-intel-x86_64\.dmg/);
    assert.match(content, /Lumen-macOS-apple-silicon-arm64\.dmg/);
    assert.doesNotMatch(content, /releases\/latest\/download\/Lumen-macOS\.dmg/);
  }
});

test("updater selects the DMG matching the running app and supports legacy releases", () => {
  assert.match(updater, /#if arch\(arm64\)[\s\S]*Lumen-macOS-apple-silicon-arm64\.dmg/);
  assert.match(updater, /#elseif arch\(x86_64\)[\s\S]*Lumen-macOS-intel-x86_64\.dmg/);
  assert.match(updater, /architectureSpecificDMGAssetName/);
  const architectureAssetIndex = updater.indexOf("$0.name == Self.architectureSpecificDMGAssetName");
  const legacyAssetIndex = updater.indexOf('$0.name == "Lumen-macOS.dmg"');
  assert.ok(architectureAssetIndex >= 0, "architecture-specific asset lookup is missing");
  assert.ok(legacyAssetIndex > architectureAssetIndex, "legacy package must only be a fallback");
});

test("DMG is verified and its bundled app passes smoke checks before artifact upload", () => {
  const verifyStep = workflow.indexOf("mac/verify-dmg.sh");
  const uploadStep = workflow.indexOf("actions/upload-artifact@");
  assert.ok(verifyStep >= 0, "DMG verification step is missing");
  assert.ok(uploadStep > verifyStep, "artifact upload must follow DMG verification");
  assert.match(verifyDmg, /hdiutil verify/);
  assert.match(verifyDmg, /hdiutil attach[^\n]*-readonly/);
  assert.match(verifyDmg, /shasum -a 256 -c/);
  assert.match(verifyDmg, /lipo -archs/);
  assert.match(verifyDmg, /node-bin\/node/);
  assert.match(verifyDmg, /smoke-packaged-server\.mjs/);
  assert.match(verifyDmg, /universal/);
  assert.match(verifyDmg, /LUMEN_SKIP_RUNTIME_SMOKE/);
  assert.doesNotMatch(`${workflow}\n${releaseWorkflow}`, /LUMEN_SKIP_RUNTIME_SMOKE/);
  assert.match(mergeArchitectures, /lipo -create/);
  assert.match(mergeArchitectures, /lipo "\$\{temporary_binary\}" -verify_arch x86_64/);
  assert.match(mergeArchitectures, /lipo "\$\{temporary_binary\}" -verify_arch arm64/);
  assert.match(mergeArchitectures, /MAX_UNIVERSAL_BUNDLE_MB=256/);
  assert.match(mergeArchitectures, /codesign --verify --deep --strict/);
  assert.match(packageDmg, /LUMEN_APP_BUNDLE/);
  assert.match(packageDmg, /-size 300m/);
});

test("macOS matrix installs the Playwright browser before running the full suite", () => {
  const installBrowser = workflow.indexOf("npx playwright install chromium");
  const runTests = workflow.indexOf("run: npm test");
  assert.ok(installBrowser >= 0, "Chromium installation step is missing");
  assert.ok(runTests > installBrowser, "Playwright browser must be installed before npm test");
});

test("macOS workflows inspect the built DMG after the general test suite", () => {
  for (const buildWorkflow of [workflow, releaseWorkflow]) {
    const generalTests = buildWorkflow.indexOf("- name: Run project tests");
    const buildDmg = buildWorkflow.indexOf("run: ./mac/package-dmg.sh", generalTests);
    const layoutTestStep = buildWorkflow.indexOf("- name: Test architecture-specific DMG layout", buildDmg);
    const layoutTests = buildWorkflow.indexOf("node --test test/package-dmg.test.mjs", layoutTestStep);
    const verifyDmgStep = buildWorkflow.indexOf("mac/verify-dmg.sh", layoutTests);

    assert.ok(generalTests >= 0, "general project test step is missing");
    assert.ok(buildDmg > generalTests, "DMG build must follow the general suite");
    assert.ok(layoutTestStep > buildDmg, "DMG layout assertions must inspect the built artifact afterwards");
    assert.ok(layoutTests > layoutTestStep, "the layout test command is missing");
    assert.ok(verifyDmgStep > layoutTests, "artifact verification must follow layout assertions");

    const generalTestBlock = buildWorkflow.slice(generalTests, buildDmg);
    const layoutTestBlock = buildWorkflow.slice(layoutTestStep, verifyDmgStep);
    assert.match(generalTestBlock, /LUMEN_SKIP_DMG_FIXTURE/);
    assert.match(generalTestBlock, /run: npm test -- --test-concurrency=1/);
    assert.match(layoutTestBlock, /LUMEN_DMG_FIXTURE/);
  }

  assert.match(packageDmgTests, /LUMEN_SKIP_DMG_FIXTURE/);
  assert.match(packageDmgTests, /LUMEN_DMG_FIXTURE/);
});

test("packaged server smoke starts the embedded server and checks the Lumen health response", () => {
  assert.match(smokeServer, /startServer\(/);
  assert.match(smokeServer, /\/health/);
  assert.match(smokeServer, /service:\s*["']Lumen["']/);
  assert.match(smokeServer, /await server\.close\(\)/);
});

const transitionManifest = await readText(new URL("../.github/release-package-transition.json", import.meta.url));

test("release guard accepts an application ID change only for the tag declared in the transition manifest", () => {
  const declarations = releaseWorkflow.match(/release-package-transition\.json/g) ?? [];
  assert.equal(declarations.length, 2, "both the preflight and the publish guard must read the transition manifest");

  const gates = releaseWorkflow.match(/"\$\{transition_tag\}" == "\$\{RELEASE_TAG\}"/g) ?? [];
  assert.equal(gates.length, 2, "the bypass must be pinned to the dispatched release tag in both jobs");

  assert.match(releaseWorkflow, /package_transition="no"/);
  assert.match(releaseWorkflow, /transition_from_package/);
  assert.match(releaseWorkflow, /transition_to_package/);
  assert.match(releaseWorkflow, /declared-transition/);
});

test("the declared transition never relaxes the APK signer guard", () => {
  assert.match(releaseWorkflow, /"\$\{apk_signers\}" == "\$\{previous_signers\}"/);
  assert.match(releaseWorkflow, /"\$\{current_apk_signers\}" == "\$\{latest_apk_signers\}"/);

  const enforcement = releaseWorkflow.match(
    /if \[\[ "\$\{signer_match_status\}" != "match" && "\$\{signer_match_status\}" != "first-release" \]\]; then/g,
  ) ?? [];
  assert.equal(enforcement.length, 2, "both jobs must fail on any signer status other than match/first-release");

  assert.doesNotMatch(releaseWorkflow, /signer_match_status="declared-transition"/);
  assert.doesNotMatch(releaseWorkflow, /package_transition.*signer/);
});

test("release guard tolerates a repository without any previous release without disabling itself", () => {
  const firstRelease = releaseWorkflow.match(/first_release="yes"/g) ?? [];
  assert.equal(firstRelease.length, 2, "both jobs must detect the first release of the repository");
  assert.match(releaseWorkflow, /releases" --jq 'length'/);
  assert.match(releaseWorkflow, /could not resolve the latest published release/);
  // Conta só os downloads da RELEASE ANTERIOR — identificados pela tag vir de uma
  // variável `*_release_tag`. O workflow também baixa o APK de staging, que é
  // outro artefato e não pertence a esta guarda; contar `gh release download`
  // cru confundia os dois e quebrava a cada artefato novo no pipeline.
  const downloads = [...releaseWorkflow.matchAll(/gh release download\s+"\$\{\w*release_tag\}"/g)]
    .map(({ index }) => index);
  assert.equal(downloads.length, 2,
    "each job downloads the previous APK exactly once");
  for (const index of downloads) {
    const guard = releaseWorkflow.lastIndexOf('if [[ "${first_release}" == "no" ]]; then', index);
    assert.ok(guard >= 0 && index - guard < 200, "the previous-release download must sit inside the first_release guard");
  }
});

test("the transition manifest, when present, declares one tag and both application IDs", () => {
  if (!transitionManifest) return;
  const manifest = JSON.parse(transitionManifest);
  assert.match(manifest.tag, /^v[0-9]+\.[0-9]+\.[0-9]+$/);
  assert.match(manifest.fromPackage, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  assert.match(manifest.toPackage, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  assert.notEqual(manifest.fromPackage, manifest.toPackage);
  assert.ok(manifest.reason.length > 0, "the bypass must record why it was granted");
  assert.match(manifest.previousApkAsset, /\.apk$/);
});

// O preflight do APK era travado por três literais com `public/` cravado:
// `dump badging public/lumen.apk`, `(cd public && shasum -a 256 lumen.apk ...)`
// e um doesNotMatch contra a forma errada do shasum. Isso fixa a STRING, não o
// contrato — e o APK está saindo do git, então o caminho vai mudar.
//
// O que importa de verdade e não depende de onde o arquivo mora:
//   1. badging, assinatura e checksum recaem sobre o MESMO artefato. Validar um
//      arquivo e publicar outro é a falha que um literal por linha não enxerga.
//   2. o .sha256 guarda o nome NU do arquivo. Era esse o motivo do doesNotMatch:
//      `shasum -a 256 public/lumen.apk` grava "public/lumen.apk" dentro do
//      .sha256, e o `sha256sum -c` roda ao lado do artefato, onde esse caminho
//      não existe. O `cd` antes do shasum é o que mantém o nome relativo.

const semAspas = (texto) => texto.replace(/["']/g, "");

/**
 * O workflow nomeia o artefato numa variável (`apk_path="${RUNNER_TEMP}/..."`) e
 * usa a variável nos comandos. Comparar strings cruas diria que badging e
 * checksum tratam de arquivos diferentes quando tratam do mesmo. Aqui as
 * atribuições do próprio YAML são resolvidas antes de comparar — é assim que um
 * humano lê o arquivo.
 */
function resolvedor(yml) {
  const atribuicoes = new Map();
  for (const linha of yml.split("\n").map((l) => l.trim())) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=("?)([^"\s][^"]*)\2$/.exec(linha);
    if (m && !atribuicoes.has(m[1])) atribuicoes.set(m[1], m[3]);
  }
  return (texto) => {
    let saida = semAspas(texto);
    for (let i = 0; i < 5; i++) {
      const antes = saida;
      saida = saida.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (todo, nome) =>
        atribuicoes.has(nome) ? semAspas(atribuicoes.get(nome)) : todo);
      if (saida === antes) break;
    }
    return saida;
  };
}

/** Acha o comando que produz o .sha256 do APK e devolve diretório, arquivo e saída. */
function checksumDoApk(yml) {
  const linha = yml
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /shasum\s+-a\s+256/.test(l) && /lumen\.apk\.sha256/.test(l));
  assert.ok(linha, "o APK publicado precisa de um .sha256 gerado no workflow");

  const comCd = /\(\s*cd\s+(\S+)\s*&&\s*shasum\s+-a\s+256\s+(\S+)\s*>\s*(\S+)\s*\)/.exec(linha);
  const semCd = /shasum\s+-a\s+256\s+(\S+)\s*>\s*(\S+)/.exec(linha);
  if (comCd) {
    return { linha, dir: semAspas(comCd[1]), arquivo: semAspas(comCd[2]), saida: semAspas(comCd[3]) };
  }
  assert.ok(semCd, `não consegui ler o comando de checksum do APK: ${linha}`);
  return { linha, dir: null, arquivo: semAspas(semCd[1]), saida: semAspas(semCd[2]) };
}

function comandoSobre(yml, padrao) {
  return yml.split("\n").map((l) => l.trim()).filter((l) => padrao.test(l));
}

test("o checksum do APK é gravado com o nome nu, para o sha256sum -c achar o arquivo", () => {
  const { linha, dir, arquivo, saida } = checksumDoApk(releaseWorkflow);

  assert.ok(!arquivo.includes("/"),
    `o shasum recebe "${arquivo}": com diretório no argumento, o .sha256 guarda esse `
    + `caminho dentro dele e o sha256sum -c falha ao rodar do lado do artefato. `
    + `Entre no diretório antes (cd) e passe só o nome. Linha: ${linha}`);
  assert.ok(dir, `o shasum precisa rodar de dentro do diretório do APK. Linha: ${linha}`);
  assert.equal(saida, `${arquivo}.sha256`,
    "o .sha256 fica ao lado do artefato e com o nome dele");
});

test("o preflight valida o MESMO APK que publica", () => {
  const resolver = resolvedor(releaseWorkflow);
  const { dir, arquivo } = checksumDoApk(releaseWorkflow);
  const artefato = resolver(dir ? `${dir}/${arquivo}` : arquivo);

  const badging = comandoSobre(releaseWorkflow, /dump badging/).map(resolver);
  const assinatura = comandoSobre(releaseWorkflow, /verify --print-certs/).map(resolver);

  assert.ok(badging.some((c) => c.includes(artefato)),
    `nenhum "dump badging" roda sobre ${artefato}. Conferir versionCode de um APK e `
    + `publicar outro é o tipo de erro que só aparece depois do release.\n  badging: ${badging.join("\n  badging: ")}`);
  assert.ok(assinatura.some((c) => c.includes(artefato)),
    `nenhum "verify --print-certs" roda sobre ${artefato}: o APK publicado sairia sem `
    + `conferência de assinatura.\n  assinatura: ${assinatura.join("\n  assinatura: ")}`);
});

test("o APK e o checksum dele são publicados juntos", () => {
  const { arquivo, saida } = checksumDoApk(releaseWorkflow);
  for (const nome of [arquivo, saida]) {
    assert.ok(releaseWorkflow.includes(nome),
      `${nome} precisa estar entre os artefatos do release`);
  }
});
