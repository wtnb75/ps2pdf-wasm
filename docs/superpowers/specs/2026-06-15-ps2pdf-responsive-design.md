# ps2pdf レスポンシブデザイン改善 設計

## 背景・目的

現在の`site/index.html`には`<meta name="viewport">`が設定されておらず、また`<style>`
ブロックも存在しない(インラインstyle属性のみ)。そのため、スマートフォンなどの小さい
画面で開くと、モバイルブラウザがページ全体を仮想的に980px幅としてレンダリングしてから
縮小表示するため、文字や要素が全体的に小さく表示され読みにくい。また、変換結果プレビュー
の`<iframe>`は高さが固定600pxのため、画面の向き(縦/横)やサイズが変わる環境では
表示が画面に収まらない、または余白が大きくなりすぎる。

本作業では、`<meta name="viewport">`の追加と軽量な`<style>`ブロックの追加により、
画面サイズ・向きが変わる環境でも読みやすく操作しやすいレイアウトに改善する。

## 1. viewportメタタグの追加

`<head>`内に以下を追加する:

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

モバイルブラウザがページを実際のデバイス幅でレンダリングするようにする。これが
「文字が小さい」問題の主要な原因への対処となる。

## 2. ベース/グローバルスタイル

`<head>`内に以下の`<style>`ブロックを追加する:

```html
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
</style>
```

- `max-width: 800px; margin: 0 auto;` — 大画面では本文幅を読みやすい幅に制限し中央寄せ
  にする。小画面では`max-width`に達しないため、`padding`分の余白を持つ全幅レイアウトに
  なる。これにより画面幅に応じた個別のメディアクエリは不要。
- `font-size: 1rem`(ブラウザ既定の16px相当) — viewportメタタグと組み合わせて、
  モバイルでも実寸で16px相当の文字サイズになる。
- `input, button { font-size: 1rem; }` — iOS Safariでは16px未満のフォームコントロールに
  フォーカスすると自動ズームが発生するため、これを防ぐ。

## 3. ドロップゾーン・ボタンのタップ領域

既存の`#dropzone`のスタイル(`border: 2px dashed #888; padding: 2em; text-align: center;`)
は維持する。`button`要素全般(`#reconvertButton`の`.clear-font`)に以下を`<style>`ブロックに
追加し、タップしやすい最小サイズを確保する:

```css
  button {
    padding: 0.6em 1.2em;
    min-height: 44px;
  }
```

(上記は前項の`input, button { font-size: 1rem; }`ルールと同じ`<style>`ブロック内に
まとめて記述する。)

## 4. フォント行(`.font-row`)のレイアウト

`updateFontCandidates()`が生成する`.font-row`に、以下のCSSを`<style>`ブロックに追加し、
flexboxで折り返し配置にする(ブレインストーミングで選択した案B):

```css
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
```

- `.font-name`は常に1行を占有する(`flex: 1 1 100%`)。
- `.font-file`(ファイル入力)と`.clear-font`(クリアボタン)は同じ行に並び、画面幅が
  狭い場合は折り返す。
- `site/index.html`の`updateFontCandidates()`内のDOM構築ロジック(要素の作成・
  クラス名・追加順序)自体は変更しない。

## 5. 「再描画」ボタン(`#reconvertButton`)

`#reconvertButton`に以下のCSSを`<style>`ブロックに追加し、画面幅いっぱいの大きなボタンに
する:

```css
  #reconvertButton {
    display: block;
    width: 100%;
    margin-top: 0.5em;
  }
```

## 6. 変換結果プレビュー(`#preview`)の高さ

`site/index.html`内の`#preview`要素のインライン`style`属性:

```html
<iframe id="preview" style="display:none; width:100%; height:600px; border:1px solid #ccc;"></iframe>
```

の`height:600px`を`height:70vh`に変更する:

```html
<iframe id="preview" style="display:none; width:100%; height:70vh; border:1px solid #ccc;"></iframe>
```

JavaScript側(`worker.onmessage`の`result`ハンドラ等)で`preview.style.display`を
切り替える処理は変更しない。

## スコープ外

- `<script>`内のロジック変更(`extractFontNames`・`updateFontCandidates`の処理内容・
  `convertFile`・`worker`通信など)。DOM構築ロジックは変更しない。
- `site/worker.js`の変更。
- ダークモード対応。
- ブレークポイント別の詳細なメディアクエリ(現状は`max-width`+`flex-wrap`による
  fluidなレイアウトで対応する)。

## テスト計画

- `site/index.html`をブラウザの開発者ツールでスマートフォン相当の画面幅(例: 360px)に
  設定して開き、見出し・本文・ボタン・フォーム要素の文字サイズが縮小されずに表示される
  ことを確認する(viewportメタタグの効果)。
- `testdata/test-custom-font.ps`を選択し、検出されたフォント行(`.font-row`)が
  狭い画面幅でフォント名・ファイル入力・クリアボタンが重ならずに表示されることを
  確認する。
- `#reconvertButton`が画面幅いっぱいに表示されることを確認する。
- 画面の向き(縦/横)を切り替えた際、`#preview`(変換結果プレビュー)の高さが画面の
  高さに応じて変化することを確認する。
- 既存のデスクトップ幅(800px超)での表示が大きく崩れていないことを確認する
  (本文が中央寄せの800px幅コンテナに収まる)。
- `task lint`がエラーなく完了することを確認する。

## 成功基準

- `<meta name="viewport">`が追加され、モバイルブラウザでページが実寸でレンダリング
  される。
- スマートフォン相当の画面幅で、見出し・本文・フォーム要素が縮小されずに読める。
- フォント行(`.font-name`/`.font-file`/`.clear-font`)が狭い画面幅で折り返され、
  重なりや溢れが発生しない。
- 「再描画」ボタンが画面幅いっぱいに表示される。
- 変換結果プレビュー(`#preview`)の高さが画面の高さに応じて可変になる
  (`height: 70vh`)。
- `task lint`がエラーなく完了する。
