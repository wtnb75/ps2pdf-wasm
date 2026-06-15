# ps2pdfカスタムフォントUI改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.ps`アップロード時に検出された各カスタムフォントについてフォント行を自動表示し、
フォントアップロード自体では再変換せず「再描画」ボタンでのみ反映するように`site/index.html`を
変更する。

**Architecture:** `site/index.html`内のインライン`<script>`のみを変更する。`#fontSection`の
HTML構造を「検出フォント行(フォント名ラベル+ファイル入力+クリアボタン)」+「再描画ボタン」に
変更し、`updateFontCandidates()`をフォント行生成関数として書き換え、自動再変換ロジック
(`reconvertIfReady`・`fontList`の`change`リスナー)を削除して「再描画」ボタンのクリック
ハンドラに置き換える。`site/worker.js`は変更しない。

**Tech Stack:** Vanilla JavaScript (DOM API), HTML, `site/worker.js`(Ghostscript wasm Web
Worker、変更なし)。

参照: `docs/superpowers/specs/2026-06-15-ps2pdf-font-ui-improvements-design.md`

---

### Task 1: フォントUIの自動行表示・再描画ボタンへの変更

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: `#fontSection`のHTMLを変更する**

`site/index.html`の現在の以下のブロック(16-21行目):

```html
  <div id="fontSection">
    <h2>カスタムフォント追加(任意)</h2>
    <p id="fontCandidateMessage">検出されたカスタムフォントはありません</p>
    <div id="fontList"></div>
    <button type="button" id="addFontButton" disabled>フォントを追加</button>
  </div>
```

を次のように変更する(「フォントを追加」ボタンを削除し、「再描画」ボタンを追加、初期状態
では非表示にする):

```html
  <div id="fontSection">
    <h2>カスタムフォント追加(任意)</h2>
    <p id="fontCandidateMessage">検出されたカスタムフォントはありません</p>
    <div id="fontList"></div>
    <button type="button" id="reconvertButton" style="display:none">再描画</button>
  </div>
```

- [ ] **Step 2: インライン`<script>`の内容を全体的に書き換える**

`site/index.html`の`<script>`タグ(27行目)から`</script>`タグ(197行目)までの内容を、
次の内容で完全に置き換える:

```javascript
    const statusEl = document.getElementById('status');
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const result = document.getElementById('result');
    const download = document.getElementById('download');
    const preview = document.getElementById('preview');
    const fontList = document.getElementById('fontList');
    const reconvertButton = document.getElementById('reconvertButton');
    const fontCandidateMessage = document.getElementById('fontCandidateMessage');

    const worker = new Worker('worker.js');
    let currentFileName = '';
    let currentFile = null;

    // PostScript standard 14 fonts — Ghostscript handles these correctly
    // without a custom font upload, so they are not useful as font-name
    // candidates for the custom font UI.
    const STANDARD_14_FONTS = new Set([
      'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
      'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
      'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
      'Symbol', 'ZapfDingbats',
    ]);

    // Extract font names referenced via `/Name findfont` in PostScript
    // source, excluding standard 14 fonts and duplicates, in order of
    // first occurrence.
    function extractFontNames(text) {
      const names = [];
      const seen = new Set();
      const re = /\/([A-Za-z0-9][A-Za-z0-9+\-.]*)\s+findfont/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const name = m[1];
        if (STANDARD_14_FONTS.has(name) || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
      }
      return names;
    }

    // Re-scan the selected .ps file for custom font names and rebuild the
    // font row UI: one row per detected font name, each with a file input
    // for uploading that font and a button to clear the selection. Also
    // shows/hides the "再描画" button depending on whether any custom
    // fonts were detected.
    function updateFontCandidates(file) {
      return file.text().then((text) => {
        const fontCandidates = extractFontNames(text);
        fontCandidateMessage.style.display = fontCandidates.length === 0 ? 'block' : 'none';
        fontList.innerHTML = '';
        for (const name of fontCandidates) {
          const row = document.createElement('div');
          row.className = 'font-row';

          const nameEl = document.createElement('span');
          nameEl.className = 'font-name';
          nameEl.textContent = name;

          const fileEl = document.createElement('input');
          fileEl.type = 'file';
          fileEl.className = 'font-file';
          fileEl.accept = '.ttf,.otf';

          const clearButton = document.createElement('button');
          clearButton.type = 'button';
          clearButton.className = 'clear-font';
          clearButton.textContent = 'クリア';
          clearButton.addEventListener('click', () => {
            fileEl.value = '';
          });

          row.append(nameEl, fileEl, clearButton);
          fontList.appendChild(row);
        }
        reconvertButton.style.display = fontCandidates.length > 0 ? 'inline' : 'none';
        reconvertButton.disabled = fileInput.disabled;
      });
    }

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        statusEl.textContent = '準備完了。.ps ファイルを選択してください。';
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
        statusEl.textContent = '準備完了。.ps ファイルを選択してください。';
        fileInput.disabled = false;
        reconvertButton.disabled = false;
      } else if (msg.type === 'error') {
        result.textContent = `エラー: ${msg.message}`;
        download.style.display = 'none';
        preview.style.display = 'none';
        preview.src = '';
        statusEl.textContent = '準備完了。.ps ファイルを選択してください。';
        fileInput.disabled = false;
        reconvertButton.disabled = false;
      }
    };

    function convertFile(file) {
      currentFileName = file.name;
      result.textContent = '';
      download.style.display = 'none';
      preview.style.display = 'none';
      preview.src = '';
      statusEl.textContent = `${file.name} を変換中...`;
      fileInput.disabled = true;
      reconvertButton.disabled = true;

      const fontReads = Array.from(fontList.querySelectorAll('.font-row'))
        .map((row) => ({
          name: row.querySelector('.font-name').textContent.trim(),
          file: row.querySelector('.font-file').files[0],
        }))
        .filter((f) => f.name && f.file)
        .map((f) => f.file.arrayBuffer().then((data) => ({ name: f.name, filename: f.file.name, data })));

      Promise.all([file.arrayBuffer(), Promise.all(fontReads)]).then(([buf, fonts]) => {
        const transfer = [buf, ...fonts.map((f) => f.data)];
        worker.postMessage({ type: 'convert', name: file.name, data: buf, fonts }, transfer);
      });
    }

    reconvertButton.addEventListener('click', () => {
      if (currentFile) {
        convertFile(currentFile);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        currentFile = file;
        updateFontCandidates(file);
        convertFile(file);
      }
    });

    dropzone.addEventListener('dragover', (e) => e.preventDefault());
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!fileInput.disabled && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        currentFile = file;
        updateFontCandidates(file);
        convertFile(file);
      }
    });
```

Note: keep the surrounding `<script>` / `</script>` tags and their existing
indentation (4 spaces) as in the original file — only the content between them
changes.

- [ ] **Step 3: 構文確認(`node --check`)を行う**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('site/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('/tmp/index-script-check.js', script);
"
node --check /tmp/index-script-check.js
```

Expected: no output (no syntax error).

- [ ] **Step 4: `task lint`を実行する**

```bash
task lint
```

Expected: exit code 0、エラーなし。`addFontButton`・`fontCandidates`・
`populateFontNameSelect`・`reconvertIfReady`への参照が残っていないこと
(`no-undef`/`no-unused-vars`エラーが出ないこと)を確認する。

- [ ] **Step 5: コミットする**

```bash
git add site/index.html
git commit -m "Auto-show custom font rows per detected font and add a redraw button"
```

---

## Self-Review

- **Spec coverage**: design docの各項目に対応 — フォント行自動表示・クリアボタン(Step 2の
  `updateFontCandidates`)、再描画ボタンの表示条件/disabled制御/初期状態(Step 1の
  `reconvertButton`要素 + Step 2の`reconvertButton.style.display`/`disabled`設定)、
  自動再変換の廃止(Step 2で`reconvertIfReady`・`fontList`の`change`リスナーを削除し
  `reconvertButton`のクリックハンドラに一本化)、`convertFile()`の`fontReads`変更
  (`.font-name`を`<select>`の`value`から`<span>`の`textContent`に変更)。`worker.js`は
  変更不要(design 5.)。
- **Placeholder scan**: 全ステップに完全なHTML/JSコードと実行コマンド・期待結果を記載。
- **Type/naming consistency**: `reconvertButton`・`updateFontCandidates`・`convertFile`・
  `currentFile`・`fontList`・`.font-name`/`.font-file`/`.clear-font`はStep 1とStep 2で
  一貫している。`fontCandidates`は関数ローカル変数として扱い、グローバル変数としては
  削除(旧コードのグローバル`fontCandidates`・`populateFontNameSelect`・`addFontButton`・
  `reconvertIfReady`はすべて新コードに存在しない)。
