# PS→PDF変換サイト カスタムフォント名候補表示 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `site/index.html`のカスタムフォント追加UIで、選択された`.ps`ファイルから
`findfont`で参照されているフォント名(標準14フォントを除く)を自動抽出し、フォント名入力を
ドロップダウン選択に変更する。

**Architecture:** `.ps`ファイルが選択/ドロップされた時点で`file.text()`によりテキストを読み込み、
正規表現で`/Name findfont`パターンを抽出、標準14フォントを除外・重複除去した
`fontCandidates`配列を作成する。`.font-name`を`<input type="text">`から`<select>`に変更し、
`fontCandidates`をoptionとして列挙する。候補が0件の場合は「フォントを追加」ボタンを無効化する。

**Tech Stack:** プレーンJavaScript(`site/index.html`のみ変更、ビルド不要)。

参照仕様: `docs/superpowers/specs/2026-06-14-ps2pdf-font-name-suggestion-design.md`

---

## ファイル構成

- 修正: `site/index.html` — フォント名候補抽出ロジック(`extractFontNames`/
  `updateFontCandidates`/`populateFontNameSelect`)、`#fontCandidateMessage`要素、
  `.font-name`の`<select>`化、`fileInput`の`change`/`dropzone`の`drop`ハンドラからの
  `updateFontCandidates`呼び出しを追加する。
- 他ファイル(`site/worker.js`、テストフィクスチャ群)は変更しない。`site/test-custom-font.ps`
  (`/CustomFont findfont`参照)と`site/test.ps`(`/Helvetica findfont`のみ参照)は既存のものを
  検証に使う。

---

## Task 1: フォント名候補抽出ロジックとUIの実装

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: 正規表現による抽出ロジックをNode.jsで検証する**

実装前に、抽出ロジックが意図通り動作することを単体で確認する。リポジトリルートで以下を実行する:

```bash
node -e "
const STANDARD_14_FONTS = new Set([
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
  'Symbol', 'ZapfDingbats',
]);

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

const fs = require('fs');
console.log('test-custom-font.ps:', extractFontNames(fs.readFileSync('site/test-custom-font.ps', 'utf8')));
console.log('test.ps:', extractFontNames(fs.readFileSync('site/test.ps', 'utf8')));
"
```

Expected:
```
test-custom-font.ps: [ 'CustomFont' ]
test.ps: []
```

- [ ] **Step 2: `site/index.html`を以下の内容に置き換える**

変更点:
- `#fontSection`内、`#fontList`の前に`#fontCandidateMessage`(`<p>`)を追加。初期状態(候補なし)
  として表示し、`#addFontButton`に`disabled`属性を付与する。
- `STANDARD_14_FONTS`(標準14フォント名のSet)、`extractFontNames(text)`(正規表現抽出+
  標準14除外+重複除去)、`populateFontNameSelect(select)`(`fontCandidates`から`<option>`を
  再構築し、直前の選択値が新一覧にあれば保持)、`updateFontCandidates(file)`
  (`file.text()`で`fontCandidates`を再計算し、`#fontCandidateMessage`の表示/非表示・
  `#addFontButton.disabled`・既存の全`.font-name`セレクトの再構築を行う)を追加。
- `addFontButton`のクリックハンドラで、`.font-name`を`<input type="text">`から
  `<select class="font-name"></select>`に変更し、`populateFontNameSelect`で初期化する。
- `fileInput`の`change`イベントと`dropzone`の`drop`イベントで、`updateFontCandidates(file)`と
  `convertFile(file)`を両方呼び出す。
- `convertFile`内の`fontReads`構築ロジック(`.font-name`の`.value`取得、`.filter((f) => f.name && f.file)`等)は変更しない(`<select>`も`.value`で値が取得できるため)。
- `worker.onmessage`のready/result/errorハンドリング、`<iframe id="preview">`、
  drag&dropの`preventDefault`等、その他の既存動作は変更しない。

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
    <p id="fontCandidateMessage">検出されたカスタムフォントはありません</p>
    <div id="fontList"></div>
    <button type="button" id="addFontButton" disabled>フォントを追加</button>
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
    const fontCandidateMessage = document.getElementById('fontCandidateMessage');

    const worker = new Worker('worker.js');
    let currentFileName = '';
    let fontCandidates = [];

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

    // Rebuild a .font-name <select>'s options from fontCandidates,
    // keeping the previous selection if it is still a valid candidate.
    function populateFontNameSelect(select) {
      const previous = select.value;
      select.innerHTML = '';
      for (const name of fontCandidates) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      }
      if (fontCandidates.includes(previous)) {
        select.value = previous;
      }
    }

    // Re-scan the selected .ps file for custom font names and refresh
    // the font candidate UI (message, add-button state, existing rows).
    function updateFontCandidates(file) {
      file.text().then((text) => {
        fontCandidates = extractFontNames(text);
        fontCandidateMessage.style.display = fontCandidates.length === 0 ? 'block' : 'none';
        addFontButton.disabled = fontCandidates.length === 0;
        fontList.querySelectorAll('.font-name').forEach(populateFontNameSelect);
      });
    }

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
        <select class="font-name"></select>
        <input type="file" class="font-file" accept=".ttf,.otf">
        <button type="button" class="remove-font">削除</button>
      `;
      populateFontNameSelect(row.querySelector('.font-name'));
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
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        updateFontCandidates(file);
        convertFile(file);
      }
    });

    dropzone.addEventListener('dragover', (e) => e.preventDefault());
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!fileInput.disabled && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        updateFontCandidates(file);
        convertFile(file);
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: `<script>`部分を抜き出して構文チェックする**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('site/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('/tmp/index-script-check.js', script);
"
node --check /tmp/index-script-check.js
```

Expected: `node --check`はエラーなし(何も出力されない)。

- [ ] **Step 4: コミットする**

```bash
git add site/index.html
git commit -m "Add custom font name suggestions extracted from PS file"
```

---

## Task 2: エンドツーエンド動作確認

**Files:** なし(動作確認のみ)

- [ ] **Step 1: ローカルサーバーを起動する**

```bash
cd site && python3 -m http.server 8123
```

(別ターミナル/バックグラウンドで実行し、以降のステップ後に停止する)

- [ ] **Step 2: ブラウザで動作確認する**

`browse`系のヘッドレスブラウザツールが利用可能であれば、`http://localhost:8123/`を開いて
以下を確認する。利用不可("No usable sandbox!"等)であれば、ユーザーに手動確認を依頼し、
確認手順を提示する(下記フォールバック参照)。

確認項目:
1. ページロード後、`#status`が「準備完了。.ps ファイルを選択してください。」になり、
   `#fileInput`が有効になる。初期状態では`#fontCandidateMessage`
   (「検出されたカスタムフォントはありません」)が表示され、`#addFontButton`が無効化されている。
2. **カスタムフォント参照あり**: `#fileInput`で`site/test-custom-font.ps`を選択する。
   `#fontCandidateMessage`が非表示になり、`#addFontButton`が有効化される。`#result`が
   「変換が完了しました。」になり、`#download`/`#preview`が表示される。
3. 「フォントを追加」ボタンをクリックし、追加された行の`.font-name`セレクトに`CustomFont`が
   選択肢として表示されることを確認する。`.font-file`に`site/test-custom-font.ttf`を選択し、
   再度`site/test-custom-font.ps`を選択して変換 → `#result`が「変換が完了しました。」になり、
   `#download`/`#preview`が表示される。
4. **カスタムフォント参照なし**: `#fileInput`で`site/test.ps`(`/Helvetica`のみ参照)を選択する。
   `#fontCandidateMessage`が再表示され、`#addFontButton`が無効化される。変換自体は成功し
   `#result`が「変換が完了しました。」になる。
5. Step3で追加したフォント行の`.font-name`セレクトのoptionが、Step4実行後は空になっている
   (`fontCandidates`が空のため)ことを確認する。

**フォールバック(ヘッドレスブラウザ不可の場合)**: ユーザーに以下を提示する。

```
1. cd site && python3 -m http.server 8123
2. ブラウザで http://localhost:8123/ を開く
3. 「準備完了」表示を待つ。「検出されたカスタムフォントはありません」と表示され、
   「フォントを追加」ボタンが無効になっていることを確認する
4. test-custom-font.ps を選択する
   → 「検出されたカスタムフォントはありません」が消え、「フォントを追加」ボタンが有効になる
   → 変換完了・PDFプレビュー表示を確認する
5. 「フォントを追加」をクリックし、表示されたドロップダウンに CustomFont が
   選択肢として表示されていることを確認する
6. .font-file に test-custom-font.ttf を指定し、再度 test-custom-font.ps を選択する
   → 変換完了・PDFプレビュー表示を確認する(カスタムフォント指定込み)
7. test.ps を選択する
   → 「検出されたカスタムフォントはありません」が再表示され、「フォントを追加」ボタンが
     無効になることを確認する
   → 変換自体は成功することを確認する
```

- [ ] **Step 3: ローカルサーバーを停止する**

```bash
# Step 1で起動したプロセスを停止する
```

---

## セルフレビュー結果

- **仕様カバレッジ**: フォント名抽出ロジック(正規表現・標準14除外・重複除去)→Task 1
  Step 1-2、UI設計(`#fontCandidateMessage`・`#addFontButton`の有効/無効・`.font-name`の
  `<select>`化・既存行のoption再構築)→Task 1 Step 2、データフロー
  (`updateFontCandidates`+`convertFile`の並行実行、`fonts`配列の形式は不変)→Task 1 Step 2、
  エラーハンドリング(候補0件時の自動除外、`file.text()`失敗時のフォールバック)→Task 1 Step 2
  (`updateFontCandidates`の実装に内包)、テスト計画(`test-custom-font.ps`/`test.ps`での
  候補表示確認、変換成功確認)→Task 1 Step 1(抽出ロジック単体)とTask 2 Step 2(UI/E2E)、
  スコープ外項目(動的フォント名検出、自由入力の廃止、複数PS一括処理)はいずれの実装にも
  含めていない(自由入力は`.font-name`の`<select>`化により廃止済み)。
- **プレースホルダ確認**: 「TBD」「TODO」等は無し。
- **型/命名の一貫性**: `fontCandidates`(配列)、`extractFontNames`、`populateFontNameSelect`、
  `updateFontCandidates`、`STANDARD_14_FONTS`はTask 1内で定義・使用されすべて一致。
  `convertFile`の`fontReads`構築ロジック(`{name, filename, data}`)はTask 2(既存
  カスタムフォント機能)と変更なく一致する。
