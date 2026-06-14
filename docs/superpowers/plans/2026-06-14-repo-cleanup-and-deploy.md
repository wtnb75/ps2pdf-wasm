# リポジトリ整理・公開準備 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リポジトリを「ビルドスクリプトと最小限の`.html`/`.js`」に整理し、Taskfile.ymlにlint/buildタスクを追加し、GitHub ActionsでGitHub Pagesに`site/`を自動デプロイできるようにする。

**Architecture:** (1) 役割を終えた`poc/`・`poc-browser/`を削除し`.gitignore`を整理、(2) `site/`のテスト用フィクスチャを`site/testdata/`へ移動、(3) ルートの未追跡ファイル(`.gitignore`追加・`Taskfile.yml`追跡・`TODO.md`削除)、(4) `Taskfile.yml`に`build`(download→site/build.sh)と`lint`(pnpm+ESLint、`eslint-plugin-html`でindex.htmlのインラインscriptも対象)タスクを追加し、それに必要な`package.json`/`pnpm-lock.yaml`/`eslint.config.js`を新設、(5) `.github/workflows/deploy.yml`でlint→build(キャッシュ付き)→`actions/deploy-pages`デプロイを実行する。

**Tech Stack:** 静的HTML/JS(`site/`)、Bash(`site/build.sh`)、[Task](https://taskfile.dev)(`Taskfile.yml`)、pnpm/ESLint(`eslint-plugin-html`, `globals`)、GitHub Actions。設計は`docs/superpowers/specs/2026-06-14-repo-cleanup-and-deploy-design.md`を参照。

---

### Task 1: `poc/`・`poc-browser/`の削除と`.gitignore`整理

**Files:**
- Delete: `poc/build.sh`, `poc/run.js`, `poc/test.ps`, `poc/out.pdf`
- Delete: `poc-browser/build.sh`, `poc-browser/index.html`, `poc-browser/test.ps`
- Modify: `.gitignore`

- [ ] **Step 1: `poc/`と`poc-browser/`をgitから削除する**

```bash
git rm -r poc poc-browser
```

Expected: `rm 'poc/build.sh'` 等、7ファイルの削除がステージされる。

- [ ] **Step 2: `.gitignore`から不要になったエントリを削除する**

`.gitignore`は現在以下の内容:

```
/poc/gs
/poc/gs.wasm
/poc/out.pdf
/poc-browser/gs.js
/poc-browser/gs.wasm
/poc-browser/gs.data
/site/gs.js
/site/gs.wasm
/site/gs.data
```

これを次のように変更する(`/poc/...`と`/poc-browser/...`の6行を削除):

```
/site/gs.js
/site/gs.wasm
/site/gs.data
```

- [ ] **Step 3: 確認する**

```bash
git status --porcelain
```

Expected: `poc/`・`poc-browser/`配下のファイルが`D`(deleted)、`.gitignore`が`M`(modified)として表示される。

- [ ] **Step 4: コミットする**

```bash
git add .gitignore
git commit -m "Remove poc/ and poc-browser/ (superseded by site/)"
```

---

### Task 2: `site/`のテスト用フィクスチャを`site/testdata/`へ移動

**Files:**
- Move: `site/test.ps` → `site/testdata/test.ps`
- Move: `site/test-custom-font.ps` → `site/testdata/test-custom-font.ps`
- Move: `site/test-custom-font.ttf` → `site/testdata/test-custom-font.ttf`
- Move: `site/test-custom-font-LICENSE.txt` → `site/testdata/test-custom-font-LICENSE.txt`
- Move: `site/test-invalid.ps` → `site/testdata/test-invalid.ps`

- [ ] **Step 1: `git mv`でフィクスチャを移動する**

```bash
mkdir -p site/testdata
git mv site/test.ps site/testdata/test.ps
git mv site/test-custom-font.ps site/testdata/test-custom-font.ps
git mv site/test-custom-font.ttf site/testdata/test-custom-font.ttf
git mv site/test-custom-font-LICENSE.txt site/testdata/test-custom-font-LICENSE.txt
git mv site/test-invalid.ps site/testdata/test-invalid.ps
```

- [ ] **Step 2: `site/`配下のファイル一覧を確認する**

```bash
git ls-files site/
```

Expected:
```
site/build.sh
site/index.html
site/testdata/test-custom-font-LICENSE.txt
site/testdata/test-custom-font.ps
site/testdata/test-custom-font.ttf
site/testdata/test-invalid.ps
site/testdata/test.ps
site/worker.js
```

- [ ] **Step 3: `site/index.html`内`<script>`の構文確認をする**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('site/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('/tmp/index-script-check.js', script);
"
node --check /tmp/index-script-check.js
```

Expected: no output(no error)。フィクスチャパスへの参照は元々存在しないため、移動による
コード変更は不要。

- [ ] **Step 4: コミットする**

```bash
git commit -m "Move site test fixtures into site/testdata/"
```

---

### Task 3: ルートの未追跡ファイル整理

**Files:**
- Modify: `.gitignore`
- Delete: `TODO.md`
- Track: `Taskfile.yml`

- [ ] **Step 1: `.gitignore`にghostscriptソースアーカイブ・展開ディレクトリ・`.DS_Store`を追加する**

Task 1完了後の`.gitignore`(以下の内容)に4行を追加する:

```
/site/gs.js
/site/gs.wasm
/site/gs.data
```

次のように変更する:

```
/site/gs.js
/site/gs.wasm
/site/gs.data
/ghostscript-10.07.1.tar.gz
/ghostpdl-10.07.1.tar.gz
/ghostscript-10.07.1/
.DS_Store
```

- [ ] **Step 2: `TODO.md`を削除する**

```bash
rm TODO.md
```

- [ ] **Step 3: `Taskfile.yml`をgitに追跡する**

```bash
git add Taskfile.yml
```

- [ ] **Step 4: 確認する**

```bash
git status --porcelain
git status --porcelain --ignored=matching | grep -E "ghostscript-10\.07\.1|\.DS_Store|ghostpdl"
```

Expected: 1つ目のコマンドで`.gitignore`(M)・`Taskfile.yml`(A、新規追跡)が表示され、
`TODO.md`は表示されない(削除済みかつ元々未追跡)。2つ目のコマンドで
`ghostscript-10.07.1.tar.gz`・`ghostpdl-10.07.1.tar.gz`・`ghostscript-10.07.1/`・
`.DS_Store`が`!!`(ignored)として表示される。

- [ ] **Step 5: コミットする**

```bash
git add .gitignore Taskfile.yml
git commit -m "Track Taskfile.yml, ignore ghostscript source archives and .DS_Store, remove TODO.md"
```

---

### Task 4: Taskfile.ymlに`build`タスクを追加

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: `build`タスクを追加する**

`Taskfile.yml`の`download`タスクの直後に、次のタスクを追加する:

```yaml
  build:
    desc: build ghostscript wasm and copy artifacts into site/
    deps: [download]
    cmds:
      - bash site/build.sh
```

`Taskfile.yml`全体は次のようになる:

```yaml
# yaml-language-server: $schema=https://taskfile.dev/schema.json

version: '3'

vars:
  VERSION: 10.07.1
  URL: "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10071/ghostscript-{{ .VERSION }}.tar.gz"

tasks:
  default:
    desc: show tasks
    cmds:
      - task -l --sort alphanumeric
    silent: true

  download:
    desc: download and extract
    vars:
      BNAME:
        sh: "basename {{ .URL }} .tar.gz"
    cmds:
      - "[ -f {{ .BNAME }}.tar.gz ] || curl -sLO {{ .URL }}"
      - "[ -d {{ .BNAME }} ] || tar xfz {{ .BNAME }}.tar.gz"

  build:
    desc: build ghostscript wasm and copy artifacts into site/
    deps: [download]
    cmds:
      - bash site/build.sh
```

- [ ] **Step 2: タスク一覧を確認する**

```bash
task -l --sort alphanumeric
```

Expected: `build`・`default`・`download`の3タスクが一覧表示される(`build`の説明が
`build ghostscript wasm and copy artifacts into site/`)。

- [ ] **Step 3: コミットする**

```bash
git add Taskfile.yml
git commit -m "Add Taskfile build task (download + site/build.sh)"
```

---

### Task 5: ESLint導入とTaskfile `lint`タスクの追加

**Files:**
- Create: `package.json`
- Create: `eslint.config.js`
- Create: `pnpm-lock.yaml` (generated)
- Modify: `Taskfile.yml`
- Modify: `.gitignore`
- Modify: `site/index.html` (rename `status` variable to avoid `no-redeclare`)
- Modify: `site/worker.js` (remove unused catch bindings)

- [ ] **Step 1: `package.json`を作成し、ESLint関連パッケージをインストールする**

```bash
pnpm init
pnpm add -D eslint @eslint/js eslint-plugin-html globals
```

`pnpm init`が生成した`package.json`を次の内容に置き換える(`pnpm add`実行後に
`devDependencies`がすでに追加されているので、それ以外のフィールドを編集する):

```json
{
  "name": "project-gs",
  "version": "1.0.0",
  "description": "PostScript to PDF conversion site (Ghostscript wasm)",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "eslint ."
  },
  "license": "ISC",
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.5.0",
    "eslint-plugin-html": "^8.1.4",
    "globals": "^17.6.0"
  }
}
```

(`devDependencies`のバージョン番号は`pnpm add`が`pnpm-lock.yaml`に解決した実際のバージョンに
合わせる。`^`付きの上記バージョンより新しい場合はそれに合わせて記載してよい。)

- [ ] **Step 2: `eslint.config.js`を作成する**

```javascript
import js from '@eslint/js';
import html from 'eslint-plugin-html';
import globals from 'globals';

export default [
  {
    ignores: ['ghostscript-10.07.1/**', 'site/gs.js'],
  },
  {
    files: ['site/index.html'],
    plugins: { html },
    rules: js.configs.recommended.rules,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.browser,
    },
  },
  {
    files: ['site/worker.js'],
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.worker,
        // Provided by gs.js (importScripts), the Emscripten module factory
        // built with -sEXPORT_NAME=createGSModule.
        createGSModule: 'readonly',
      },
    },
  },
];
```

- [ ] **Step 3: `.gitignore`に`/node_modules/`を追加する**

Task 3完了後の`.gitignore`の末尾に1行追加する:

```
/site/gs.js
/site/gs.wasm
/site/gs.data
/ghostscript-10.07.1.tar.gz
/ghostpdl-10.07.1.tar.gz
/ghostscript-10.07.1/
.DS_Store
/node_modules/
```

- [ ] **Step 4: `site/index.html`の`status`変数を`statusEl`にリネームする(`no-redeclare`対策)**

`status`はブラウザのグローバル変数(`window.status`)と衝突するため、ESLintの
`no-redeclare`がエラーになる。`site/index.html`の以下の行:

```javascript
    const status = document.getElementById('status');
```

を次のように変更する(`id="status"`属性自体は変更しない):

```javascript
    const statusEl = document.getElementById('status');
```

さらに、同ファイル内の以下4箇所の`status.textContent`を`statusEl.textContent`に変更する
(HTML要素の`id="status"`属性文字列は変更しない):

1. `worker.onmessage`の`'ready'`分岐:
```javascript
        statusEl.textContent = '準備完了。.ps ファイルを選択してください。';
```
2. `worker.onmessage`の`'result'`分岐内の同様の行
3. `worker.onmessage`の`'error'`分岐内の同様の行
4. `convertFile`関数内:
```javascript
      statusEl.textContent = `${file.name} を変換中...`;
```

- [ ] **Step 5: `site/worker.js`の未使用catch変数を削除する(`no-unused-vars`/`no-empty`対策)**

`site/worker.js`の`clearDir`関数内:

```javascript
  try {
    entries = Module.FS.readdir(path);
  } catch (err) {
    Module.FS.mkdir(path);
    return;
  }
```

を次のように変更する(`err`を使用していないため):

```javascript
  try {
    entries = Module.FS.readdir(path);
  } catch {
    Module.FS.mkdir(path);
    return;
  }
```

また、`self.onmessage`内の以下2行:

```javascript
    try { Module.FS.unlink('/input.ps'); } catch (e) {}
    try { Module.FS.unlink('/out.pdf'); } catch (e) {}
```

を次のように変更する(`e`を使用しておらず、外側の`async (e) =>`の`e`をシャドウしていたため):

```javascript
    try { Module.FS.unlink('/input.ps'); } catch {}
    try { Module.FS.unlink('/out.pdf'); } catch {}
```

- [ ] **Step 6: Taskfile.ymlに`lint`タスクを追加する**

Task 4完了後の`Taskfile.yml`の`build`タスクの直後に、次のタスクを追加する:

```yaml
  lint:
    desc: lint site/ JS (including inline <script> in index.html)
    cmds:
      - pnpm install --frozen-lockfile
      - pnpm run lint
```

- [ ] **Step 7: lintを実行して確認する**

```bash
task lint
```

Expected: `pnpm install --frozen-lockfile`が成功し、続く`pnpm run lint`(=`eslint .`)が
エラーなく終了する(exit code 0、出力なし)。

- [ ] **Step 8: `site/index.html`の構文確認をする**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('site/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('/tmp/index-script-check.js', script);
"
node --check /tmp/index-script-check.js
node --check site/worker.js
```

Expected: 両方とも no output(no error)。

- [ ] **Step 9: コミットする**

`pnpm-lock.yaml`は`pnpm install`で生成されたものをそのままコミットする。

```bash
git add package.json pnpm-lock.yaml eslint.config.js .gitignore Taskfile.yml site/index.html site/worker.js
git commit -m "Add ESLint setup and Taskfile lint task"
```

---

### Task 6: GitHub Actionsでのlint→build→GitHub Pagesデプロイ

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: ワークフローファイルを作成する**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint

  build:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        id: gs-wasm-cache
        with:
          path: |
            site/gs.js
            site/gs.wasm
            site/gs.data
          key: gs-wasm-${{ hashFiles('Taskfile.yml', 'site/build.sh') }}
      - uses: mymindstorm/setup-emsdk@v14
        if: steps.gs-wasm-cache.outputs.cache-hit != 'true'
      - uses: arduino/setup-task@v2
        if: steps.gs-wasm-cache.outputs.cache-hit != 'true'
      - name: Build ghostscript wasm
        if: steps.gs-wasm-cache.outputs.cache-hit != 'true'
        run: task build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

ファイルを`.github/workflows/deploy.yml`に保存する。

- [ ] **Step 2: YAML構文を確認する**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK
```

Expected: `OK`が出力される。

- [ ] **Step 3: コミットする**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions workflow to lint, build, and deploy site/ to GitHub Pages"
```

---

### Task 7: `build.sh`と`testdata/`を`site/`の外に移動(Pages公開対象の整理)

**Files:**
- Move: `site/build.sh` → `build.sh`
- Move: `site/testdata/` → `testdata/`
- Modify: `build.sh` (パス計算)
- Modify: `Taskfile.yml` (`build`タスク)
- Modify: `.github/workflows/deploy.yml` (キャッシュキー)

設計addendum(`docs/superpowers/specs/2026-06-14-repo-cleanup-and-deploy-design.md`の
「6. `site/`をPages公開対象のみに整理」)を参照。

- [ ] **Step 1: `git mv`で`build.sh`と`testdata/`をリポジトリルートへ移動する**

```bash
git mv site/build.sh build.sh
git mv site/testdata testdata
```

- [ ] **Step 2: `build.sh`のパス計算をルート配置に合わせて変更する**

`build.sh`の先頭付近の以下の行:

```bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GS_SRC="$ROOT/ghostscript-10.07.1"
SITE="$ROOT/site"
```

を次のように変更する(`build.sh`自身がリポジトリルートに置かれるため、`/..`を外す):

```bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GS_SRC="$ROOT/ghostscript-10.07.1"
SITE="$ROOT/site"
```

(`cd "$GS_SRC"`以降の処理、`cp`コマンド等は変更不要。`ROOT`・`GS_SRC`・`SITE`はいずれも
絶対パスのため、これらを使う後続行に変更は不要。)

- [ ] **Step 3: `Taskfile.yml`の`build`タスクを変更する**

現在の`Taskfile.yml`の`build`タスク:

```yaml
  build:
    desc: build ghostscript wasm and copy artifacts into site/
    deps: [download]
    cmds:
      - bash site/build.sh
```

を次のように変更する:

```yaml
  build:
    desc: build ghostscript wasm and copy artifacts into site/
    deps: [download]
    cmds:
      - bash build.sh
```

- [ ] **Step 4: `.github/workflows/deploy.yml`のキャッシュキーを変更する**

`build`ジョブの`actions/cache@v4`ステップの`key`:

```yaml
          key: gs-wasm-${{ hashFiles('Taskfile.yml', 'site/build.sh') }}
```

を次のように変更する:

```yaml
          key: gs-wasm-${{ hashFiles('Taskfile.yml', 'build.sh') }}
```

- [ ] **Step 5: `site/`配下のファイル一覧を確認する**

```bash
git ls-files site/
```

Expected:
```
site/index.html
site/worker.js
```

```bash
git ls-files | grep -E "^(build\.sh|testdata/)"
```

Expected:
```
build.sh
testdata/test-custom-font-LICENSE.txt
testdata/test-custom-font.ps
testdata/test-custom-font.ttf
testdata/test-invalid.ps
testdata/test.ps
```

- [ ] **Step 6: `build.sh`の構文確認、`task -l`・`task lint`・YAML構文確認をする**

```bash
bash -n build.sh
task -l --sort alphanumeric
task lint
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK
```

Expected: `bash -n build.sh`はno output(構文エラーなし)。`task -l`は`build`・`default`・
`download`・`lint`の4タスクを表示。`task lint`はexit code 0でエラーなし
(`eslint.config.js`の対象パス`site/index.html`・`site/worker.js`・ignoreの`site/gs.js`は
いずれも`site/`直下のままなので変更不要)。`python3`のYAML構文確認は`OK`を出力する。

- [ ] **Step 7: `site/index.html`内`<script>`と`site/worker.js`の構文確認をする**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('site/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('/tmp/index-script-check.js', script);
"
node --check /tmp/index-script-check.js
node --check site/worker.js
```

Expected: 両方とも no output(no error)。

- [ ] **Step 8: コミットする**

```bash
git add build.sh Taskfile.yml .github/workflows/deploy.yml
git commit -m "Move build.sh and testdata/ out of site/ so site/ is Pages-deployable as-is"
```

(`git mv`は`git add`相当の効果がすでにあるため、`build.sh`・`testdata/`の移動は
このコミットに含まれる。)

---

## Self-Review

- **Spec coverage**: design docの5項目すべてに対応するタスクがある — `poc/`/`poc-browser/`削除(Task 1)、`site/testdata/`移動(Task 2)、`.gitignore`/`Taskfile.yml`/`TODO.md`整理(Task 3)、Taskfile `build`/`lint`タスクと`package.json`/`eslint.config.js`新設(Task 4・5)、`.github/workflows/deploy.yml`(Task 6)。design記載のキャッシュ戦略(`hashFiles('Taskfile.yml', 'site/build.sh')`)・トリガー(push to main + workflow_dispatch)・デプロイ方式(`actions/deploy-pages`)もTask 6に反映済み。また、design addendum「6. `site/`をPages公開対象のみに整理」(`build.sh`/`testdata/`をリポジトリルートへ移動)はTask 7に反映済み。
- **Placeholder scan**: 各ステップに実際のコード・コマンド・期待結果を記載。Task 5 Step 1の`devDependencies`バージョンのみ「実際に解決されたバージョンに合わせてよい」という許容範囲を明記しており、プレースホルダーではない(具体的な初期値を提示済み)。
- **Type/naming consistency**: `statusEl`・`createGSModule`・`reconvertIfReady`・`currentFile`等は既存実装(`site/index.html`/`site/worker.js`、マージ済み)と整合。`task build`/`task lint`のタスク名はTask 4・5・6・7で一貫。`.gitignore`の最終形(Task 1→3→5で段階的に編集)は各ステップで前段の結果を踏まえた完全な内容を提示している。Task 7の`build.sh`移動後の`ROOT`/`GS_SRC`/`SITE`計算もTask 4・6で参照した`bash site/build.sh`/`hashFiles('Taskfile.yml', 'site/build.sh')`との整合を保つよう更新している。
- **手動作業の明記**: design記載の「Settings > Pages > Source を GitHub Actions に設定」は実装(コード変更)の対象外であるため計画にタスクを設けず、ユーザーへの最終報告時に案内する。
