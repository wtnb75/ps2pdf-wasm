#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GS_SRC="$ROOT/ghostscript-10.07.1"
SITE="$ROOT/site"

cd "$GS_SRC"

if [ ! -f Makefile ] || ! grep -q "^CC=/usr/share/emscripten/emcc" Makefile; then
  emconfigure ./configure --host=wasm32-unknown-emscripten \
    --with-drivers=pdfwrite \
    --disable-dynamic \
    --disable-contrib \
    --disable-cups \
    --disable-fontconfig \
    --disable-gtk \
    --without-x \
    --without-libtiff \
    --without-pdftoraster \
    --without-ijs \
    --without-tesseract
fi

# Remove previous link outputs (e.g. from the poc-browser build) so that the
# link step always re-runs with the worker-targeted XLDFLAGS below.
rm -f bin/gs bin/gs.js bin/gs.wasm bin/gs.data

emmake make gs -j4 \
  XLDFLAGS="-sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sEXIT_RUNTIME=0 -sENVIRONMENT=worker -sMODULARIZE=1 -sEXPORT_NAME=createGSModule -sEXPORTED_RUNTIME_METHODS=callMain,FS --preload-file Resource@/Resource --preload-file lib@/lib"

cp bin/gs "$SITE/gs.js"
cp bin/gs.wasm bin/gs.data "$SITE/"

echo "Build artifacts copied to $SITE/"
