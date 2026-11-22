# 手動配布ZIP Workflow（TASK-010）

`.github/workflows/distribution.yml`はworkflow_dispatchだけを持ち、push/tag/pull_request/scheduleなどの自動起動条件は持たない。デフォルトブランチへの反映後、GitHubのActionsから対象ブランチを選んで手動実行する。[GitHub公式の実行手順](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

Ubuntu 24.04 + Node.js 26でnpm ci、型検査、拡張テスト、配布検査テスト、ビルド、web-ext lint、ZIP作成、ZIP内容検査を順に実行する。setup-nodeはcheck-latest: trueで26系の最新リリースを確認する。Python 3はUbuntu標準のものをZIP検査に使い、新しいPython/Node依存は追加しない。ジョブは15分でタイムアウトする。

ActionsはGitHub公式のcheckout/setup-node/upload-artifactを使用し、2026-11-22に公式リポジトリのv7タグをgit ls-remoteで確認したコミットSHAに固定。token権限はcontents:read、checkoutの資格情報保存は無効。AMO署名・公開、Release作成、タグ付加、デプロイは行わない。

配布元はdist/extensionのみ。Workerはビルドされてもこのディレクトリの外なのでZIPには入らない。検査スクリプトはZIPを展開せず、許可リスト、必須ファイル、重複・シンボリックリンク・サイズ、manifest版、HTML/manifestの参照解決を検査する。package.json/node_modules/tests/TypeScript/sourcemap/.envなどが入った場合はアップロード前に失敗する。今後ランタイム資産を増やす場合はscripts/verify_distribution.pyの許可リストも更新する。

CIのZIP内容:

```text
manifest.json
background.js
youtube.js
options.html
options.js
popup.html
popup.js
LICENSE
SOURCE.txt
```

LICENSEはリポジトリの既存ファイルをそのままコピーする。SOURCE.txtにはGitHub ActionsでビルドしたコミットのソースURLを記載する。ローカルビルドではビルド元リポジトリを参照する案内となる。Node.jsはビルド・テスト用で、ブラウザー実行に必要なJSまで取り除くことはしない。

検査後、正確なZIPパスだけをupload-artifact v7のarchive:falseでアップロードするため、配布ZIPを再びArtifact用ZIPへ包まない。保存期間は30日。再実行時は同じ実行の同名Artifactを置換する。SHA-256は実行サマリーに記録する。[公式upload-artifact入力](https://github.com/actions/upload-artifact)

検証: Workflow YAMLの構文、トリガーがworkflow_dispatchのみであること、read-only権限、ActionsのSHA固定、直接ZIPアップロードを静的確認。npm ciは成功・依存監査0件。npm run typecheck、npm test（66件）、npm run test:distribution（8件）、npm run build、npm run lint（警告0）、npm run package、npm run verify:distributionをローカルで実行し成功。GitHub上のWorkflow実行・Artifact保存そのものは未実施。ZIPは未署名で、インストール方法はREADMEを参照する。

TASK-010の所有範囲は新規Workflow、ZIP検査とそのテスト、ビルドのライセンス/ソース案内追加、package.jsonのコマンド、.gitignoreのPython生成物除外、READMEと本書。Codexが単独所有し、既存の利用者ファイル・変更は混入させない。生成ZIP・依存・PythonキャッシュはGit対象外。

TASK-011: 利用者の指定により、Workflowのビルド用Node.jsを26系へ更新し、check-latest: trueを設定。Node.js公式配布の26.13.1をSHA-256検証後に使用し、npm ci、型検査、拡張66件・配布8件のテスト、ビルド、web-ext lint、ZIP作成・内容検査が成功した。Actions自体の実行ランタイムは各Actionの定義に従い、setup-nodeで選ぶプロジェクト用Node.jsとは独立する。変更所有範囲はWorkflow、README、本書のみ。GitHub上の実行は未実施。
