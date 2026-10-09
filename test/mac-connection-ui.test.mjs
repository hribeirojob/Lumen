import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contentView = await readFile(new URL("../mac/Sources/ContentView.swift", import.meta.url), "utf8");
const app = await readFile(new URL("../mac/Sources/LumenApp.swift", import.meta.url), "utf8");
const theme = await readFile(new URL("../mac/Sources/LumenTheme.swift", import.meta.url), "utf8");

const about = contentView.slice(
  contentView.indexOf("struct AboutView"),
  contentView.indexOf("private struct QRCodeView")
);
const sidebar = contentView.slice(
  contentView.indexOf("private var sidebar: some View"),
  contentView.indexOf("private var detail: some View")
);
const header = contentView.slice(
  contentView.indexOf("private var header: some View"),
  contentView.indexOf("private var sidebarToggleButton: some View")
);
const menuBar = contentView.slice(contentView.indexOf("struct MenuBarView"));
const dockStore = await readFile(new URL("../mac/Sources/DockStore.swift", import.meta.url), "utf8");

test("tela de conexão prioriza o código e esconde configuração técnica", () => {
  assert.match(contentView, /case about = "Conectar"/);
  assert.match(contentView, /private let aboutContentMaxWidth: CGFloat = 980/);
  assert.match(about, /\.frame\(maxWidth: aboutContentMaxWidth, alignment: \.leading\)/);
  assert.match(about, /\.frame\(maxWidth: \.infinity, alignment: \.center\)/);
  assert.match(about, /AccessCodeView/);
  assert.equal(about.includes('TextField("http://127.0.0.1:3000"'), false);
  assert.doesNotMatch(contentView.slice(0, contentView.indexOf("struct AboutView")), /UpdateBanner/);
});

test("seletor de idioma aparece uma vez, compacto e alinhado à direita", () => {
  const languageRow = about.slice(about.indexOf("HStack {"), about.indexOf("VStack(alignment: .leading, spacing: 4)"));

  assert.match(languageRow, /Text\(I18n\.text\("aria\.language"/);
  assert.match(languageRow, /Spacer\(\)/);
  assert.match(languageRow, /Picker\("", selection:/);
  assert.match(languageRow, /\.labelsHidden\(\)/);
  assert.match(languageRow, /\.pickerStyle\(\.menu\)/);
  assert.match(languageRow, /\.fixedSize\(\)/);
  assert.match(languageRow, /\.accessibilityLabel\(I18n\.text\("aria\.language"/);
  assert.doesNotMatch(languageRow, /Picker\("Idioma"/);
});

test("PIN volta a ser carregado quando o servidor sobe depois do primeiro refresh", () => {
  const status = dockStore.slice(
    dockStore.indexOf("func pingStatus() async"),
    dockStore.indexOf("private func pingHealthOnly"),
  );

  assert.match(status, /if pinCode == nil \{\s*await loadPin\(\)\s*\}/);
  assert.match(about, /\.task \{[\s\S]*await store\.loadPin\(\)[\s\S]*\}/);
});

test("Conectar reserva 40pt para o header sem deslocar a grade de Apps", () => {
  assert.match(
    about,
    /ScrollView \{[\s\S]*?\}\s*\.padding\(\.top, 40\)\s*\.frame\(maxWidth: \.infinity, maxHeight: \.infinity, alignment: \.topLeading\)/,
  );
  assert.doesNotMatch(contentView.slice(0, contentView.indexOf("struct AboutView")), /DockGridView\(\)\s*\.padding\(\.top, 40\)/);
});

test("janela principal abre menor por padrão sem reduzir os tamanhos mínimos", () => {
  assert.match(app, /\.frame\(minWidth: 840, idealWidth: 980, minHeight: 540, idealHeight: 628\)/);
  assert.match(app, /\.defaultSize\(width: 980, height: 628\)/);
  assert.match(app, /titlebarAppearsTransparent = true/);
  assert.match(app, /styleMask\.insert\(\.fullSizeContentView\)/);
  assert.match(app, /viewDidMoveToWindow\(\)/);
  assert.match(app, /windowResizability\(\.contentMinSize\)/);
  assert.match(contentView, /ignoresSafeArea\(\.container, edges: \.top\)/);
});

test("AppKit configura a janela sem título duplicado nem debug temporário", () => {
  assert.match(app, /WindowStyleConfigurator/);
  assert.doesNotMatch(app, /SidebarFrameView/);
  assert.doesNotMatch(app, /SidebarTitleView/);
  assert.doesNotMatch(app, /\/tmp\/lumen-tf\.txt/);
});

test("janela principal deixa o macOS desenhar uma única moldura arredondada", () => {
  assert.match(app, /styleMask\.insert\(\.fullSizeContentView\)/);
  assert.doesNotMatch(app, /let windowCornerRadius: CGFloat = 28/);
  assert.doesNotMatch(app, /window\.isOpaque = false/);
  assert.doesNotMatch(app, /window\.backgroundColor = \.clear/);
  assert.doesNotMatch(app, /contentView\.wantsLayer = true/);
  assert.doesNotMatch(app, /contentView\.layer\?\.cornerRadius/);
  assert.doesNotMatch(app, /contentView\.layer\?\.masksToBounds/);
});

test("sidebar flutuante replica largura, seleção opaca e contraste da referência", () => {
  assert.match(contentView, /sidebar\s*\.frame\(width: isSidebarVisible \? 208 : 0\)/);
  assert.match(sidebar, /VStack\(alignment: \.leading, spacing: 4\)/);
  assert.match(sidebar, /Image\(systemName: item\.icon\)/);
  assert.match(sidebar, /\.font\(\.system\(size: 12, weight: \.medium\)\)/);
  assert.match(sidebar, /\.font\(\.system\(size: 13, weight: \.medium\)\)/);
  assert.match(sidebar, /\.frame\(width: 14, height: 14\)/);
  assert.match(sidebar, /\.frame\(height: 28\)/);
  assert.match(sidebar, /\.padding\(\.horizontal, 10\)/);
  assert.match(sidebar, /\.padding\(\.leading, 16\)/);
  assert.match(sidebar, /\.padding\(\.trailing, 16\)/);
  assert.match(sidebar, /Color\.clear\s*\.frame\(width: trafficLightsClearance\)/);
  assert.doesNotMatch(contentView, /\.overlay\(alignment: \.trailing\) \{\s*Rectangle\(\)/s);
  assert.match(sidebar, /cornerRadius: 6/);
  assert.match(sidebar, /hoveredSidebarItem/);
  assert.match(sidebar, /LumenTheme\.selection/);
  assert.doesNotMatch(sidebar, /Label\(item\.rawValue, systemImage: item\.icon\)/);
  assert.match(contentView, /\.foregroundStyle\(selection == item \? Color\.white : Color\.white\.opacity\(0\.58\)\)/);
  assert.match(contentView, /case apps = "Slots"/);
  assert.match(contentView, /case about = "Conectar"/);
});

/** Recorta o bloco delimitado que segue um marcador, contando aninhamento. */
function bloco(fonte, marcador, abre = "{", fecha = "}") {
  const inicio = fonte.indexOf(marcador);
  assert.ok(inicio >= 0, `bloco \`${marcador}\` não encontrado`);
  const comeco = fonte.indexOf(abre, inicio);
  let nivel = 0;
  for (let i = comeco; i < fonte.length; i++) {
    if (fonte[i] === abre) nivel++;
    else if (fonte[i] === fecha && --nivel === 0) return fonte.slice(comeco + 1, i);
  }
  assert.fail(`bloco \`${marcador}\` não fecha`);
}

// O contrato do cartão da sidebar é a TRANSLUCIDEZ: o Liquid Glass precisa
// continuar enxergando o que está atrás. `Color.clear` era só uma das formas de
// cumprir isso — pinar essa forma proibia dessaturar a base, e ainda por cima a
// asserção varria o arquivo inteiro, então qualquer `.fill(Color.clear)` perdido
// em outra view a satisfazia. Aqui a verificação é do BLOCO, e o que ela proíbe
// é preenchimento OPACO, venha de onde vier.
const FILL_TRANSLUCIDO = /^LumenTheme\.[A-Za-z0-9]+\.opacity\((\d*\.?\d+)\)$/;
const OPACIDADE_MAX_DA_BASE = 0.25;

test("fundo da sidebar continua translúcido sob o Liquid Glass", () => {
  const fundo = bloco(sidebar, ".background {");

  const cartoes = fundo.match(/RoundedRectangle\(cornerRadius: \d+/g) ?? [];
  assert.ok(cartoes.length >= 2, "as duas pernas do #available precisam desenhar o cartão");
  for (const cartao of cartoes) {
    assert.equal(cartao, "RoundedRectangle(cornerRadius: 18", "o raio do cartão é 18 nas duas pernas");
  }

  assert.match(fundo, /#available\(macOS 26, \*\)/, "o Liquid Glass fica atrás de disponibilidade");
  assert.match(fundo, /\.glassEffect\(\.regular/, "é o glassEffect que produz o vidro — não pode sumir");

  const fills = [...fundo.matchAll(/^\s*\.fill\((.+)\)\s*$/gm)].map(m => m[1]);
  for (const fill of fills) {
    if (fill === "Color.clear") continue;
    const tinta = fill.match(FILL_TRANSLUCIDO);
    assert.ok(tinta, `.fill(${fill}) é opaco: taparia o vidro. Use Color.clear ou LumenTheme.<token>.opacity(x)`);
    assert.ok(Number(tinta[1]) <= OPACIDADE_MAX_DA_BASE,
      `.fill(${fill}) passa de ${OPACIDADE_MAX_DA_BASE}: é superfície, não base dessaturada`);
  }

  // a moldura do cartão é o .overlay logo DEPOIS do fundo — a sidebar tem outros
  const moldura = bloco(sidebar.slice(sidebar.indexOf(".background {")), ".overlay(", "(", ")");
  assert.match(moldura, /\.strokeBorder\(Color\.white\.opacity\(0\.14\), lineWidth: 1\)/,
    "a borda de 1px é o que separa o cartão do canvas");
});

test("ícone de recolher alterna a sidebar de verdade", () => {
  assert.match(contentView, /@State private var isSidebarVisible = true/);
  assert.match(contentView, /Button \{\s*withAnimation\(\.easeOut\(duration: 0\.2\)\) \{\s*isSidebarVisible\.toggle\(\)/s);
  assert.match(contentView, /Image\(systemName: "sidebar\.left"\)/);
  assert.match(contentView, /\.animation\(\.easeOut\(duration: 0\.2\), value: isSidebarVisible\)/);
  assert.match(contentView, /Color\.clear\s*\.frame\(width: isSidebarVisible \? 208 : trafficLightsClearance\)/);
  assert.match(contentView, /standardWindowButton\(\.zoomButton\)/);
  assert.match(contentView, /standardWindowButton\(\.closeButton\)/);
  assert.match(contentView, /trafficLightsMidY - headerHeight \/ 2/);
  assert.match(contentView, /contentView\.bounds\.height - closeRect\.midY/);
  assert.match(header, /Color\.clear\s*\.frame\(width: isSidebarVisible \? 208 : trafficLightsClearance\)[\s\S]*?if !isSidebarVisible \{\s*sidebarToggleButton\s*\}[\s\S]*?Text\("Lumen"\)/s);
  assert.match(sidebar, /Spacer\(\)\s*sidebarToggleButton\s*\.padding\(\.trailing, 8\)/s);
  assert.match(sidebar, /\.offset\(y: trafficLightsMidY - headerHeight \/ 2 - 16\)/);
  assert.match(sidebar, /\.padding\(\.top, 8\)/);
  assert.doesNotMatch(sidebar, /\.padding\(\.bottom, 12\)/);
  assert.doesNotMatch(app, /SidebarFrameView/);
});

test("semáforos deixam respiro da moldura quando a sidebar está visível", () => {
  assert.match(contentView, /let dx: CGFloat = 12/);
  assert.match(contentView, /let dy: CGFloat = -10/);
  assert.doesNotMatch(contentView, /let d[xy]: CGFloat = isSidebarVisible/);
});

test("sidebar não projeta sombra adicional sobre o canvas", () => {
  assert.doesNotMatch(sidebar, /\.shadow\(/);
});

// Fonte única da paleta: nota `palette-lumen`. O valor fica PINADO de propósito —
// trocar a marca é decisão deliberada, e o teste existe para que uma troca de
// canal por descuido (refator, merge, copiar/colar de swatch) não passe calada.
// O que mudou: o esperado agora é o HEX do token na escala, não um número solto
// amostrado de captura — a asserção passa a nomear de onde a cor vem.
const PALETA = {
  canvas: { token: "surface-2", hex: "#3A0B4F" },
  page: { token: "ground", hex: "#140720" },
  selection: { token: "accent", hex: "#8F3DAF" },
};

const canaisDoHex = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

function canaisDoTema(nome) {
  const match = theme.match(
    new RegExp(`static let ${nome} = Color\\(red: ([\\d.]+), green: ([\\d.]+), blue: ([\\d.]+)\\)`),
  );
  assert.ok(match, `${nome} deve usar RGB explícito`);
  return match.slice(1).map(Number);
}

// luminância relativa WCAG: ordena as superfícies sem depender do tom
function luminancia([r, g, b]) {
  const linear = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

test("paleta do Mac usa os tokens da escala Lumen", () => {
  for (const [nome, { token, hex }] of Object.entries(PALETA)) {
    const esperado = canaisDoHex(hex);
    canaisDoTema(nome).forEach((valor, i) => {
      assert.ok(Math.abs(valor - esperado[i]) <= 0.002,
        `${nome} devia ser ${token} ${hex}: componente ${i} fora do contrato`);
    });
  }
});

test("a hierarquia da paleta sobrevive a qualquer troca de marca", () => {
  const canvas = canaisDoTema("canvas");
  const page = canaisDoTema("page");
  const selection = canaisDoTema("selection");

  const distintos = new Set([canvas, page, selection].map(c => c.join(",")));
  assert.equal(distintos.size, 3, "três tokens que colidem deixam a interface sem relevo");
  assert.ok(luminancia(page) < luminancia(canvas),
    "page é o chão: tem que ser mais escuro que o canvas que se apoia nele");
  assert.ok(luminancia(selection) > luminancia(canvas),
    "selection é interativo: tem que saltar do canvas, não afundar nele");
});

test("menu bar abre o Lumen, sincroniza dados e expõe atualização somente quando necessário", () => {
  assert.match(app, /Window\("Lumen", id: "main"\)/);
  assert.doesNotMatch(app, /WindowGroup\("Lumen", id: "main"\)/);
  assert.match(menuBar, /@EnvironmentObject private var updater: LumenUpdateManager/);
  assert.match(menuBar, /openWindow\(id: "main"\)/);
  assert.match(menuBar, /I18n\.text\("menu\.sync"/);
  assert.match(menuBar, /I18n\.text\("updates\.check"/);
});

test("menu bar mantém o topo neutro e exibe métricas úteis", () => {
  const intro = menuBar.slice(0, menuBar.indexOf("Divider()"));
  assert.doesNotMatch(intro, /Image\(systemName: "circle\.fill"\)/);
  assert.doesNotMatch(intro, /Text\("Lumen"\)/);
  assert.doesNotMatch(menuBar, /Lumen online|Lumen offline/);
  assert.match(menuBar, /I18n\.text\("menu\.device"/);
  assert.match(menuBar, /I18n\.text\("menu\.pinned"/);
  assert.doesNotMatch(menuBar, /Dispositivos conectados|Slots fixados/);
  assert.match(menuBar, /\.font\(\.caption\)/);
  assert.match(menuBar, /\.foregroundStyle\(\.secondary\)/);
});

test("menu bar usa ícones nos comandos e mostra a versão no rodapé", () => {
  assert.match(menuBar, /I18n\.text\("menu\.open"/);
  assert.match(menuBar, /I18n\.text\("menu\.sync"/);
  assert.match(menuBar, /I18n\.text\("updates\.check"/);
  assert.match(menuBar, /I18n\.text\("updates\.install"/);
  assert.match(menuBar, /I18n\.text\("menu\.quit"/);
  assert.match(menuBar, /CFBundleShortVersionString/);
  const footer = menuBar.slice(menuBar.lastIndexOf("      Divider()"));
  assert.match(footer, /Button\s*\{\s*\}\s*label: \{/);
  assert.match(footer, /HStack\(alignment: \.center, spacing: 0\)/);
  assert.match(footer, /I18n\.text\("menu\.version"/);
  assert.match(footer, /fixedSize\(horizontal: true, vertical: false\)/);
  assert.match(footer, /Spacer\(minLength: 12\)[\s\S]*Text\("Lumen"\)/);
  assert.match(footer, /\.frame\(width: 250, alignment: \.leading\)/);
  assert.match(footer, /\.disabled\(true\)/);
  assert.match(menuBar, /\.frame\(minWidth: 250\)/);
});

test("menu bar usa o glifo atualizado do Lumen em monocromático", () => {
  assert.match(app, /MenuBarExtra\s*\{\s*MenuBarView\(\)/);
  assert.match(app, /private enum MenuBarIconImage/);
  assert.match(app, /NSImage\(\s*size: NSSize\(width: 18, height: 18\),\s*flipped: true/);
  assert.match(app, /image\.isTemplate = true/);
  assert.match(app, /Image\(nsImage: MenuBarIconImage\.image\)/);
  assert.match(app, /frame\(width: 18, height: 18\)/);
  assert.match(app, /MenuBarIcon\(\)\s*\.accessibilityLabel\("Lumen"\)/);
  assert.doesNotMatch(app, /NSApplication\.shared\.applicationIconImage/);
  assert.doesNotMatch(app, /Canvas\s*\{/);
});

test("cards de código e QR compartilham largura total, padding, raio e espaçamento idênticos", () => {
  const codeCard = about.slice(
    about.indexOf("VStack(spacing: 16)"),
    about.lastIndexOf("VStack(alignment: .leading, spacing: 16)")
  );
  const qrCard = about.slice(
    about.lastIndexOf("VStack(alignment: .leading, spacing: 16)"),
    about.indexOf("Servidor online")
  );
  const accessCodeView = about.slice(about.indexOf("private struct AccessCodeView"));

  assert.match(codeCard, /VStack\(spacing: 16\)/);
  assert.doesNotMatch(codeCard, /VStack\(alignment: \.leading/);
  assert.match(codeCard, /\.frame\(maxWidth: \.infinity\)\s*\.padding\(16\)/);
  assert.match(codeCard, /cornerRadius: 16/);
  assert.doesNotMatch(codeCard, /\.padding\(22\)/);
  assert.match(qrCard, /VStack\(alignment: \.leading, spacing: 16\)/);
  assert.match(qrCard, /\.frame\(maxWidth: \.infinity, alignment: \.leading\)\s*\.padding\(16\)/);
  assert.match(qrCard, /cornerRadius: 16/);
  assert.doesNotMatch(qrCard, /cornerRadius: 12/);
  assert.doesNotMatch(qrCard, /\.frame\(maxWidth: \.infinity\)\s*\n\s*Text\("O Mac e o dispositivo/);
  assert.match(accessCodeView, /VStack\(spacing: 14\)/);
  assert.match(accessCodeView, /\.frame\(maxWidth: \.infinity\)/);
  assert.match(accessCodeView, /\.frame\(width: 64, height: 76\)/);
});
