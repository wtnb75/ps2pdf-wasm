# PS→PDF変換サイト カスタムフォント名候補表示 設計

## 背景・目的

`site/`には[カスタムフォントアップロード機能](./2026-06-14-ps2pdf-custom-fonts-design.md)が実装済みである。
この機能では、ユーザーが手動でフォント名(例: `MyCustomFont`)をテキスト入力する必要があるが、
PostScriptファイル内でどのフォント名が参照されているかをユーザー自身がファイルを読んで確認する
必要があり、手間がかかる。

本機能では、選択された`.ps`ファイルから`findfont`で参照されているフォント名を自動抽出し、
ユーザーがその一覧から選択できるようにすることで、入力の手間と入力ミスを減らす。

## フォント名抽出ロジック

`.ps`ファイルが選択/ドロップされた時点(変換開始前)で、`file.text()`でテキストとして読み込み、
正規表現 `/\/([A-Za-z0-9][A-Za-z0-9+\-.]*)\s+findfont/g` で`/Name findfont`パターンを検出する。

検出した名前から、以下の標準14フォントを除外し、重複を除いた一覧`fontCandidates`(出現順)を
作成する:

```
Helvetica, Helvetica-Bold, Helvetica-Oblique, Helvetica-BoldOblique,
Times-Roman, Times-Bold, Times-Italic, Times-BoldItalic,
Courier, Courier-Bold, Courier-Oblique, Courier-BoldOblique,
Symbol, ZapfDingbats
```

標準14フォントはGhostscriptが標準で正確に処理できるため、カスタムフォント候補としては不要。

## UI設計

- `#fontSection`内、`#fontList`の前に`#fontCandidateMessage`(`<p>`)を追加する。
  - `fontCandidates`が空の場合、「検出されたカスタムフォントはありません」という文言を表示し、
    `#addFontButton`を`disabled`にする。
  - `fontCandidates`が1件以上の場合は`#fontCandidateMessage`を非表示にし、`#addFontButton`を
    有効化する。
- 「フォントを追加」ボタンで追加される行(`.font-row`)の構成を変更する:
  - `.font-name`を`<input type="text">`から`<select class="font-name">`に変更し、
    `fontCandidates`の各名前を`<option>`として列挙する。先頭の候補を初期選択状態とする
    (空の「選択してください」用optionは設けない)。
  - `.font-file`(`accept=".ttf,.otf"`)・「削除」ボタンは変更なし。
- `.ps`ファイルが(再)選択されてPS文書の内容が変わった場合、`fontCandidates`を再計算し、
  既存の全`.font-row`の`.font-name`セレクトのoption一覧も再生成する。直前の選択値が新しい
  候補一覧にも存在すればその選択を保持し、存在しなければ新しい一覧の先頭を選択状態にする。

## データフロー / `convertFile`の変更

- `#fileInput`の`change`イベントおよび`dropzone`の`drop`イベントで、選択された`.ps`ファイルに
  対して以下を並行して実行する:
  1. `updateFontCandidates(file)` — `file.text()`でテキストを読み込み、`fontCandidates`を
     再計算してUIを更新する(上記UI設計の内容)。
  2. `convertFile(file)` — 既存の変換処理(変更なし)。

- `updateFontCandidates(file)`:
  - `file.text().then((text) => { ... })`で正規表現抽出・標準14フォント除外・重複除去を行い
    `fontCandidates`を更新する。
  - `fontCandidates`が空なら`#fontCandidateMessage`を表示し`#addFontButton`を`disabled`に、
    1件以上なら非表示にし有効化する。
  - 既存の`.font-row`それぞれについて、`.font-name`(`<select>`)のoption一覧を新しい
    `fontCandidates`で再構築する。

- `convertFile(file)`:
  - 既存のロジックのまま。`.font-name`が`<input type="text">`から`<select>`に変わっても
    `.value`の取得方法は同じなので、`fontReads`の組み立てロジックは変更不要。
  - `postMessage`の`fonts: [{name, filename, data}]`構造、`worker.js`の処理は変更なし。

## エラーハンドリング

- `fontCandidates`が空の場合に既存の`.font-row`が残っていても、`.font-name`セレクトは
  optionが0件になり`.value`が空文字列になる。`convertFile`の既存フィルタ
  (`f.name && f.file`)によりその行は自動的に変換対象から除外される(エラー表示はしない)。
- `file.text()`の読み込み失敗・正規表現マッチ0件は、いずれも「検出されたカスタムフォントは
  ありません」表示 + `#addFontButton`無効化という同じパスで扱う。

## テスト計画

- `site/test-custom-font.ps`(`/CustomFont findfont`を参照)を選択 → `fontCandidates`が
  `['CustomFont']`になり、`#fontCandidateMessage`が非表示、`#addFontButton`が有効化される
  ことを確認する。
- 「フォントを追加」→ 追加された行の`.font-name`セレクトに`CustomFont`が選択肢として表示
  されることを確認する。
- `.font-file`に`site/test-custom-font.ttf`を指定し、再度`site/test-custom-font.ps`を選択
  して変換 → 成功し`%PDF`が生成されることを確認する(既存の`worker.js`処理は変更なしのため、
  これは主にUI結線の確認)。
- `site/test.ps`(`/Helvetica findfont`のみを参照、標準14フォントのみ)を選択 →
  `fontCandidates`が空になり、`#fontCandidateMessage`が表示され`#addFontButton`が無効化される
  ことを確認する。

## スコープ外

- PS実行時に動的に構成されるフォント名(変数・連結等で生成される名前)の検出。
- 自由入力によるフォント名指定。本機能により`.font-name`はドロップダウン専用となり、既存の
  自由テキスト入力は廃止される(仕様変更点)。
- 複数PSファイルの一括処理・抽出結果のキャッシュ。

## 成功基準

- `.ps`ファイルを選択すると、そのファイル内で参照されている標準14フォント以外のフォント名が
  「フォントを追加」で追加する行のドロップダウンに候補として表示される。
- カスタムフォント参照がない`.ps`ファイルを選択した場合、「検出されたカスタムフォントはあり
  ません」と表示され、「フォントを追加」ボタンが無効化される。
- カスタムフォント名をドロップダウンから選択し、対応するフォントファイルを指定して変換すると、
  既存のカスタムフォントアップロード機能と同様に変換が成功する。
