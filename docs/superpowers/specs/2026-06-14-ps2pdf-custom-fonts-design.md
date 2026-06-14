# PostScript → PDF 変換サイト カスタムフォント対応 設計

## 背景・目的

`site/`の現在の実装では、PostScriptファイル内で標準14フォント以外の独自フォント名
(例: `/MyCustomFont`)が参照されている場合、Ghostscriptは`Resource/Font/`にある
代替フォント(URW系フォント)に置き換えてPDFを生成する。これは見た目が元のPostScript
と異なる結果になり、再現性の問題となる。

本機能では、ユーザーが該当するフォントファイル(`.ttf`/`.otf`)を手元から追加で
アップロードし、PostScript内のフォント名と紐付けることで、より正確なPDFを
生成できるようにする。

## シナリオ

PSファイル内で標準14フォント以外のカスタムフォント名(例: `/MyCustomFont`)が
参照されているが、そのフォント自体は埋め込まれておらず、ユーザーが手元に該当する
フォントファイルを持っている場合、そのフォント名を指定してフォントファイルを
追加アップロードすることで、より正確なPDFが得られる。

## UI設計

`site/index.html`の`dropzone`の下に、「カスタムフォント追加(任意)」セクションを
追加する。

- 「フォントを追加」ボタンで行を追加する。各行は以下を含む:
  - フォント名(テキスト入力、例: `MyCustomFont`)
  - フォントファイル選択(`<input type="file" accept=".ttf,.otf">`)
  - 削除ボタン(その行を削除)
- 行は0個でも複数でもよい。
- PSファイルを選択/ドロップして変換を開始する時点で、登録されている全フォント行の
  情報(フォント名とファイルのArrayBuffer)を`convert`メッセージに含めて送信する。
- フォント名・ファイルのいずれかが未入力の行は、送信時に無視する(検証エラーは
  表示しない)。

サポートするフォント形式は`.ttf`/`.otf`(TrueType/OpenType)のみとする。
Type1(`.pfb`/`.pfa`)は対象外。

複数フォントに対応する(PSファイルが複数の独自フォントを使うケースは実用上多い)。

## データフロー / postMessageプロトコル変更

`convert`メッセージに`fonts`フィールドを追加する:

```javascript
{
  type: 'convert',
  name: file.name,
  data: <ArrayBuffer>,         // PSファイル本体
  fonts: [
    { name: 'MyCustomFont', filename: 'myfont.ttf', data: <ArrayBuffer> },
    // ...
  ]
}
```

- `name`: ユーザーが入力したPostScriptフォント名(Fontmapのキーになる)
- `filename`: アップロードされたファイル名(拡張子判定・MEMFS上のファイル名に使用)
- `data`: フォントファイルのバイト列(Transferableで転送)

`postMessage`の第2引数(transfer list)には、PSファイルの`data`本体と各フォント
エントリの`data`をすべて列挙する。

`ready`/`result`/`error`メッセージの形式は変更しない。フォント関連のエラーも
既存の`error`メッセージで通知する。

## worker.js の処理変更

`convert`受信時、PSファイル書き込みの前後で以下を行う:

1. 前回実行分のクリーンアップに`/fonts`ディレクトリ内のファイル削除を追加する
   (PSファイル/出力PDFのクリーンアップと同様、毎回書き込み前に削除する)。
2. `/fonts`ディレクトリを作成する(初回のみ作成。`Module.FS.mkdir`が既存ディレクトリ
   に対して例外を出す場合は`try/catch`で無視する)。
3. `e.data.fonts`の各エントリについて、
   `Module.FS.writeFile('/fonts/' + filename, new Uint8Array(data))`で
   フォントファイルを書き込む。
4. 各エントリから`Fontmap.user`の内容を組み立てる。1エントリにつき1行、
   以下の形式:
   ```
   /MyCustomFont (/fonts/myfont.ttf) ;
   ```
   全エントリを連結し、`Module.FS.writeFile('/fonts/Fontmap.user', ...)`で
   書き込む。
5. `fonts`が1件以上ある場合のみ、`callMain`の引数に`-sFONTPATH=/fonts`と
   `-sFONTMAP=`オプションを追加する。`-sFONTMAP=`がデフォルトのFontmapに対する
   追加読み込みとして機能するか(`-sFONTMAP=/fonts/Fontmap.user`のみで動作するか)、
   あるいはデフォルトと連結する必要があるか(例:
   `-sFONTMAP=Fontmap.GS:/fonts/Fontmap.user`)は、実装時にブラウザビルドで動作確認
   して確定する。
6. 既存の引数(`-sDEVICE=pdfwrite`, `-dNOPAUSE`, `-dBATCH`, `-I/lib -I/Resource/Init`,
   `-sOutputFile=/out.pdf`, `/input.ps`)は変更しない。

`%PDF`ヘッダチェック、エラー処理(`postMessage({type:'error',...})`)は既存のまま
再利用する。フォント書き込みやFontmap処理が失敗した場合も、既存の`try/catch`で
捕捉される。

## エラーハンドリング

- フォントファイルの書き込み失敗、`-sFONTMAP=`指定が原因で`gs`がエラー終了する
  場合も、既存の`try/catch`→`postMessage({type:'error', message: ...})`の経路で
  そのまま捕捉・表示する。専用のエラーメッセージは追加しない。
- フォント名・ファイルが未指定の行はUI側で送信前に無視するため、worker側で
  空エントリを想定する必要はない。
- 対応外の拡張子(`.ttf`/`.otf`以外)が選択された場合も、特別な検証はせずそのまま
  Ghostscriptに渡す。結果が`%PDF`にならなければ既存のエラー経路で表示する
  (YAGNI — 事前のフォーマット検証は行わない)。

## テスト計画

- カスタムフォント名(`/CustomFont`など、`Resource/Font`に該当する代替が無い名前)
  を参照するテスト用PSファイル(`site/test-custom-font.ps`)を新規作成する。
- 対応するテスト用フォントファイル(`site/test-custom-font.ttf`、オープンライセンス
  のフォントを使用)を用意する。
- フォント未指定で`test-custom-font.ps`を変換し、代替フォントで変換が成功する
  (`%PDF`が生成される)ことを確認する(エラーにはならない想定)。
- フォント指定込みで`test-custom-font.ps` + `test-custom-font.ttf`(フォント名
  `CustomFont`)を変換し、変換が成功することを確認する。生成PDFのフォント情報に
  指定フォントが反映されていることを、可能であれば`pdffonts`等で確認し、難しければ
  目視/プレビューで確認する。

## スコープ外

- フォントファイルの事前検証(形式チェック、サイズ制限)
- フォント名のPS内自動検出・サジェスト
- Type1(`.pfb`/`.pfa`)フォント対応

## 成功基準

- `site/index.html`にカスタムフォント追加UI(フォント名+ファイル選択の行を
  追加/削除できる)が追加されている。
- フォント未指定の場合、既存の変換動作(代替フォントでの変換)に変化がない。
- カスタムフォント名とフォントファイルを指定して変換した場合、変換が成功し
  `%PDF`で始まるPDFが生成される。
- 不正なフォントファイル・対応外形式が指定された場合も、既存のエラー表示
  (`エラー: ...`)でUIが操作可能な状態に戻る。
