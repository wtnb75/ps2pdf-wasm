# PostScript → PDF 変換サイト 設計

## 背景・目的

これまでの2つのPoCで、Ghostscript (`ghostscript-10.07.1`) をemscriptenでwasmにビルドし、
Node.js (`poc/`) およびブラウザ (`poc-browser/`) 上でPS→PDF変換が動作することを確認した。

本フェーズでは、`TODO.md` の目標である「ブラウザでPostScriptをPDFに変換する静的サイト」の
本実装(ローカルで動作する状態まで)を行う。ユーザーが手元の`.ps`ファイルを選択し、
ブラウザ上(Web Worker)で変換し、`.pdf`としてダウンロードできるようにする。

GitHub Pagesへのデプロイ・CI設定は別スプリントとし、本スプリントでは
ローカル(`python3 -m http.server`等)で動作する静的サイトの完成までを範囲とする。

## ディレクトリ構成

`project-gs/site/` を新設する(`poc-browser/`はPoCとして残し、変更しない):

```
site/
├── build.sh      — poc-browser/build.sh ベース。ENVIRONMENT=worker でビルド
├── index.html    — UI(ファイル選択/ドロップ、ステータス表示、ダウンロードリンク)
├── worker.js     — gs.jsをimportScriptsし、Moduleを保持。メインスレッドとpostMessageで通信
├── gs.js / gs.wasm / gs.data  — ビルド成果物 (gitignore対象)
```

## アーキテクチャ概要

**永続Worker + Module再利用方式**を採用する。ページロード時にWorkerを起動し、
`gs.wasm`/`gs.data`(計約35MB)を1回だけロードする。以降の変換は同じModuleインスタンスの
MEMFS上で `/input.ps` を上書き→`callMain`→`/out.pdf` を読み出す、を繰り返す。
35MBの再ロードが発生しないため、2回目以降の変換が高速になる。

MEMFS上のファイルは変換ごとに削除してから書き直すことで、前回実行分の残骸による
影響を防ぐ。

## ビルド設定 (`site/build.sh`)

`poc-browser/build.sh` をベースに、以下の点を変更する:

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
  XLDFLAGS="-sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sEXIT_RUNTIME=0 -sENVIRONMENT=worker -sMODULARIZE=1 -sEXPORT_NAME=createGSModule -sEXPORTED_RUNTIME_METHODS=callMain,FS --preload-file Resource@/Resource --preload-file lib@/lib"
```

- `-sENVIRONMENT=worker`: Web Worker専用ビルド(`poc-browser`の`web`から変更)。`window`/`document`への
  参照を含めない分、わずかに軽量になる。
- 他のフラグ(`MODULARIZE`, `EXPORT_NAME=createGSModule`, `EXPORTED_RUNTIME_METHODS=callMain,FS`,
  `--preload-file Resource@/Resource --preload-file lib@/lib`, `EXIT_RUNTIME=0`)はPoCと同じ。
- `gs.data`/`gs.wasm`のサイズ最適化(Resourceの絞り込み、圧縮配信など)は本スプリントの
  スコープ外とし、まずPoCと同様のサイズ(約35MB)で動作確認する。

## `worker.js` — メインスレッドとの通信プロトコル

Worker内で `gs.js` を `importScripts()` し、`createGSModule()` を一度だけ呼び出してModuleを保持する。
メインスレッドとは `postMessage` でメッセージをやり取りする。

**起動時:**

```javascript
importScripts('gs.js');

let modulePromise = createGSModule({
  stdin: () => null,
  print: () => {},
  printErr: () => {},
});

modulePromise.then(() => {
  postMessage({ type: 'ready' });
});
```

**メッセージ仕様:**

| 方向 | type | ペイロード | 意味 |
|---|---|---|---|
| main → worker | `convert` | `{ name: string, data: ArrayBuffer }` | 入力PSファイル(名前は表示用、内容はArrayBuffer。Transferableで転送) |
| worker → main | `ready` | なし | Module初期化完了、変換可能 |
| worker → main | `result` | `{ data: ArrayBuffer }` | 変換成功、PDFバイト列(Transferableで転送) |
| worker → main | `error` | `{ message: string }` | 変換失敗 |

**変換処理 (`convert` 受信時):**

```javascript
self.onmessage = async (e) => {
  if (e.data.type !== 'convert') return;

  try {
    const Module = await modulePromise;

    // 前回実行分のファイルが残っていれば削除してから書き込む
    try { Module.FS.unlink('/input.ps'); } catch {}
    try { Module.FS.unlink('/out.pdf'); } catch {}

    Module.FS.writeFile('/input.ps', new Uint8Array(e.data.data));

    Module.callMain([
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dBATCH',
      '-I/lib', '-I/Resource/Init',
      '-sOutputFile=/out.pdf',
      '/input.ps',
    ]);

    const pdfBytes = Module.FS.readFile('/out.pdf');
    const header = new TextDecoder().decode(pdfBytes.slice(0, 4));
    if (header !== '%PDF') {
      throw new Error(`変換結果が不正です (header: ${header})`);
    }

    postMessage({ type: 'result', data: pdfBytes.buffer }, [pdfBytes.buffer]);
  } catch (err) {
    postMessage({ type: 'error', message: err.message });
  }
};
```

- `callMain` が例外をスローした場合(致命的なPostScriptエラーなど)も `error` として通知する。
- `/out.pdf` が存在しない、または `%PDF` で始まらない場合もエラー扱い。

## `index.html` — UI設計

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PostScript → PDF 変換</title>
</head>
<body>
  <h1>PostScript → PDF 変換</h1>
  <p id="status">Ghostscript を読み込み中...</p>

  <div id="dropzone" style="border: 2px dashed #888; padding: 2em; text-align: center;">
    <p>.ps ファイルをドラッグ&ドロップ、または選択してください</p>
    <input type="file" id="fileInput" accept=".ps,application/postscript" disabled>
  </div>

  <p id="result"></p>
  <a id="download" style="display:none">変換結果をダウンロード</a>

  <script>
    const status = document.getElementById('status');
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const result = document.getElementById('result');
    const download = document.getElementById('download');

    const worker = new Worker('worker.js');
    let currentFileName = '';

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        status.textContent = '準備完了。.ps ファイルを選択してください。';
        fileInput.disabled = false;
      } else if (msg.type === 'result') {
        const blob = new Blob([msg.data], { type: 'application/pdf' });
        download.href = URL.createObjectURL(blob);
        download.download = currentFileName.replace(/\.ps$/i, '') + '.pdf';
        download.style.display = 'inline';
        download.textContent = `${download.download} をダウンロード`;
        result.textContent = '変換が完了しました。';
        status.textContent = '準備完了。.ps ファイルを選択してください。';
        fileInput.disabled = false;
      } else if (msg.type === 'error') {
        result.textContent = `エラー: ${msg.message}`;
        download.style.display = 'none';
        status.textContent = '準備完了。.ps ファイルを選択してください。';
        fileInput.disabled = false;
      }
    };

    function convertFile(file) {
      currentFileName = file.name;
      result.textContent = '';
      download.style.display = 'none';
      status.textContent = `${file.name} を変換中...`;
      fileInput.disabled = true;

      file.arrayBuffer().then((buf) => {
        worker.postMessage({ type: 'convert', name: file.name, data: buf }, [buf]);
      });
    }

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) convertFile(fileInput.files[0]);
    });

    dropzone.addEventListener('dragover', (e) => e.preventDefault());
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!fileInput.disabled && e.dataTransfer.files.length > 0) {
        convertFile(e.dataTransfer.files[0]);
      }
    });
  </script>
</body>
</html>
```

ポイント:

- ページロード時にWorkerを起動し、`gs.js`/`gs.wasm`/`gs.data`(約35MB)のロードが完了するまで
  `<input>` を無効化(`status`に「読み込み中」表示)。
- ファイル選択またはドロップで変換開始、変換中は再度入力を無効化。
- 成功時はダウンロードリンクを表示(ファイル名は元の`.ps`を`.pdf`に置換)。
- エラー時はメッセージを表示し、再度ファイルを選択できる状態に戻す。

## サブパス配置について

`<script src="gs.js">`、`new Worker('worker.js')`、Worker内の `importScripts('gs.js')` は
すべて相対パスで参照する。emscriptenが生成する `gs.js` も `gs.wasm`/`gs.data` のパスを
自身が読み込まれた場所(`self.location` ベース)から相対的に解決するため、`site/` ディレクトリ
構造を保ったまま配置すれば、ルート(`/`)・サブパス(例: `https://user.github.io/repo-name/`)
のどちらに配置しても追加対応なしに動作する。

## エラーハンドリング

- **Worker初期化失敗**(`gs.wasm`/`gs.data`のfetch失敗など): `createGSModule()` がrejectした場合、
  `status`に「読み込みに失敗しました」を表示し、`fileInput`は無効のままにする
  (再試行はページリロードを促す程度。本スプリントではリトライ機構は作らない)。
- **変換失敗**(不正なPSファイル、Ghostscriptがエラー終了、`/out.pdf`が`%PDF`で始まらない):
  `worker.js`から`error`メッセージを送り、`result`にエラー内容を表示。ダウンロードリンクは
  非表示にし、再度ファイル選択可能な状態に戻す。
- **想定外の例外**(Worker側の予期しないJSエラー): try/catchで`error`として捕捉し、同様に表示する。

## スコープ外

- GitHub Pagesへのデプロイ/CI設定(別スプリント)
- 複数ファイル一括変換
- `gs.data`/`gs.wasm`のサイズ最適化・圧縮配信
- PDF以外の出力デバイス対応
- 変換オプション(解像度、用紙サイズ等)のUI設定
- 多言語対応・詳細なアクセシビリティ対応

## 成功基準

- `./site/build.sh` の実行により `site/gs.js`/`gs.wasm`/`gs.data` が生成される。
- `python3 -m http.server` で `site/` を配信し、ブラウザで `index.html` を開くと、
  Worker初期化後にファイル選択が可能になる。
- ルート(`/`)・サブディレクトリ配信のいずれでも、任意の `.ps` ファイルを選択またはドロップして
  変換し、`%PDF`で始まる`.pdf`をダウンロードできる。
- 不正な入力ファイルではエラーメッセージが表示され、UIが再度操作可能な状態に戻る。
