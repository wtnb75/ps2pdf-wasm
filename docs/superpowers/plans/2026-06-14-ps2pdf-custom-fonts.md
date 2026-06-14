# PS→PDF変換サイト カスタムフォント対応 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `site/`のPS→PDF変換UIに、ユーザーが`.ttf`/`.otf`カスタムフォントをアップロードして
PostScript内の独自フォント名と紐付けられるようにし、より正確なPDFを生成できるようにする。

**Architecture:** `site/index.html`に「フォント名+ファイル選択」の行を追加/削除できるUIを追加する。
変換時にPSファイルとあわせて`fonts: [{name, filename, data}]`を`worker.js`にpostMessageで送る。
`worker.js`は受け取ったフォントを`/fonts/`に書き込み、`/fonts/Fontmap`に
`/<name> (<filename>) ;`形式のエントリを生成し、`callMain`に`-I/fonts`を追加することで
Ghostscriptの`.loadinitialfonts`機構に発見・登録させる。

**Tech Stack:** プレーンJavaScript (Web Worker, MEMFS via Emscripten FS API)、Ghostscript 10.07.1 wasm
(既存ビルド成果物 `site/gs.js`/`gs.wasm`/`gs.data` をそのまま使用、リビルド不要)。

参照仕様: `docs/superpowers/specs/2026-06-14-ps2pdf-custom-fonts-design.md`

---

## 事前検証済みの技術的根拠

設計書では`-sFONTMAP=`/`-sFONTPATH=`の挙動が未確定だったが、本プラン作成時に
`ghostscript-10.07.1/Resource/Init/gs_fonts.ps`の`.loadinitialfonts`を読み、
`poc/gs`(Node/NODERAWFSビルド)で以下を確認した:

- `-I<dir>`で指定した各ディレクトリに`Fontmap`という名前のファイルがあれば、
  `.loadinitialfonts`がそれを`.loadFontmap`で読み込み、後から処理されたディレクトリの
  エントリが`.growput`で前のエントリを上書きする。
- `/fonts/Fontmap`に`/CustomFont (LiberationMono-Regular.ttf) ;`(ベア名、パス無し)を書き、
  同じ`/fonts/`に`LiberationMono-Regular.ttf`を置き、既存の`-I/lib -I/Resource/Init`に
  `-I/fonts`を追加するだけで、`findlibfile`がLIBPATH(`-I`で指定した各ディレクトリ)を
  検索してフォントファイルを発見する。
- 実行結果: `Loading CustomFont font from /tmp/fonttest/fonts/LiberationMono-Regular.ttf... done.`
  / `Using LiberationMono font for CustomFont.` 、有効な`%PDF-1.7`を出力。
- フォント未指定(`/CustomFont`が`Fontmap`に存在しない)場合は
  `Substituting font Courier for CustomFont.`として代替フォントで継続し、エラーにはならない
  (`%PDF-1.7`を出力)。これにより設計書の「フォント未指定でも変換成功」要件を満たす。

よって、本プランでは設計書の`-sFONTMAP=`/`-sFONTPATH=`案を**`/fonts/Fontmap` +
`-I/fonts`方式に置き換える**。

---

## ファイル構成

- 新規: `site/test-custom-font.ps` — `/CustomFont`という(代替フォント表のどのURW系フォント名にも
  該当しない)独自フォント名を参照するテスト用PS。
- 新規: `site/test-custom-font.ttf` — `LiberationMono-Regular.ttf`のコピー(SIL OFL 1.1、
  バンドル可)。
- 新規: `site/test-custom-font-LICENSE.txt` — `test-custom-font.ttf`に同梱するSIL OFL 1.1
  ライセンス全文。
- 修正: `site/worker.js` — `convert`メッセージの`fonts`配列を処理し、`/fonts/Fontmap`を生成、
  `-I/fonts`を`callMain`引数に追加。
- 修正: `site/index.html` — カスタムフォント追加UI(行の追加/削除)と、`fonts`配列を
  `convert`メッセージに含める処理を追加。

---

## Task 1: テスト用フィクスチャ(カスタムフォントPS・TTF・ライセンス)の追加

**Files:**
- Create: `site/test-custom-font.ps`
- Create: `site/test-custom-font.ttf`
- Create: `site/test-custom-font-LICENSE.txt`

- [ ] **Step 1: テスト用PSファイルを作成する**

`site/test-custom-font.ps`を以下の内容で作成する。`/CustomFont`は
`ghostscript-10.07.1/Resource/Init/Fontmap.GS`に存在しない独自フォント名であり、
フォント未指定時はGhostscriptが代替フォント(Courier系)に置き換えて変換を継続する
ことを確認できる。

```postscript
%!PS
/CustomFont findfont 24 scalefont setfont
72 700 moveto
(Hello Custom Font) show
showpage
```

- [ ] **Step 2: テスト用フォントファイルをコピーする**

`/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf`
(SIL Open Font License 1.1、バンドル・再配布可)を`site/test-custom-font.ttf`としてコピーする。

Run:
```bash
cp /usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf site/test-custom-font.ttf
```

Expected: `site/test-custom-font.ttf`が作成される(約320KB)。

```bash
ls -la site/test-custom-font.ttf
```

- [ ] **Step 3: フォントのライセンスファイルを作成する**

OFL 1.1 §2「同梱物にはこのライセンス全文を含めること」を満たすため、
`site/test-custom-font-LICENSE.txt`を以下の内容で作成する。

```text
This file (test-custom-font.ttf) is a copy of LiberationMono-Regular.ttf
from the Liberation Fonts project, used here as a test fixture for the
custom-font upload feature.

Digitized data copyright (c) 2010 Google Corporation with Reserved Font
Arimo, Tinos and Cousine.
Copyright (c) 2012 Red Hat, Inc. with Reserved Font Name Liberation.

This Font Software is licensed under the SIL Open Font License,
Version 1.1.

This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply to
any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical writer or
other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any Modified
Version, except to acknowledge the contribution(s) of the Copyright Holder(s)
and the Author(s) or with their explicit written permission.

5) The Font Software, modified or unmodified, in part or in whole, must be
distributed entirely under this license, and must not be distributed under
any other license. The requirement for fonts to remain under this license
does not apply to any document created using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF COPYRIGHT, PATENT,
TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, INCLUDING ANY GENERAL, SPECIAL,
INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF THE USE OR INABILITY TO
USE THE FONT SOFTWARE OR FROM OTHER DEALINGS IN THE FONT SOFTWARE.
```

- [ ] **Step 4: フォント未指定でのGhostscript動作を確認する(`/CustomFont`が代替される)**

既存の`poc/gs`(Node/NODERAWFSビルド)を使って、`/fonts/Fontmap`が無い状態で
`test-custom-font.ps`がエラーにならず`%PDF`を出力することを確認する。

Run:
```bash
node poc/gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH \
  -I ghostscript-10.07.1/lib -I ghostscript-10.07.1/Resource/Init \
  -sOutputFile=/tmp/check-no-font.pdf site/test-custom-font.ps
head -c 8 /tmp/check-no-font.pdf
```

Expected: ログに`Substituting font Courier for CustomFont.`が出力され、
`head -c 8`の出力が`%PDF-1.7`になる。

- [ ] **Step 5: フォント指定込みでのGhostscript動作を確認する(`/fonts/Fontmap`方式)**

`/fonts/Fontmap` + `-I/fonts`方式が`site/test-custom-font.ttf`でも動作することを確認する。

Run:
```bash
mkdir -p /tmp/check-fonts/fonts
cp site/test-custom-font.ttf /tmp/check-fonts/fonts/test-custom-font.ttf
printf '/CustomFont (test-custom-font.ttf) ;\n' > /tmp/check-fonts/fonts/Fontmap
node poc/gs -sDEVICE=pdfwrite -dNOPAUSE -dBATCH \
  -I ghostscript-10.07.1/lib -I ghostscript-10.07.1/Resource/Init -I /tmp/check-fonts/fonts \
  -sOutputFile=/tmp/check-with-font.pdf site/test-custom-font.ps
head -c 8 /tmp/check-with-font.pdf
```

Expected: ログに`Loading CustomFont font from /tmp/check-fonts/fonts/test-custom-font.ttf... done.`
および`Using LiberationMono font for CustomFont.`が出力され、
`head -c 8`の出力が`%PDF-1.7`になる。

- [ ] **Step 6: コミットする**

```bash
git add site/test-custom-font.ps site/test-custom-font.ttf site/test-custom-font-LICENSE.txt
git commit -m "Add test fixtures for custom font upload feature"
```

---

## Task 2: `worker.js`にカスタムフォント処理を追加する

**Files:**
- Modify: `site/worker.js`

- [ ] **Step 1: `site/worker.js`を以下の内容に置き換える**

変更点:
- `clearDir`ヘルパーを追加(`/fonts`ディレクトリ内のファイルを削除、無ければ作成)。
- `convert`受信時、`/input.ps`/`/out.pdf`のクリーンアップに加えて`/fonts`をクリアする。
- `e.data.fonts`(`{name, filename, data}`の配列、無ければ空配列扱い)を`/fonts/<filename>`に
  書き込み、`/fonts/Fontmap`に`/<name> (<filename>) ;`形式のエントリを生成する。
- `fonts`が1件以上ある場合のみ、`callMain`の引数に`-I/fonts`を追加する。
- 既存の`-sDEVICE=pdfwrite`等の引数・`%PDF`ヘッダチェック・エラー処理はそのまま維持する。

```javascript
importScripts('gs.js');

const modulePromise = createGSModule({
  // Never block on stdin (e.g. the "press <return> to continue" page
  // pause or error-recovery prompt) — return EOF immediately, the
  // equivalent of running with -dBATCH -dNOPAUSE.
  stdin: () => null,
  print: () => {},
  printErr: () => {},
});

modulePromise.then(() => {
  postMessage({ type: 'ready' });
}).catch((err) => {
  postMessage({ type: 'error', message: 'Ghostscript の初期化に失敗しました: ' + err.message });
});

// Remove all files inside `path` (creating the directory first if it
// doesn't exist yet), so leftover custom fonts/Fontmap from a previous
// conversion don't affect this one.
function clearDir(Module, path) {
  let entries;
  try {
    entries = Module.FS.readdir(path);
  } catch (err) {
    Module.FS.mkdir(path);
    return;
  }
  for (const entry of entries) {
    if (entry === '.' || entry === '..') continue;
    Module.FS.unlink(path + '/' + entry);
  }
}

self.onmessage = async (e) => {
  if (e.data.type !== 'convert') return;

  try {
    const Module = await modulePromise;

    // Remove any files left over from a previous conversion before
    // writing the new input, so MEMFS state doesn't leak between runs.
    try { Module.FS.unlink('/input.ps'); } catch (e) {}
    try { Module.FS.unlink('/out.pdf'); } catch (e) {}
    clearDir(Module, '/fonts');

    Module.FS.writeFile('/input.ps', new Uint8Array(e.data.data));

    const args = [
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dBATCH',
      '-I/lib', '-I/Resource/Init',
    ];

    // Write any user-supplied custom fonts into /fonts and register them
    // in a Fontmap there, so Ghostscript's font resolution (-I/fonts)
    // picks them up for the PostScript font names the user specified.
    const fonts = e.data.fonts || [];
    if (fonts.length > 0) {
      let fontmap = '';
      for (const font of fonts) {
        Module.FS.writeFile('/fonts/' + font.filename, new Uint8Array(font.data));
        fontmap += `/${font.name} (${font.filename}) ;\n`;
      }
      Module.FS.writeFile('/fonts/Fontmap', fontmap);
      args.push('-I/fonts');
    }

    args.push('-sOutputFile=/out.pdf', '/input.ps');

    Module.callMain(args);

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

- [ ] **Step 2: 構文チェックする**

```bash
node --check site/worker.js
```

Expected: エラーなし(何も出力されない)。

- [ ] **Step 3: コミットする**

```bash
git add site/worker.js
git commit -m "Support custom font uploads via /fonts/Fontmap in worker.js"
```

---

## Task 3: `index.html`にカスタムフォント追加UIを実装する

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: `site/index.html`を以下の内容に置き換える**

変更点:
- `dropzone`の下に「カスタムフォント追加(任意)」セクション(`#fontList` + `#addFontButton`)を追加。
- 「フォントを追加」ボタンで、フォント名入力・ファイル選択(`.ttf,.otf`)・削除ボタンの行を追加する。
- `convertFile`で、`#fontList`内の各行から名前とファイルが両方入力されている行だけを集め、
  各ファイルを`ArrayBuffer`化して`fonts`配列を組み立て、`convert`メッセージに含めて送る。
  PSファイル本体とすべてのフォントの`data`をtransfer listに含める。
- `ready`/`result`/`error`のハンドリング・既存のドラッグ&ドロップ・プレビュー(`iframe`)は変更しない。

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

  <div id="fontSection">
    <h2>カスタムフォント追加(任意)</h2>
    <div id="fontList"></div>
    <button type="button" id="addFontButton">フォントを追加</button>
  </div>

  <p id="result"></p>
  <a id="download" style="display:none">変換結果をダウンロード</a>
  <iframe id="preview" style="display:none; width:100%; height:600px; border:1px solid #ccc;"></iframe>

  <script>
    const status = document.getElementById('status');
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const result = document.getElementById('result');
    const download = document.getElementById('download');
    const preview = document.getElementById('preview');
    const fontList = document.getElementById('fontList');
    const addFontButton = document.getElementById('addFontButton');

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
        preview.src = download.href;
        preview.style.display = 'block';
        result.textContent = '変換が完了しました。';
        status.textContent = '準備完了。.ps ファイルを選択してください。';
        fileInput.disabled = false;
      } else if (msg.type === 'error') {
        result.textContent = `エラー: ${msg.message}`;
        download.style.display = 'none';
        preview.style.display = 'none';
        preview.src = '';
        status.textContent = '準備完了。.ps ファイルを選択してください。';
        fileInput.disabled = false;
      }
    };

    addFontButton.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'font-row';
      row.innerHTML = `
        <input type="text" class="font-name" placeholder="フォント名 (例: MyCustomFont)">
        <input type="file" class="font-file" accept=".ttf,.otf">
        <button type="button" class="remove-font">削除</button>
      `;
      row.querySelector('.remove-font').addEventListener('click', () => row.remove());
      fontList.appendChild(row);
    });

    function convertFile(file) {
      currentFileName = file.name;
      result.textContent = '';
      download.style.display = 'none';
      preview.style.display = 'none';
      preview.src = '';
      status.textContent = `${file.name} を変換中...`;
      fileInput.disabled = true;

      const fontReads = Array.from(fontList.querySelectorAll('.font-row'))
        .map((row) => ({
          name: row.querySelector('.font-name').value.trim(),
          file: row.querySelector('.font-file').files[0],
        }))
        .filter((f) => f.name && f.file)
        .map((f) => f.file.arrayBuffer().then((data) => ({ name: f.name, filename: f.file.name, data })));

      Promise.all([file.arrayBuffer(), Promise.all(fontReads)]).then(([buf, fonts]) => {
        const transfer = [buf, ...fonts.map((f) => f.data)];
        worker.postMessage({ type: 'convert', name: file.name, data: buf, fonts }, transfer);
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

- [ ] **Step 2: コミットする**

```bash
git add site/index.html
git commit -m "Add custom font upload UI to index.html"
```

---

## Task 4: エンドツーエンド動作確認

**Files:** なし(動作確認のみ)

- [ ] **Step 1: ローカルサーバーを起動する**

```bash
cd site && python3 -m http.server 8123
```

(別ターミナル/バックグラウンドで実行し、以降のステップ後に停止する)

- [ ] **Step 2: ブラウザで動作確認する**

`browse`系のヘッドレスブラウザツールが利用可能であれば、`http://localhost:8123/`を開いて
以下を確認する。利用不可("No usable sandbox!"等)であれば、ユーザーに手動確認を依頼し、
確認手順を提示する(Task 4のフォールバック手順は下記参照)。

確認項目:
1. ページロード後、Workerの初期化が完了し`#status`が
   「準備完了。.ps ファイルを選択してください。」になり、`#fileInput`が有効になる。
2. **フォント未指定での変換**: `#fileInput`で`site/test-custom-font.ps`を選択する。
   `#result`が「変換が完了しました。」になり、`#download`と`#preview`(PDF)が表示される
   (代替フォントで変換される)。
3. **カスタムフォント指定での変換**: 「フォントを追加」ボタンをクリックし、表示された行の
   フォント名欄に`CustomFont`と入力、ファイル欄で`site/test-custom-font.ttf`を選択する。
   再度`#fileInput`で`site/test-custom-font.ps`を選択する。`#result`が
   「変換が完了しました。」になり、`#download`と`#preview`(PDF)が表示される。
4. 「削除」ボタンでフォント行を削除できる。
5. 不正なPSファイル(`site/test-invalid.ps`)を選択した場合、`#result`に
   「エラー: ...」が表示され、`#fileInput`が再度有効になる。

**フォールバック(ヘッドレスブラウザ不可の場合)**: ユーザーに以下を提示する。

```
1. cd site && python3 -m http.server 8123
2. ブラウザで http://localhost:8123/ を開く
3. 「準備完了」表示を待つ
4. test-custom-font.ps を選択 → 変換完了・PDFプレビュー表示を確認(フォント未指定)
5. 「フォントを追加」→ フォント名に CustomFont、ファイルに test-custom-font.ttf を指定
6. 再度 test-custom-font.ps を選択 → 変換完了・PDFプレビュー表示を確認(フォント指定)
7. 「削除」ボタンでフォント行が削除できることを確認
```

- [ ] **Step 3: ローカルサーバーを停止する**

```bash
# Step 1で起動したプロセスを停止する
```

---

## セルフレビュー結果

- **仕様カバレッジ**: UI設計(行の追加/削除、フォント名+ファイル選択)→Task 3、
  データフロー(`fonts`配列、transfer list)→Task 3、worker.js処理変更
  (`/fonts`クリーンアップ、Fontmap生成、`-I/fonts`)→Task 2、エラーハンドリング
  (既存経路の再利用、変更なし)→Task 2/3で維持、テスト計画(フォント未指定/指定の両方で
  `%PDF`生成を確認)→Task 1(Step 4-5でCLI検証)とTask 4(Step 2でUI検証)、
  スコープ外項目(事前検証無し、PS内自動検出無し、Type1非対応)はいずれの実装にも含めていない。
- **プレースホルダ確認**: 「TBD」「TODO」等は無し。`-sFONTMAP=`/`-sFONTPATH=`は
  `/fonts/Fontmap` + `-I/fonts`方式に置き換え済み。
- **型/命名の一貫性**: `fonts`配列の要素は`{name, filename, data}`で
  設計書・Task 2(worker.js)・Task 3(index.html)で統一。`clearDir`はTask 2内のみで
  定義・使用され、他タスクから参照されない。
