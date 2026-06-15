# ps2pdf レスポンシブデザイン改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `site/index.html`に`<meta name="viewport">`と軽量な`<style>`ブロックを追加し、
スマートフォンなどの小さい画面・向きが変わる環境でも文字や要素が読みやすく操作しやすい
レイアウトにする。

**Architecture:** `site/index.html`の`<head>`に`<meta name="viewport">`タグと`<style>`
ブロックを追加し、`#preview`のインライン`style`属性の`height:600px`を`height:70vh`に
変更する。`<script>`内のロジック(`extractFontNames`・`updateFontCandidates`・
`convertFile`・`worker`通信など)やDOM構築ロジックは変更しない。`site/worker.js`も
変更しない。

**Tech Stack:** HTML, CSS(`<style>`ブロック)。`site/worker.js`(Ghostscript wasm Web
Worker、変更なし)。

参照: `docs/superpowers/specs/2026-06-15-ps2pdf-responsive-design.md`

---

### Task 1: viewportメタタグ・レスポンシブCSSの追加とpreview高さの可変化

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: `<head>`にviewportメタタグと`<style>`ブロックを追加する**

`site/index.html`の現在の`<head>`(1-6行目):

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PostScript → PDF 変換</title>
</head>
```

を次のように変更する(`<meta name="viewport">`タグと`<style>`ブロックを追加):

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PostScript → PDF 変換</title>
  <style>
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 1em;
      font-size: 1rem;
      font-family: sans-serif;
      box-sizing: border-box;
    }
    input, button {
      font-size: 1rem;
    }
    button {
      padding: 0.6em 1.2em;
      min-height: 44px;
    }
    .font-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5em;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 0.5em;
      margin-bottom: 0.5em;
    }
    .font-name {
      font-weight: bold;
      flex: 1 1 100%;
    }
    .font-file {
      flex: 1 1 auto;
      min-width: 0;
    }
    #reconvertButton {
      display: block;
      width: 100%;
      margin-top: 0.5em;
    }
  </style>
</head>
```

- [ ] **Step 2: `#preview`の高さを可変にする**

`site/index.html`の24行目:

```html
  <iframe id="preview" style="display:none; width:100%; height:600px; border:1px solid #ccc;"></iframe>
```

を次のように変更する(`height:600px`を`height:70vh`に変更):

```html
  <iframe id="preview" style="display:none; width:100%; height:70vh; border:1px solid #ccc;"></iframe>
```

- [ ] **Step 3: 追加したタグ・スタイルが存在することを確認する**

```bash
grep -c 'name="viewport"' site/index.html
grep -c 'height:70vh' site/index.html
grep -c '#reconvertButton {' site/index.html
grep -c 'height:600px' site/index.html
```

Expected:
- `name="viewport"` → `1`
- `height:70vh` → `1`
- `#reconvertButton {` → `1`
- `height:600px` → `0`(完全に置き換わっていること)

- [ ] **Step 4: `task lint`を実行する**

```bash
task lint
```

Expected: exit code 0、エラーなし。`<script>`内のJavaScriptは変更していないため、
既存のlint結果に影響しないことを確認する。

- [ ] **Step 5: コミットする**

```bash
git add site/index.html
git commit -m "Add viewport meta tag and responsive styles for small screens"
```

---

## Self-Review

- **Spec coverage**:
  - design 1.(viewportメタタグ) → Step 1
  - design 2.(ベース/グローバルスタイル: `body`・`input, button`) → Step 1
  - design 3.(ドロップゾーン・ボタンのタップ領域: `button { padding; min-height }`) →
    Step 1(`#dropzone`自体のインラインstyleは変更しない、design通り)
  - design 4.(`.font-row`/`.font-name`/`.font-file`のflexレイアウト、案B) → Step 1
  - design 5.(`#reconvertButton`の全幅化) → Step 1
  - design 6.(`#preview`の`height:70vh`化) → Step 2
  - テスト計画の「`task lint`がエラーなく完了する」 → Step 4
- **Placeholder scan**: 全ステップに完全なHTML/CSSコードと実行コマンド・期待結果を記載。
- **Type/naming consistency**: `.font-row`/`.font-name`/`.font-file`/`#reconvertButton`/
  `#preview`のセレクタ名は、`site/index.html`の既存`<script>`内で使われているクラス名・
  ID(`updateFontCandidates`が生成する`row.className = 'font-row'`、
  `nameEl.className = 'font-name'`、`fileEl.className = 'font-file'`、
  `document.getElementById('reconvertButton')`、`document.getElementById('preview')`)と
  一致している。
