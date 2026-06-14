# PS→PDF変換サイト カスタムフォント変更時の自動再変換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.ps`ファイル読み込み後にカスタムフォント行(追加/編集/削除)を変更すると、`.ps`ファイルの再選択なしにプレビューが自動的に再変換される。

**Architecture:** `site/index.html`に、最後に読み込んだ`.ps`の`File`オブジェクトを保持する`currentFile`状態と、それを使って`convertFile`を再実行する`reconvertIfReady()`を追加する。`#fontList`への`change`イベントデレゲーション、「フォントを追加」ボタン、各行の「削除」ボタンから`reconvertIfReady()`を呼び出す。

**Tech Stack:** 静的HTML + Vanilla JavaScript(`site/index.html`)。設計は`docs/superpowers/specs/2026-06-14-ps2pdf-font-auto-reconvert-design.md`を参照。

---

### Task 1: 自動再変換ロジックの実装

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: `currentFile`状態を追加する**

`site/index.html`の以下の箇所:

```javascript
    const worker = new Worker('worker.js');
    let currentFileName = '';
    let fontCandidates = [];
```

を次のように変更する:

```javascript
    const worker = new Worker('worker.js');
    let currentFileName = '';
    let currentFile = null;
    let fontCandidates = [];
```

- [ ] **Step 2: `reconvertIfReady()`関数を追加する**

`site/index.html`の`updateFontCandidates`関数の直後(以下のブロックの直後):

```javascript
    function updateFontCandidates(file) {
      file.text().then((text) => {
        fontCandidates = extractFontNames(text);
        fontCandidateMessage.style.display = fontCandidates.length === 0 ? 'block' : 'none';
        addFontButton.disabled = fontCandidates.length === 0;
        fontList.querySelectorAll('.font-name').forEach(populateFontNameSelect);
      });
    }
```

に、次の関数を追加する(`updateFontCandidates`の閉じ`}`の直後、空行を1行挟んで):

```javascript

    // Re-run the conversion with the currently loaded .ps file after a
    // custom font row changes, so the preview reflects the new font
    // configuration without requiring the user to reselect the .ps file.
    function reconvertIfReady() {
      if (currentFile && !fileInput.disabled) {
        convertFile(currentFile);
      }
    }
```

- [ ] **Step 3: 「フォントを追加」ボタンと「削除」ボタンから`reconvertIfReady()`を呼ぶ**

`site/index.html`の以下のブロック:

```javascript
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
```

を次のように変更する:

```javascript
    addFontButton.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'font-row';
      row.innerHTML = `
        <select class="font-name"></select>
        <input type="file" class="font-file" accept=".ttf,.otf">
        <button type="button" class="remove-font">削除</button>
      `;
      populateFontNameSelect(row.querySelector('.font-name'));
      row.querySelector('.remove-font').addEventListener('click', () => {
        row.remove();
        reconvertIfReady();
      });
      fontList.appendChild(row);
      reconvertIfReady();
    });
```

- [ ] **Step 4: `#fontList`への`change`イベントデレゲーションを追加し、`fileInput`/`dropzone`ハンドラで`currentFile`を設定する**

`site/index.html`の以下のブロック:

```javascript
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
```

を次のように変更する:

```javascript
    fontList.addEventListener('change', (e) => {
      if (e.target.matches('.font-name, .font-file')) {
        reconvertIfReady();
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

- [ ] **Step 5: `<script>`部分を抜き出して構文チェックする**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('site/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('/tmp/index-script-check.js', script);
"
node --check /tmp/index-script-check.js
```

Expected: no output(no error)。

- [ ] **Step 6: コミットする**

```bash
git add site/index.html
git commit -m "Auto-reconvert preview when custom font rows change"
```

---

### Task 2: ロジック検証(コードトレース)

このリポジトリにはブラウザE2Eテストが実行できない環境がある(ヘッドレスChromiumのサンドボックスエラー)。その場合は以下のコードトレースで検証する。ブラウザでの確認が可能であれば、`cd site && python3 -m http.server 8123`で配信し、実ブラウザで以下を確認してもよい。

このタスクはファイルを変更しない(検証のみ)。

- [ ] **Step 1: 初回変換時に`currentFile`が設定されることを確認する**

`site/index.html`を読み、`fileInput`の`change`ハンドラと`dropzone`の`drop`ハンドラの両方で、`convertFile(file)`呼び出し前に`currentFile = file;`が設定されていることを確認する。

- [ ] **Step 2: フォント行追加時の自動再変換を確認する**

`test-custom-font.ps`選択後(`currentFile`が設定され、`fileInput.disabled`は変換完了後`false`)、「フォントを追加」ボタンをクリックすると、`addFontButton`のクリックハンドラ末尾の`reconvertIfReady()`が呼ばれ、`currentFile`が真かつ`fileInput.disabled`が`false`なので`convertFile(currentFile)`が再実行されることを確認する。この時点では追加された行の`.font-file`が未指定のため、`fontReads`の結果は変換前と同じになる(`f.name && f.file`フィルタにより除外)。

- [ ] **Step 3: フォントファイル選択時の自動再変換を確認する**

追加された行の`.font-file`に`test-custom-font.ttf`を指定すると、`input`要素の`change`イベントが発火し、`fontList`の`change`イベントデレゲーションの`e.target.matches('.font-name, .font-file')`が真になり`reconvertIfReady()`が呼ばれ、`convertFile(currentFile)`が再実行されることを確認する。この時、行の`.font-name`(select)には`CustomFont`が選択されており、`.font-file`には`test-custom-font.ttf`が設定されているため、`fontReads`に`{name:'CustomFont', filename:'test-custom-font.ttf', data}`が含まれ、worker側でカスタムフォントが適用された`%PDF`が再生成されることを確認する。

- [ ] **Step 4: 削除ボタンクリック時の自動再変換を確認する**

追加した行の「削除」ボタンをクリックすると、`row.remove()`の後に`reconvertIfReady()`が呼ばれ、`convertFile(currentFile)`が再実行され、フォント未指定状態(変換前と同じ結果)に戻ることを確認する。

- [ ] **Step 5: 変換中のトリガーが無視されることを確認する**

`convertFile`内で`fileInput.disabled = true`が設定されている間(`worker.onmessage`の`result`/`error`で`false`に戻るまで)に`reconvertIfReady()`が呼ばれても、`!fileInput.disabled`が`false`のため`convertFile`は呼ばれないことを確認する。

- [ ] **Step 6: `.ps`未選択時のトリガーが無視されることを確認する**

ページロード直後(`currentFile === null`)に「フォントを追加」をクリックしても、`reconvertIfReady()`内の`currentFile`チェックにより`convertFile`は呼ばれないことを確認する。

---

## Self-Review

- **Spec coverage**: 設計の`currentFile`状態管理、`reconvertIfReady()`、`change`イベントデレゲーション、「フォントを追加」/「削除」ボタンからの呼び出し、エラーハンドリング(変換中・`.ps`未選択時は無視)、テスト計画の各ケース(行追加・ファイル選択・削除・変換中・未選択)はTask 1のStep 1-4とTask 2のStep 1-6でカバーされている。
- **Placeholder scan**: 各ステップに完全なコード・コマンド・期待結果を記載済み。プレースホルダーなし。
- **Type/naming consistency**: `currentFile`、`reconvertIfReady`、`updateFontCandidates`、`convertFile`、`fontList`、`.font-name`/`.font-file`は既存実装(`docs/superpowers/plans/2026-06-14-ps2pdf-font-name-suggestion.md`およびマージ済み`site/index.html`)と一致している。
