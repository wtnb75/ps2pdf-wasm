# Ghostscript wasm PoC 設計

## 背景・目的

`TODO.md` にある「ブラウザでPostScriptをPDFに変換するサイト」を作るための最初のステップとして、
Ghostscript (`ghostscript-10.07.1`) をemscriptenでwasmにビルドし、Node.js上で
`gs -sDEVICE=pdfwrite -o out.pdf in.ps` 相当の変換が動作することを確認するPoCを行う。

本PoCの合格基準は「Node.jsでwasm実行し、サンプルのPostScriptファイルをPDFに変換できること」。
ブラウザUIや他デバイス対応は対象外とする。

## ディレクトリ構成

`project-gs/poc/` 以下に以下を作成する:

- `build.sh` — emconfigure/emmake によるビルドスクリプト
- `test.ps` — 最小限のテスト用PostScriptファイル(1ページ程度)
- `run.js` — Node.jsからwasmモジュールをロードし、変換を実行・検証するスクリプト
- ビルド成果物(`gs.js` / `gs.wasm` / `gs.data`)および出力(`out.pdf`)も同ディレクトリに出力

リポジトリのルートやソースツリー(`ghostscript-10.07.1/`)は汚さない。

## ビルド方針

- `emconfigure ./configure` → `emmake make` でghostscript本体(`gs`)をビルドする。
- 出力デバイスは `pdfwrite` のみに絞り、ビルド対象・時間を削減する。
- `Resource/` と `lib/` ディレクトリを `--preload-file` でMEMFSに同梱し、`gs.data` として出力する。
- `MODULARIZE=1` を指定し、Node.jsから `require`/`import` して `callMain()` で実行できる形にする。
- `ALLOW_MEMORY_GROWTH=1` を指定し、PDF変換時のメモリ確保に対応する。
- `EXIT_RUNTIME=1` を指定し、`callMain()` 実行後にプロセスが正常終了できるようにする。

## 検証フロー (run.js)

1. ビルドした `gs.js` モジュールをロードする。
2. `test.ps` の内容をMEMFS上の `/test.ps` に書き込む。
3. `callMain(['-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-sOutputFile=/out.pdf', '/test.ps'])` を実行する。
4. MEMFS上の `/out.pdf` を読み出し、`poc/out.pdf` に書き出す。
5. 出力ファイルの先頭4バイトが `%PDF` であることを確認する。

すべて成功すればPoC合格。

## 既知のリスク・実装時に最初に確認すべき点

- **ホスト用ビルドツールとの混在**: Ghostscriptのビルドシステムは `genconf` / `mkromfs` / `echogs` などのホスト上で実行するツールを内部で生成・実行する。`CC=emcc` を単純に指定すると、これらホストツールのビルドが壊れる可能性がある。必要であれば、ホスト用コンパイラ(`gcc`/`cc`)とemccを併用するビルド設定(例: `CC_FOR_BUILD`系の変数や個別のmakeターゲット指定)を調査・適用する。これが本PoCで最初に解決すべき技術的不確実性。
- **動的ロード(dlopen)**: FAPI/freetypeなどのプラグインが `dlopen` を使用している場合、wasmでは動作しないため静的リンクに変更する必要がある。

## スコープ外

- ブラウザUI
- `pdfwrite` 以外のデバイス対応
- フォント最適化・同梱フォントの絞り込み
- エラーハンドリングやCLIの使い勝手向上
- 生成されるwasmバイナリ・データのサイズ最適化

## 成功基準

- `poc/build.sh` の実行により `gs.js` / `gs.wasm` / `gs.data` が生成される。
- `node poc/run.js` を実行すると `poc/out.pdf` が生成され、先頭4バイトが `%PDF` であることが確認できる。
