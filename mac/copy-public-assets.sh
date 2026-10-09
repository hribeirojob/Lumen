#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "usage: copy-public-assets.sh <public-source> <bundle-destination>" >&2
  exit 2
fi

SOURCE_DIR="$1"
DEST_DIR="$2"
# O APK NÃO entra aqui de propósito. Ele não é mais versionado e nada no produto
# aponta para a cópia local: a UI (public/index.html), o server (apkUrl), a landing
# e o próprio app Android baixam sempre do GitHub Releases. Embutir 1,9 MB em todo
# bundle servia só a uma rota que ninguém navega.
PUBLIC_FILES=(
  "index.html"
  "manifest.webmanifest"
  "sw.js"
  "icon-192.png"
  "icon-192-dark.png"
  "icon-512.png"
  "version.json"
  "fonts/Inter-Regular.otf"
  "fonts/Inter-SemiBold.otf"
)

mkdir -p "$DEST_DIR"
for public_file in "${PUBLIC_FILES[@]}"; do
  source_file="${SOURCE_DIR}/${public_file}"
  target_file="${DEST_DIR}/${public_file}"
  if [[ ! -f "$source_file" ]]; then
    echo "error: required public asset is missing: ${source_file}" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$target_file")"
  cp "$source_file" "$target_file"
done
