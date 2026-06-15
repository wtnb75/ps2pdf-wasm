# ps2pdfカスタムフォントUI改善(自動検出行・再描画ボタン) 設計

## 背景・目的

現在の`site/index.html`では、`.ps`ファイルアップロード時に標準14フォント以外のフォント名が
検出されるが、ユーザーが「フォントを追加」ボタンを押すたびに、検出されたフォント名から選ぶ
`<select>`付きの行を手動で追加する必要がある。また、フォント行(フォント名選択・フォント
ファイルアップロード)を変更するたびに自動で再変換が走る。

本作業では、検出された各カスタムフォント名についてフォント追加行を自動表示し、フォント
アップロードでは自動再変換せず、「再描画」ボタンを押したときにのみフォント設定を反映した
再変換を行うようにUIを改善する。

## 1. フォント行の自動表示

`.ps`ファイルを選択/ドロップした際、既存の`extractFontNames(text)`(標準14フォント
(`STANDARD_14_FONTS`)・重複を除外し、出現順)で検出した各フォント名について、
`#fontList`内に1行ずつ自動で行を生成する。

各行のHTML構造:

```html
<div class="font-row">
  <span class="font-name">FontName</span>
  <input type="file" class="font-file" accept=".ttf,.otf">
  <button type="button" class="clear-font">クリア</button>
</div>
```

- `font-name`は固定ラベル(`<span>`)。フォント名はテキストとして表示し、
  `convertFile()`で`fonts`配列を構築する際に`textContent`から読み取る。
- 検出フォントが0件の場合: `#fontCandidateMessage`(「検出されたカスタムフォントは
  ありません」)を表示し、`#fontList`は空、`#reconvertButton`は非表示。
- 検出フォントが1件以上の場合: `#fontCandidateMessage`を非表示にし、`#fontList`に
  検出順で行を生成する。

新しい`.ps`ファイルを選択/ドロップした場合、既存の`#fontList`の内容(行)はすべて
クリアしてから、新しい検出結果に基づいて再生成する。

### 削除する要素・関数

- `#addFontButton`(「フォントを追加」ボタン)要素とそのクリックイベントリスナー。
- `populateFontNameSelect(select)`関数(`<select>`方式の廃止に伴い不要)。
- `fontCandidates`配列はフォント行生成のために一時的に使うのみで、保持し続ける必要は
  ない(`updateFontCandidates`相当の処理内でローカルに使う)。

## 2. 「クリア」ボタン

各フォント行の「クリア」ボタンを押すと、その行の`.font-file`(`<input type="file">`)の
選択状態をリセットする(`input.value = ''`)。フォント名ラベル(行自体)は削除せず残す。

クリア操作では自動再変換は行わない。変換結果に反映するには、ユーザーが「再描画」ボタンを
押す必要がある。

## 3. 「再描画」ボタン

`#fontSection`内に`<button type="button" id="reconvertButton">再描画</button>`を追加する。

- **表示条件**: `#fontList`にフォント行が1つ以上あるときのみ表示(`display: inline` /
  `none`)。検出フォントが0件のとき(`#fontCandidateMessage`表示中)は非表示。
- **disabled条件**: 変換中(`fileInput.disabled === true`)の間は`disabled`にする。
  `worker.onmessage`で`fileInput.disabled = false`にする箇所(`result`/`error`/`ready`の
  各ハンドラ)で、フォント行が1つ以上あれば`reconvertButton.disabled = false`にする。
  変換開始時(`convertFile()`内、`fileInput.disabled = true`と同じタイミング)で
  `reconvertButton.disabled = true`にする。
- **クリック時の動作**: `currentFile`が設定されていれば`convertFile(currentFile)`を呼び、
  現在の各フォント行の`.font-file`の内容を使って再変換する。
- **初期状態**: フォント行を生成するタイミング(`.ps`選択直後)で`#reconvertButton`の
  `disabled`を現在の`fileInput.disabled`の値に合わせて設定する(その直後に
  `convertFile(file)`が呼ばれて`fileInput.disabled = true`になるため、結果的に
  `disabled`になる)。

## 4. 自動再変換の廃止

- `.ps`ファイル選択/ドロップ直後の初回変換は現状通り自動実行する(フォント未設定
  (`fonts: []`)で`convertFile(file)`を呼ぶ)。
- フォント行のファイル変更(`.font-file`の`change`イベント)およびクリアボタンでは、
  自動再変換を行わない。
- 既存の`reconvertIfReady()`関数と、`fontList`に対する`change`イベントリスナー
  (`fontList.addEventListener('change', ...)`)は削除する。再変換は「再描画」ボタンの
  クリックハンドラからのみ`convertFile(currentFile)`を呼ぶ形にする。

## 5. `worker.js`への変更

変更不要。`convertFile()`が`worker`に送る`fonts`配列の構造
(`{ name, filename, data }`の配列)は変わらないため、`site/worker.js`の
`onmessage`ハンドラ(Fontmap生成・`-I/fonts`処理)はそのまま動作する。

## `convertFile()`内のフォント情報収集の変更

現在:

```javascript
const fontReads = Array.from(fontList.querySelectorAll('.font-row'))
  .map((row) => ({
    name: row.querySelector('.font-name').value.trim(),
    file: row.querySelector('.font-file').files[0],
  }))
  .filter((f) => f.name && f.file)
  .map((f) => f.file.arrayBuffer().then((data) => ({ name: f.name, filename: f.file.name, data })));
```

変更後(`.font-name`が`<select>`の`value`ではなく`<span>`の`textContent`になる):

```javascript
const fontReads = Array.from(fontList.querySelectorAll('.font-row'))
  .map((row) => ({
    name: row.querySelector('.font-name').textContent.trim(),
    file: row.querySelector('.font-file').files[0],
  }))
  .filter((f) => f.name && f.file)
  .map((f) => f.file.arrayBuffer().then((data) => ({ name: f.name, filename: f.file.name, data })));
```

`.filter((f) => f.name && f.file)`により、ファイル未選択(またはクリア済み)の行は
`fonts`配列に含まれず、デフォルトフォントへフォールバックする(クリアボタンの
「アップロード取り消し」要件を満たす)。

## テスト計画

- `testdata/test-custom-font.ps`を選択し、`#fontList`に検出フォント名(`span.font-name`)
  と空のファイル入力・クリアボタンを持つ行が自動生成されることを確認する。
- 検出フォントが0件の`.ps`(例: `testdata/test.ps`)を選択し、`#fontCandidateMessage`が
  表示され、`#fontList`が空、`#reconvertButton`が非表示になることを確認する。
- フォント行にフォントファイルをアップロードしても、即時には再変換(`worker`への
  `postMessage`)が発生しないことを確認する。
- 「再描画」ボタンをクリックすると、アップロードしたフォントファイルを含む`fonts`配列で
  再変換が実行され、プレビューが更新されることを確認する。
- 「クリア」ボタンをクリックするとファイル入力がリセットされ、その後「再描画」を押すと
  そのフォントは`fonts`配列に含まれず、デフォルトフォントへフォールバックすることを
  確認する。
- 変換中は「再描画」ボタンが`disabled`になることを確認する。
- 新しい`.ps`ファイルを選択すると、`#fontList`の既存行がクリアされ、新しい検出結果に
  基づいて再生成されることを確認する。
- `task lint`がエラーなく完了することを確認する。

## スコープ外

- フォント名の手動追加・編集UI(「フォントを追加」ボタン・`<select>`方式)の復活。
- `site/worker.js`・`build.sh`・`Taskfile.yml`等、UI以外の変更。
- 複数`.ps`ファイルの同時処理。

## 成功基準

- `.ps`アップロード時、検出された各カスタムフォントについて行が自動表示され、
  フォントファイルをアップロードできる。
- フォントアップロード単体では再変換が走らず、「再描画」ボタンを押すと反映される。
- 「クリア」ボタンでアップロードを取り消し、再描画でデフォルトフォントへフォールバック
  できる。
- `task lint`がエラーなく完了する。
