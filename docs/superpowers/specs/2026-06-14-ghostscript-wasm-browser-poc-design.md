# Ghostscript wasm ブラウザ版PoC 設計

## 背景・目的

Phase 1 (Node PoC) で、Ghostscript (`ghostscript-10.07.1`) をemscriptenでwasmにビルドし、
Node.js上で `gs -sDEVICE=pdfwrite -o out.pdf in.ps` 相当の変換が動作することを確認した
(`poc/`、`-sNODERAWFS=1` 利用)。

Phase 2では、同じ変換をブラウザ上で実行できることを確認するPoCを行う。
`-sNODERAWFS=1` はNode専用のため、ブラウザでは別のビルド設定(MEMFS + `--preload-file`)が必要になる。

本PoCの合格基準は「ブラウザでgs.wasmをロードしてPS→PDF変換が動作すること」。
ファイル選択UIやWeb Workerでの非同期実行は対象外とする。

## ディレクトリ構成

`project-gs/poc-browser/` 以下に以下を作成する:

- `build.sh` — ブラウザ向け emconfigure/emmake によるビルドスクリプト
- `index.html` — 最小UI(ページロード時に変換を自動実行し、結果を表示)
- `test.ps` — テスト用PostScriptファイル(`poc/test.ps` と同内容)
- ビルド成果物(`gs.js` / `gs.wasm` / `gs.data`)もこのディレクトリに出力(gitignore対象)

Node版PoC (`poc/`) とは分離する。`ghostscript-10.07.1/` の同じソースツリーを共有するが、
`obj/`・`bin/` のビルド出力はターゲット(Node向け/ブラウザ向け)で上書きされるため、
ビルドスクリプトは毎回 `emconfigure`/`emmake` をやり直す前提とする(再ビルドに時間がかかる点は許容する)。

## ビルド方針

`poc-browser/build.sh` で以下を実行する:

```bash
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

emmake make gs -j4 \
  XLDFLAGS="-sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sEXIT_RUNTIME=0 \
            -sENVIRONMENT=web -sMODULARIZE=1 -sEXPORT_NAME=createGSModule \
            -sEXPORTED_RUNTIME_METHODS=callMain,FS \
            --preload-file Resource@/Resource --preload-file lib@/lib"
```

Node PoCのビルド設定との差分:

- `-sNODERAWFS=1` を外す → デフォルトのMEMFSになる。
- `-sENVIRONMENT=web` + `-sMODULARIZE=1` + `-sEXPORT_NAME=createGSModule` で、
  ブラウザの `<script>` から `createGSModule()` を呼べる形にする。
- `-sEXIT_RUNTIME=0`: ブラウザではプロセス終了の概念がないため、`callMain()` 後も
  モジュールを再利用可能にする(Node PoCの `-sEXIT_RUNTIME=1` と異なる)。
- `-sEXPORTED_RUNTIME_METHODS=callMain,FS`: JS側から `Module.callMain(args)` と
  `Module.FS`(ファイル書き込み/読み出し用)を呼べるようにする。
- `--preload-file Resource@/Resource --preload-file lib@/lib`: `ghostscript-10.07.1/Resource` と
  `ghostscript-10.07.1/lib` をMEMFS上の `/Resource`・`/lib` に同梱し、`gs.data` として出力する。

出力は `bin/gs.js` / `bin/gs.wasm` / `bin/gs.data` となり、これらを `poc-browser/` にコピーする。

## 検証フロー (index.html)

ページロード時に自動的に変換を実行する最小限のHTML+JSページ:

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Ghostscript wasm Browser PoC</title></head>
<body>
  <h1>Ghostscript wasm Browser PoC</h1>
  <pre id="log"></pre>
  <a id="download" style="display:none">out.pdf をダウンロード</a>
  <script src="gs.js"></script>
  <script>
    const log = (msg) => { document.getElementById('log').textContent += msg + '\n'; };

    createGSModule().then(async (Module) => {
      const psText = await (await fetch('test.ps')).text();
      Module.FS.writeFile('/test.ps', psText);

      Module.callMain([
        '-sDEVICE=pdfwrite',
        '-dNOPAUSE',
        '-dBATCH',
        '-I/lib', '-I/Resource/Init',
        '-sOutputFile=/out.pdf',
        '/test.ps',
      ]);

      const pdfBytes = Module.FS.readFile('/out.pdf');
      const header = new TextDecoder().decode(pdfBytes.slice(0, 4));
      if (header !== '%PDF') {
        throw new Error(`Expected %PDF, got: ${header}`);
      }
      log('PoC OK: out.pdf starts with %PDF');

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const a = document.getElementById('download');
      a.href = URL.createObjectURL(blob);
      a.download = 'out.pdf';
      a.style.display = 'inline';
    }).catch((e) => {
      log('PoC FAILED: ' + e.message);
      throw e;
    });
  </script>
</body>
</html>
```

ポイント:

- `test.ps` は `fetch()` で取得し `Module.FS.writeFile` でMEMFSに書き込む
  (`--preload-file` には含めない。入力ファイルなので別途fetchする)。
- `GS_LIB` 環境変数の代わりに `-I/lib -I/Resource/Init` オプションで初期化スクリプトの
  検索パスを指定する(環境変数操作よりブラウザ向けに簡潔)。
- 成功/失敗を `<pre id="log">` に出力し、人間が目視確認できるようにする。
- 成功時はPDFをBlob URL化してダウンロードリンクを表示する。

## 検証手順

```bash
cd poc-browser && python3 -m http.server 8000
```

をローカルで起動し、ブラウザで `http://localhost:8000/` を開く。
`PoC OK: out.pdf starts with %PDF` が表示され、ダウンロードリンクからPDFが取得できることを目視確認する。

## 既知のリスク・実装時に最初に確認すべき点

- **`--preload-file` のパス指定**: `Resource@/Resource` のように `ホスト側パス@MEMFS側パス` の
  形式で複数指定できるが、ビルド時のカレントディレクトリ (`ghostscript-10.07.1/`) からの
  相対パスになる点に注意。`gs.data` 生成に失敗する場合、絶対パスでの指定を試す。
- **`-I` オプションでの初期化スクリプト探索**: Node PoCでは `GS_LIB` 環境変数を使ったが、
  ブラウザではプロセス環境変数の概念が薄いため `-I` オプションを優先する。これで
  `Resource/Init/gs_init.ps` 等が見つからない場合、`Module.ENV.GS_LIB = '/lib:/Resource/Init'` を
  `callMain()` 前に設定する代替策を試す。
- **`gs.data` のサイズ**: `Resource/` 全体を同梱すると数十MB規模になる可能性がある。
  PoCの段階ではサイズ最適化は対象外とするが、極端に大きい(ビルドが進まない/ブラウザの
  fetchが極端に遅い)場合は `Resource/Init` のみに絞る対応を検討する。
- **MODULARIZE + ENVIRONMENT=web のビルド失敗**: Node向けビルドと異なるリンクフラグのため、
  リンクエラーが出た場合は systematic-debugging で個別に対処する。

## スコープ外

- Web Worker での非同期実行(将来フェーズ)
- 任意ファイルのアップロード・ファイル選択UI
- `gs.data` / `gs.wasm` のサイズ最適化・圧縮配信
- エラーハンドリングの充実(PoCのログ出力で十分)
- Node版PoC (`poc/`) の変更

## 成功基準

- `./poc-browser/build.sh` の実行により `gs.js` / `gs.wasm` / `gs.data` が `poc-browser/` に生成される。
- `python3 -m http.server` で `poc-browser/` を配信し、ブラウザで `index.html` を開くと
  `PoC OK: out.pdf starts with %PDF` が表示される。
- ダウンロードリンクから取得した `out.pdf` が有効なPDFファイルである。
