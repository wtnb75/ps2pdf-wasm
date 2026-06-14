# リポジトリ整理・公開準備(PoC削除・テストデータ整理・Taskfile拡張・GitHub Pagesデプロイ) 設計

## 背景・目的

`site/`がPostScript→PDF変換サイトとして完成し、初期のPoCディレクトリ(`poc/`, `poc-browser/`)は
役割を終えている。また、リポジトリのルートにはダウンロード用タスク定義・初期構想メモ・
ビルド用に取得したGhostscriptソースアーカイブ等の未追跡ファイルが残っている。

本作業では、リポジトリの内容を「ビルドスクリプトと最小限の`.html`/`.js`」に整理し、さらに
GitHub Actionsで`site/`をGitHub Pagesに公開できるようにする。リポジトリ整理自体が公開準備の
一環であるため、Taskfile.ymlへのlint/buildタスク追加とGitHub Actionsデプロイも同じ作業として
扱う。

## 1. `poc/` と `poc-browser/` の削除

両ディレクトリは初期のPoCで、機能はすべて`site/`に統合済み。以下を削除する:

- `poc/build.sh`
- `poc/run.js`
- `poc/test.ps`
- `poc/out.pdf`
- `poc-browser/build.sh`
- `poc-browser/index.html`
- `poc-browser/test.ps`

確認済み: `site/test.ps`、`poc/test.ps`、`poc-browser/test.ps`は内容が同一(`diff`で差分なし)。
`poc/run.js`・`poc-browser/index.html`内の`test.ps`参照は、いずれも削除対象ディレクトリ内に
自己完結しており、他から参照されていない。git履歴には残るため、必要なら復元可能。

## 2. `site/testdata/` サブディレクトリの新設

以下のテスト用フィクスチャを`site/`から`site/testdata/`へ`git mv`で移動する:

- `site/test.ps` → `site/testdata/test.ps`
- `site/test-custom-font.ps` → `site/testdata/test-custom-font.ps`
- `site/test-custom-font.ttf` → `site/testdata/test-custom-font.ttf`
- `site/test-custom-font-LICENSE.txt` → `site/testdata/test-custom-font-LICENSE.txt`
- `site/test-invalid.ps` → `site/testdata/test-invalid.ps`

`site/index.html`・`site/worker.js`・`site/build.sh`はいずれもこれらのファイルパスを
ハードコードで参照していない(`index.html`は`<input type="file">`でユーザーが選択する構成)。
よって移動に伴う実装変更は不要。

移動後、`site/`のルートには`build.sh`・`index.html`・`worker.js`(+ビルド生成物
`gs.js`/`gs.wasm`/`gs.data`、`.gitignore`済み)のみが残る。

## 3. ルートの未追跡ファイル整理

- `.gitignore`に以下を追加する:
  - `/ghostscript-10.07.1.tar.gz`
  - `/ghostpdl-10.07.1.tar.gz`
  - `/ghostscript-10.07.1/`
  - `.DS_Store`
- `.gitignore`から以下のエントリを削除する(対象ディレクトリ自体を削除するため不要になる):
  - `/poc/gs`
  - `/poc/gs.wasm`
  - `/poc/out.pdf`
  - `/poc-browser/gs.js`
  - `/poc-browser/gs.wasm`
  - `/poc-browser/gs.data`
- `Taskfile.yml`をgitに追跡する(`git add`)。Ghostscriptソースのdownload/解凍タスクとして、
  ビルド手順の一部として有用。
- `TODO.md`を削除する。初期構想メモであり、内容は`site/`として実現済み・各design docsに
  記録済み。

## 4. Taskfile.yml: `lint`/`build`タスクの追加

### `build`タスク

`download`に依存し、`bash site/build.sh`を実行して`site/gs.js`/`gs.wasm`/`gs.data`を生成する。
emscripten(`emconfigure`/`emmake`/`emcc`)が利用可能であることが前提(`build.sh`の既存前提を
変更しない)。

```yaml
  build:
    desc: build ghostscript wasm for site/
    deps: [download]
    cmds:
      - bash site/build.sh
```

### `lint`タスク

ESLint(flat config)で`site/index.html`(インラインscript)と`site/worker.js`をlintする。

- リポジトリルートに以下を新設する:
  - `package.json`(devDependencies: `eslint`, `eslint-plugin-html`, `lint`スクリプト)
  - `pnpm-lock.yaml`
  - `eslint.config.js`(flat config。`eslint-plugin-html`で`site/index.html`内の
    `<script>`を抽出してlint対象にし、`site/worker.js`も対象に含める。ベースルールは
    `@eslint/js`のrecommended)
- `package.json`の`scripts.lint`は`eslint .`とする。
- Taskfileの`lint`タスクは`pnpm install --frozen-lockfile && pnpm run lint`を実行する。

```yaml
  lint:
    desc: lint site/ JS (including inline scripts)
    cmds:
      - pnpm install --frozen-lockfile
      - pnpm run lint
```

導入直後にlintエラーが出る場合は、既存コード(`site/index.html`/`site/worker.js`)に対する
最小限の修正(未使用変数の削除、ルール違反の修正など)で対応する。大規模なリファクタは
行わない。

## 5. GitHub Actionsによるgh-pagesデプロイ

`.github/workflows/deploy.yml`を新設する。

- **トリガー**: `push`(`branches: [main]`)と`workflow_dispatch`。
- **permissions**: `contents: read`, `pages: write`, `id-token: write`。
- **concurrency**: `group: pages`, `cancel-in-progress: false`(同時デプロイの競合を避ける)。

### jobs

1. **`lint`**: pnpmをセットアップ(`pnpm/action-setup` + `actions/setup-node`)し、
   `task lint`相当(`pnpm install --frozen-lockfile && pnpm run lint`)を実行する。
2. **`build`**(`needs: lint`):
   - `actions/cache`で`site/gs.js`/`site/gs.wasm`/`site/gs.data`をキャッシュする。
     キャッシュキーは`Taskfile.yml`と`build.sh`の内容ハッシュ(`hashFiles`)を使う。
     これらが変更されない限り、ビルド成果物はキャッシュから復元され、ビルド自体は
     スキップされる。
   - キャッシュミス時:
     - `mymindstorm/setup-emsdk`でemscripten環境をセットアップする。
     - `task download`(Ghostscriptソースのダウンロード・展開)。
     - `task build`(`build.sh`実行、`gs.js`/`gs.wasm`/`gs.data`を`site/`に生成)。
   - `actions/upload-pages-artifact`で`site/`ディレクトリ全体をPages用アーティファクト
     としてアップロードする(6.の変更後、`site/`は公開対象ファイルのみになる)。
3. **`deploy`**(`needs: build`):
   - `actions/deploy-pages`でGitHub Pagesにデプロイする。

### リポジトリ設定(設計の範囲外・手動作業)

このワークフローが機能するには、リポジトリのSettings > Pages > Sourceを
「GitHub Actions」に設定する必要がある。本design/plan/実装では`.github/workflows/`内の
ワークフローファイルの作成のみを行い、リポジトリ設定の変更は対象外とする。

## 6. `site/`をPages公開対象のみに整理(追記)

2.で導入した`site/testdata/`と、`site/build.sh`はビルドスクリプト・テストフィクスチャ
であり、GitHub Pagesに公開する対象ではない。`site/`ディレクトリ自体をPagesアーティファクト
としてアップロードするため(5.)、`site/`配下には公開してよいファイルのみを置く。

- `site/build.sh` → リポジトリルートの`build.sh`へ移動する。
- `site/testdata/` → リポジトリルートの`testdata/`へ移動する。
- `build.sh`内のパス計算を、リポジトリルートに配置されたことに合わせて変更する:

  変更前(`site/build.sh`としての相対計算):
  ```bash
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  GS_SRC="$ROOT/ghostscript-10.07.1"
  SITE="$ROOT/site"
  ```

  変更後(`build.sh`としての相対計算。`ROOT`はスクリプト自身のディレクトリ):
  ```bash
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  GS_SRC="$ROOT/ghostscript-10.07.1"
  SITE="$ROOT/site"
  ```

- `Taskfile.yml`の`build`タスクの`cmds`を`bash site/build.sh`から`bash build.sh`に変更する。
- `.github/workflows/deploy.yml`のキャッシュキーを`hashFiles('Taskfile.yml', 'site/build.sh')`
  から`hashFiles('Taskfile.yml', 'build.sh')`に変更する。

移動後、`site/`配下は`index.html`・`worker.js`(+ビルド生成物`gs.js`/`gs.wasm`/`gs.data`、
`.gitignore`済み)のみになり、`actions/upload-pages-artifact`で`site/`をそのまま
アップロードしても、ビルドスクリプトやテストフィクスチャが公開されない。

`eslint.config.js`の対象パス(`site/index.html`・`site/worker.js`・ignoreの`site/gs.js`)は
変更不要(いずれも`site/`直下のまま)。

## テスト計画

- `git mv`でフィクスチャを移動後、`git ls-files site/`で`site/`配下のファイル一覧が
  `build.sh`・`index.html`・`worker.js`・`testdata/`(5ファイル)のみであることを確認する。
- `node --check`で`site/index.html`内`<script>`の構文確認(フィクスチャパス参照がないため
  変更なしのはず)。
- `git status`で、`.gitignore`更新後にghostscriptソースアーカイブ・展開ディレクトリ・
  `.DS_Store`が未追跡から除外されることを確認する。
- `git ls-files`でリポジトリ全体の最終構成を確認する(`poc/`・`poc-browser/`・`TODO.md`が
  含まれず、`Taskfile.yml`・`package.json`・`pnpm-lock.yaml`・`eslint.config.js`・
  `.github/workflows/deploy.yml`が含まれること)。
- `task lint`をローカルで実行し、エラーなく完了することを確認する。
- emscripten環境がある場合は`task build`を実行し、`site/gs.js`/`gs.wasm`/`gs.data`が
  生成されることを確認する(環境がない場合はスキップ可)。
- `.github/workflows/deploy.yml`のYAML構文を(可能であれば`actionlint`または
  `yamllint`/`python3 -c "import yaml; yaml.safe_load(...)"`等で)確認する。実際のCI実行
  結果はpush後にGitHub Actions上で確認する(ローカルでは検証不可)。
- 6.の変更後、`git ls-files site/`が`index.html`・`worker.js`(+生成物のみ)になっている
  ことを確認し、`git ls-files`で`build.sh`・`testdata/`がリポジトリルート直下にあることを
  確認する。`task lint`・`node --check`の再確認も行う。

## スコープ外

- `docs/superpowers/`配下の既存design docs/plansに記載された`site/test-custom-font.ps`等の
  パス記述の更新(履歴文書として、当時のパスのまま残す)。
- `build.sh`の挙動変更(testdataディレクトリへの移動はビルドに影響しない)。
- `site/index.html`/`site/worker.js`の大規模なリファクタ(lint導入に伴う最小限の修正のみ)。
- emsdkのバージョン固定などの詳細管理(`setup-emsdk`のデフォルト挙動に従う)。
- リポジトリSettings > PagesのSource設定(手動作業、本design/plan/実装の対象外)。

## 成功基準

- `poc/`・`poc-browser/`・`TODO.md`がリポジトリから削除されている。
- `site/`のテスト用フィクスチャ・`build.sh`がリポジトリルートの`testdata/`・`build.sh`に
  移動され、`site/`配下は`index.html`・`worker.js`(+ビルド生成物)のみになっている。
- `Taskfile.yml`がgitで追跡されている。
- `.gitignore`がghostscriptソースアーカイブ・展開ディレクトリ・`.DS_Store`を除外し、
  削除済みディレクトリ向けの不要なエントリを含まない。
- `task lint`がローカルで実行可能でエラーなく完了する。
- `task build`が`download`→`build.sh`を実行する。
- main pushまたは手動実行で、GitHub Actionsがlint→build(キャッシュ利用)→deployを実行し、
  (Pages Source設定後に)GitHub Pagesにサイトが公開される(`site/`にはPages公開対象の
  ファイルのみが含まれる)。
