#!/usr/bin/env bash
# Build Lumen as a real .app and install once (default: ~/Applications).
# Does NOT leave a second .app under mac/dist (avoids Launchpad duplicate).
# Usage:
#   ./install.sh
#   ./install.sh --open
#   ./install.sh --system
#   ./install.sh --build-only   # writes only mac/dist then exits (dev)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${ROOT}/.." && pwd)"
APP_NAME="Lumen"
BIN_NAME="Lumen"
DEST_DIR="${HOME}/Applications"
OPEN_AFTER=0
BUILD_ONLY=0
MAX_BUNDLE_SIZE_MB=121
VERIFY_BUNDLE=""
SWIFT_SDK_ARGS=()
TARGET_ARCH="${LUMEN_TARGET_ARCH:-$(uname -m)}"

case "${TARGET_ARCH}" in
  arm64) TARGET_TRIPLE="arm64-apple-macosx14.0" ;;
  x86_64) TARGET_TRIPLE="x86_64-apple-macosx14.0" ;;
  *)
    echo "error: LUMEN_TARGET_ARCH deve ser arm64 ou x86_64; recebido: ${TARGET_ARCH}" >&2
    exit 1
    ;;
esac

DIST_DIR="${LUMEN_DIST_DIR:-${ROOT}/dist}"
if [[ "${DIST_DIR}" != /* ]]; then
  DIST_DIR="${PROJECT_ROOT}/${DIST_DIR}"
fi

# SwiftUI in the Command Line Tools 26 SDK family includes the macro runtime
# used by this package. Newer SDKs can expose the State macro declaration
# without shipping SwiftUIMacros, which makes a normal `swift build` fail
# before the app is compiled. Keep the override for CI/other Macs, then use
# the newest compatible 26.x SDK installed locally.
if [[ -n "${LUMEN_SDK:-}" ]]; then
  if [[ ! -d "${LUMEN_SDK}" ]]; then
    echo "error: LUMEN_SDK não existe: ${LUMEN_SDK}" >&2
    exit 1
  fi
  SWIFT_SDK_ARGS=(--sdk "${LUMEN_SDK}")
else
  for candidate in \
    "/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk" \
    "/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk" \
    /Library/Developer/CommandLineTools/SDKs/MacOSX26*.sdk; do
    if [[ -d "${candidate}" ]]; then
      SWIFT_SDK_ARGS=(--sdk "${candidate}")
      break
    fi
  done
  if [[ ${#SWIFT_SDK_ARGS[@]} -eq 0 ]]; then
    echo "warn: SDK MacOS 26.x não encontrado; usando o SDK padrão do Swift. Se SwiftUIMacros falhar, defina LUMEN_SDK para um SDK compatível." >&2
  fi
fi

swift_build() {
  swift build "${SWIFT_SDK_ARGS[@]}" --triple "${TARGET_TRIPLE}" "$@"
}

verify_architecture() {
  local binary_path="$1" archs
  if ! command -v lipo >/dev/null 2>&1; then
    echo "error: lipo é necessário para verificar a arquitetura de ${binary_path}" >&2
    exit 1
  fi
  archs="$(lipo -archs "${binary_path}" 2>/dev/null)" || {
    echo "error: não foi possível ler a arquitetura de ${binary_path}" >&2
    exit 1
  }
  if [[ " ${archs} " != *" ${TARGET_ARCH} "* ]]; then
    echo "error: ${binary_path} tem arquitetura(s) ${archs}; esperado ${TARGET_ARCH}" >&2
    exit 1
  fi
}

verify_node_dependencies() {
  local binary_path="$1" dependencies line dependency
  if ! command -v otool >/dev/null 2>&1; then
    echo "error: otool é necessário para verificar as bibliotecas do Node embutido" >&2
    return 1
  fi
  if ! dependencies="$(otool -L "${binary_path}" 2>/dev/null)"; then
    echo "error: não foi possível inspecionar as bibliotecas de ${binary_path}" >&2
    return 1
  fi

  while IFS= read -r line; do
    [[ "${line}" == *" (compatibility version "* ]] || continue
    dependency="${line%% (*}"
    dependency="${dependency#"${dependency%%[![:space:]]*}"}"
    [[ -n "${dependency}" ]] || continue
    case "${dependency}" in
      *"/../"*|*"/..")
        echo "warn: Node depende de biblioteca fora do sistema (${dependency}); use outro runtime" >&2
        return 1
        ;;
      /System/Library/*|/usr/lib/*) ;;
      *)
        echo "warn: Node depende de biblioteca fora do sistema (${dependency}); use outro runtime" >&2
        return 1
        ;;
    esac
  done < <(printf '%s\n' "${dependencies}")
}

find_actool() {
  local candidate help_output
  local -a candidates=()

  if [[ -n "${LUMEN_ACTOOL:-}" ]]; then
    candidates+=("${LUMEN_ACTOOL}")
  fi
  if [[ -n "${DEVELOPER_DIR:-}" ]]; then
    candidates+=("${DEVELOPER_DIR}/usr/bin/actool")
  fi
  candidate="$(xcrun --find actool 2>/dev/null || true)"
  if [[ -n "${candidate}" ]]; then
    candidates+=("${candidate}")
  fi
  candidates+=("/Applications/Xcode.app/Contents/Developer/usr/bin/actool")

  for candidate in "${candidates[@]}"; do
    [[ -x "${candidate}" ]] || continue
    help_output="$("${candidate}" --help 2>&1 || true)"
    if [[ "${help_output}" == *"actool"* && "${help_output}" != *"requires Xcode"* ]]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done
  return 1
}

validate_bundle_budget() {
  local bundle_path="$1" node_count bundle_kib max_bundle_kib
  if [[ ! -d "${bundle_path}" ]]; then
    echo "error: bundle not found: ${bundle_path}" >&2
    exit 1
  fi

  node_count="$(find "${bundle_path}/Contents/Resources" -type f -path '*/node-bin/node' -perm -111 | wc -l | tr -d '[:space:]')"
  if [[ "${node_count}" -ne 1 ]]; then
    echo "error: expected exactly one embedded Node runtime, found ${node_count}" >&2
    exit 1
  fi

  verify_architecture "${bundle_path}/Contents/MacOS/${BIN_NAME}"
  verify_architecture "${bundle_path}/Contents/Resources/Lumen/bin/LumenIconHelper.app/Contents/MacOS/LumenIconHelper"
  verify_architecture "$(find "${bundle_path}/Contents/Resources" -type f -path '*/node-bin/node' -perm -111 -print -quit)"

  bundle_kib="$(du -sk "${bundle_path}" | awk '{print $1}')"
  max_bundle_kib="$((MAX_BUNDLE_SIZE_MB * 1024))"
  if [[ "${bundle_kib}" -gt "${max_bundle_kib}" ]]; then
    echo "error: Lumen.app is ${bundle_kib} KiB; budget is ${MAX_BUNDLE_SIZE_MB} MiB" >&2
    exit 1
  fi
  echo "==> bundle budget OK (${bundle_kib} KiB <= ${MAX_BUNDLE_SIZE_MB} MiB; one Node runtime)"
}

# Caminho canônico de um .app (resolve symlink e caminho relativo). Se o
# caminho não existe, devolve ele mesmo — quem chama já filtrou por -e.
canonical_app_path() {
  ( cd "$1" >/dev/null 2>&1 && pwd -P ) || printf '%s' "$1"
}

app_mtime() {
  stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$1" 2>/dev/null || echo "data desconhecida"
}

# O script antes imprimia "Only one copy" incondicionalmente, sem nunca ter
# olhado o disco: instalando em ~/Applications ele ignorava /Applications (e o
# contrário com --system), então duas cópias conviviam — uma delas com arte
# antiga — enquanto a mensagem dizia que estava tudo certo. Aqui a afirmação só
# sai depois da verificação; achando outra cópia, o script diz onde está e o que
# remover, e NÃO remove nada por conta própria.
report_app_copies() {
  local installed="$1" candidate canonical_installed
  local -a others=()
  canonical_installed="$(canonical_app_path "${installed}")"

  for candidate in \
    "/Applications/${APP_NAME}.app" \
    "${HOME}/Applications/${APP_NAME}.app" \
    "${ROOT}/dist/${APP_NAME}.app"
  do
    [[ -e "${candidate}" ]] || continue
    [[ "$(canonical_app_path "${candidate}")" == "${canonical_installed}" ]] && continue
    others+=("${candidate}")
  done

  if [[ "${#others[@]}" -eq 0 ]]; then
    echo "Verificado: só existe esta cópia. Open via Spotlight: ${APP_NAME}"
    return 0
  fi

  echo "warn: existem ${#others[@]} outra(s) cópia(s) de ${APP_NAME}.app no disco." >&2
  echo "warn: o Spotlight e o Launchpad podem abrir a cópia errada — foi assim que" >&2
  echo "warn: uma instalação antiga, com o ícone velho, passou por atual." >&2
  echo "warn: recém-instalada  -> ${installed} ($(app_mtime "${installed}"))" >&2
  for candidate in "${others[@]}"; do
    echo "warn: cópia a remover -> ${candidate} ($(app_mtime "${candidate}"))" >&2
  done
  echo "warn: remova com:" >&2
  for candidate in "${others[@]}"; do
    printf 'warn:   rm -rf %q\n' "${candidate}" >&2
  done
  return 0
}

# O server embutido só sobe com a dependência ws. Sem esta checagem o script
# podia imprimir "OK installed" depois de um npm ci que falhou, entregando um
# app que abre e nunca conecta.
report_runtime_health() {
  local installed="$1"
  if [[ -d "${installed}/Contents/Resources/${APP_NAME}/node_modules/ws" ]]; then
    return 0
  fi
  echo "warn: ws ausente em ${installed}/Contents/Resources/${APP_NAME}/node_modules" >&2
  echo "warn: o app abre mas o server não sobe. Rode o install.sh de novo com npm" >&2
  echo "warn: funcionando, ou confira o erro do npm ci acima." >&2
  return 0
}

for arg in "$@"; do
  case "$arg" in
    --system) DEST_DIR="/Applications" ;;
    --open) OPEN_AFTER=1 ;;
    --build-only) BUILD_ONLY=1 ;;
    --verify-bundle=*) VERIFY_BUNDLE="${arg#--verify-bundle=}" ;;
    -h|--help)
      echo "Usage: ./install.sh [--open] [--system] [--build-only] [--verify-bundle=PATH]"
      exit 0
      ;;
  esac
done

if [[ -n "${VERIFY_BUNDLE}" ]]; then
  validate_bundle_budget "${VERIFY_BUNDLE}"
  exit 0
fi

echo "==> release build (${BIN_NAME})"
cd "${ROOT}"
swift_build -c release --product "${BIN_NAME}"
swift_build -c debug --product "LumenIconHelper"

BIN_PATH="$(swift_build -c release --show-bin-path)/${BIN_NAME}"
if [[ ! -x "${BIN_PATH}" ]]; then
  echo "error: missing binary: ${BIN_PATH}" >&2
  exit 1
fi
# O binário release não precisa carregar símbolos locais para distribuição.
# Removê-los reduz o app sem alterar o executável ou o comportamento do host.
if command -v strip >/dev/null 2>&1; then
  strip -x "${BIN_PATH}"
fi
ICON_HELPER_PATH="$(swift_build -c debug --show-bin-path)/LumenIconHelper"
if [[ ! -x "${ICON_HELPER_PATH}" ]]; then
  echo "error: missing icon helper: ${ICON_HELPER_PATH}" >&2
  exit 1
fi

# pack in a private temp dir so Spotlight never sees two copies
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/lumen-app.XXXXXX")"
cleanup() { rm -rf "${STAGE}"; }
trap cleanup EXIT

APP_BUNDLE="${STAGE}/${APP_NAME}.app"
echo "==> pack ${APP_NAME}.app"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"
cp "${BIN_PATH}" "${APP_BUNDLE}/Contents/MacOS/${BIN_NAME}"
chmod +x "${APP_BUNDLE}/Contents/MacOS/${BIN_NAME}"
cp "${ROOT}/Info.plist" "${APP_BUNDLE}/Contents/Info.plist"
# O .icns mantém compatibilidade com sistemas anteriores ao Icon Composer.
# Aqui só validamos a existência, para falhar cedo: a cópia em si acontece
# DEPOIS do actool — ver o comentário no bloco do ícone adaptativo.
if [[ ! -f "${ROOT}/AppIcon.icns" ]]; then
  echo "error: legacy icon missing: ${ROOT}/AppIcon.icns" >&2
  exit 1
fi

# The raw .icon source is compiled by actool into Assets.car and is not copied into the final bundle;
# shipping the source package alone can make the system show a generic placeholder.
ICON_SOURCE="${ROOT}/../assets/branding/lumen-icon/Lumen.icon"
ACTOOL="$(find_actool || true)"
if [[ ! -d "${ICON_SOURCE}" ]]; then
  echo "error: Icon Composer source missing: ${ICON_SOURCE}" >&2
  exit 1
elif [[ -n "${ACTOOL}" ]]; then
  echo "==> compile adaptive icon (${ACTOOL})"
  "${ACTOOL}" "${ICON_SOURCE}" \
    --compile "${APP_BUNDLE}/Contents/Resources" \
    --app-icon Lumen \
    --enable-on-demand-resources NO \
    --development-region pt-BR \
    --target-device mac \
    --platform macosx \
    --minimum-deployment-target 14.0 \
    --enable-icon-stack-fallback-generation=disabled \
    --include-all-app-icons \
    --errors --warnings \
    --output-partial-info-plist /dev/null
else
  echo "warn: actool ausente — usando Lumen.icns; o ícone adaptativo exige Xcode 26."
fi

# O --compile --app-icon do actool ESCREVE o próprio Lumen.icns em Resources,
# sobrescrevendo o que viesse antes. O icns dele para em 128@2x (256px), porque
# o Assets.car adaptativo cobre o resto — mas o Assets.car só vale do macOS 26
# em diante, e aqui o alvo é --minimum-deployment-target 14.0. Em Sonoma e
# Sequoia o sistema cai no icns e escalaria tudo a partir de 256px: Dock grande,
# Cmd+Tab, Get Info e Finder em ícone grande saem borrados.
# Por isso o icns completo (10 tamanhos, até 512@2x) é copiado DEPOIS do actool.
# Os dois convivem: macOS 26 usa o Assets.car, macOS 14/15 usa o icns.
cp "${ROOT}/AppIcon.icns" "${APP_BUNDLE}/Contents/Resources/Lumen.icns"
if [[ ! -s "${APP_BUNDLE}/Contents/Resources/Lumen.icns" ]]; then
  echo "error: Lumen.icns ausente ou vazio após a cópia legada" >&2
  exit 1
fi

# pack do server no bundle (Contents/Resources/Lumen/) — sem isso o app instalado
# não acha o server.js (cwd do Launchpad é /) e o dock morre offline.
SRV_DIR="${APP_BUNDLE}/Contents/Resources/Lumen"
mkdir -p "${SRV_DIR}"
cp "${ROOT}/../server.js" "${ROOT}/../apps.js" "${ROOT}/../actions.js" "${ROOT}/../config.js" "${ROOT}/../config.json" "${ROOT}/../auth.js" "${ROOT}/../obs.js" "${ROOT}/../obs-ws.js" "${SRV_DIR}/"
ICON_HELPER_APP="${SRV_DIR}/bin/LumenIconHelper.app"
mkdir -p "${ICON_HELPER_APP}/Contents/MacOS" "${ICON_HELPER_APP}/Contents/Resources"
cp "${ICON_HELPER_PATH}" "${ICON_HELPER_APP}/Contents/MacOS/LumenIconHelper"
cp "${ROOT}/IconHelper/Info.plist" "${ICON_HELPER_APP}/Contents/Info.plist"
chmod +x "${ICON_HELPER_APP}/Contents/MacOS/LumenIconHelper"

# Keep the server bundle explicit. `public/` can contain ignored backups,
# logs, and local build output that must never become public app content.
bash "${ROOT}/copy-public-assets.sh" "${ROOT}/../public" "${SRV_DIR}/public"
cp "${ROOT}/../package.json" "${ROOT}/../package-lock.json" "${SRV_DIR}/"
if command -v npm >/dev/null 2>&1; then
  # A saída do npm era descartada com >/dev/null 2>&1, então "npm ci falhou"
  # chegava sem nenhuma pista do motivo. Agora o erro real aparece.
  if ! npm_ci_log="$(cd "${SRV_DIR}" && npm ci --omit=dev 2>&1)"; then
    echo "warn: npm ci falhou — server pode não subir (dependência ws ausente)" >&2
    printf '%s\n' "${npm_ci_log}" | tail -20 >&2
  fi
elif [ -d "${ROOT}/../node_modules" ]; then
  cp -R "${ROOT}/../node_modules" "${SRV_DIR}/node_modules"
else
  echo "warn: npm/node_modules ausentes — server pode não subir (dependência ws ausente)"
fi

# embute um node relocável no bundle (Contents/Resources/node-bin) — o app
# roda em Mac sem Node instalado. Homebrew Node costuma depender de dylibs em
# /opt/homebrew/opt, então prefere uma cópia estática do nvm quando disponível.
find_relocatable_node() {
  local candidate node_archs host_arch
  local -a candidates=()
  local nvm_root="${NVM_DIR:-${HOME}/.nvm}/versions/node"
  host_arch="$(uname -m)"

  if [[ -n "${LUMEN_NODE:-}" ]]; then
    candidates+=("${LUMEN_NODE}")
  fi
  if [[ -d "${nvm_root}" ]]; then
    while IFS= read -r candidate; do
      candidates+=("${candidate}")
    done < <(find "${nvm_root}" -type f -path '*/bin/node' -perm -111 2>/dev/null | sort -r)
  fi
  candidate="$(command -v node || true)"
  if [[ -n "${candidate}" ]]; then
    candidates+=("${candidate}")
  fi
  candidates+=("/opt/homebrew/bin/node" "/usr/local/bin/node")

  for candidate in "${candidates[@]}"; do
    [[ -x "${candidate}" ]] || continue
    node_archs="$(lipo -archs "${candidate}" 2>/dev/null || true)"
    [[ " ${node_archs} " == *" ${TARGET_ARCH} "* ]] || continue
    verify_node_dependencies "${candidate}" || continue
    if [[ "${TARGET_ARCH}" == "${host_arch}" ]] && "${candidate}" --version >/dev/null 2>&1; then
      printf '%s' "${candidate}"
      return 0
    fi
    if [[ "${TARGET_ARCH}" == x86_64 && "${host_arch}" == arm64 ]] && command -v arch >/dev/null 2>&1 && arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
      if arch -x86_64 "${candidate}" --version >/dev/null 2>&1; then
        printf '%s' "${candidate}"
        return 0
      fi
    fi
    if [[ "${TARGET_ARCH}" != "${host_arch}" ]]; then
      echo "info: runtimes Node ${TARGET_ARCH} não são executados neste host; arquitetura será validada no bundle" >&2
      printf '%s' "${candidate}"
      return 0
    fi
  done
  return 1
}

NODE_SRC="$(find_relocatable_node || true)"
if [[ -n "${NODE_SRC}" ]]; then
  mkdir -p "${APP_BUNDLE}/Contents/Resources/node-bin"
  NODE_BIN="${APP_BUNDLE}/Contents/Resources/node-bin/node"
  cp -L "${NODE_SRC}" "${NODE_BIN}"
  # O runtime distribuído não precisa de símbolos de debug. Remover estes
  # símbolos mantém o orçamento do app estável entre versões do Node; o
  # bundle recebe assinatura ad-hoc abaixo.
  if command -v strip >/dev/null 2>&1; then
    strip -S "${NODE_BIN}"
    if command -v codesign >/dev/null 2>&1; then
      codesign --force --sign - "${NODE_BIN}"
    fi
  fi
  chmod +x "${NODE_BIN}"
  verify_architecture "${NODE_BIN}"
  echo "==> node embutido (${NODE_SRC}; $(du -sh "${NODE_BIN}" | cut -f1))"
else
  echo "error: nenhum Node relocável compatível com ${TARGET_ARCH}; instale-o ou defina LUMEN_NODE=/caminho/para/node" >&2
  exit 1
fi

validate_bundle_budget "${APP_BUNDLE}"

if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "${APP_BUNDLE}"
  codesign --verify --deep --strict "${APP_BUNDLE}" || { echo "error: assinatura inválida após codesign" >&2; exit 1; }
fi

if [[ "${BUILD_ONLY}" -eq 1 ]]; then
  mkdir -p "${DIST_DIR}"
  rm -rf "${DIST_DIR}/${APP_NAME}.app"
  cp -R "${APP_BUNDLE}" "${DIST_DIR}/${APP_NAME}.app"
  echo "OK ${DIST_DIR}/${APP_NAME}.app (dev only — not installed)"
  exit 0
fi

# drop any leftover dist copy that Launchpad/Spotlight would list twice
rm -rf "${ROOT}/dist/${APP_NAME}.app"

mkdir -p "${DEST_DIR}"
INSTALL_PATH="${DEST_DIR}/${APP_NAME}.app"
echo "==> install ${INSTALL_PATH}"
# Uma linha só: o `rm -rf "${DEST_DIR}/Lumen.app"` que existia aqui apagava
# exatamente o mesmo caminho que ${INSTALL_PATH} (APP_NAME="Lumen"), era código
# morto e dava a impressão de que o script limpava o outro domínio. Não limpava.
rm -rf "${INSTALL_PATH}"
cp -R "${APP_BUNDLE}" "${INSTALL_PATH}"

if command -v xattr >/dev/null 2>&1; then
  # Legítimo: o atributo de quarentena normalmente nem existe numa cópia local,
  # e a ausência dele não é falha. Nada aqui é afirmado depois.
  xattr -dr com.apple.quarantine "${INSTALL_PATH}" 2>/dev/null || true
fi

echo "OK installed: ${INSTALL_PATH}"
report_runtime_health "${INSTALL_PATH}"
report_app_copies "${INSTALL_PATH}"

if [[ "${OPEN_AFTER}" -eq 1 ]]; then
  open "${INSTALL_PATH}"
fi
