# PS→PDF変換サイト カスタムフォント変更時の自動再変換 設計

## 背景・目的

[カスタムフォント名候補表示機能](./2026-06-14-ps2pdf-font-name-suggestion-design.md)により、`.ps`ファイル内で
参照されているフォント名を`.font-name`セレクトから選択できるようになった。

しかし、`.font-row`の操作(フォント名選択・フォントファイル選択・行追加・行削除)は`#fontList`の
UIのみを更新し、PDFの再変換は行われない。ユーザーがカスタムフォントを設定した結果をプレビューで
確認するには、`.ps`ファイルを再選択/再ドロップする必要があり、わかりにくい。

本機能では、`.ps`ファイルが読み込まれた後にフォント行が変更されたら、自動的に`convertFile`を
再実行してプレビューを更新する。

## 状態管理

`let currentFile = null;`を追加する。`fileInput`の`change`ハンドラと`dropzone`の`drop`ハンドラで、
`currentFileName`と並行して`currentFile = file;`を設定する。

## `reconvertIfReady()`

```javascript
function reconvertIfReady() {
  if (currentFile && !fileInput.disabled) {
    convertFile(currentFile);
  }
}
```

- `currentFile`が未設定(`.ps`未選択)、または変換中(`fileInput.disabled === true`)の場合は
  何もしない。
- `updateFontCandidates`は呼ばない — `.ps`の内容自体は変わっていないため。

## トリガー

- `fontList`に`change`イベントデレゲーションを追加する: `.font-name`(select)または
  `.font-file`(input)の値が変わったら`reconvertIfReady()`を呼ぶ。
- `addFontButton`のクリックハンドラの最後で`reconvertIfReady()`を呼ぶ。
- 各行の「削除」ボタンの`click`ハンドラ(`row.remove()`の後)で`reconvertIfReady()`を呼ぶ。

`fontList`への`change`イベントデレゲーションにより、`addFontButton`のクリックハンドラで
動的に追加される`.font-name`/`.font-file`要素にも個別のイベントリスナー登録は不要になる。

## エラーハンドリング

- 既存の`convertFile`/`worker.onmessage`のエラー経路をそのまま再利用する。再変換時に空の
  `.font-name`(候補なし)の行は既存の`fontReads`フィルタ(`f.name && f.file`)で除外される
  (変更なし)。
- 連続した変更操作(例: 行追加直後にファイル選択)で複数回`reconvertIfReady()`が呼ばれる場合、
  2回目以降は`fileInput.disabled === true`のため無視される。ユーザーが必要なら手動で再度操作
  すれば最終状態で再変換される(YAGNI、デバウンス等は導入しない)。

## テスト計画

- `test-custom-font.ps`を選択 → 変換成功(既存動作)。
- 「フォントを追加」→ 空行追加 → `reconvertIfReady`が呼ばれるが`currentFile`セット済み・
  `fileInput`有効なので再変換が走る(結果は変わらないが正常終了することを確認)。
- `.font-file`に`test-custom-font.ttf`を指定 → `change`イベントで自動再変換 → プレビューが
  更新される(`%PDF`生成、フォント適用)。
- 行の「削除」ボタンをクリック → 自動再変換が走り、フォント未指定状態の結果に戻る。

## スコープ外

- 連続変更操作のデバウンス・キューイング(変換中のトリガーは単純に無視する)。
- `.ps`ファイル自体の再選択を促すUI上の案内。

## 成功基準

- `.ps`ファイル読み込み後にカスタムフォント行を追加・編集・削除すると、`.ps`ファイルを
  再選択しなくてもプレビューが自動的に更新される。
