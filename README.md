# YouTube → Apple Music Linker

## これは何

YouTubeで再生中の楽曲MVなどをiTunes経由で検索し、Apple Musicへのリンクを表示するFirefoxアドオンです。

## 使い方

### Firefox

> [!IMPORTANT]
> 通常版Firefoxでは未署名アドオンの永続的インストールができません。  
> 起動毎に都度インストールするか、永続化したい場合はFirefox Developer Editionを使ってください。

1. [Releases](https://github.com/YTJVDCM/YouTubeAppleMusicLinker/releases) よりzipをダウンロード
1. 展開
1. [about:debugging](about:debugging) を開く。
1. `このFirefox`タブより、`一時的なアドオンを読み込む...`を押す
1. 展開したフォルダに含まれるmanifest.jsonを読み込み
1. 権限周りを許可

### Firefox Developer Edition

1. [Releases](https://github.com/YTJVDCM/YouTubeAppleMusicLinker/releases) よりzipをダウンロード
1. [about:config](about:config) を開く。
1. `xpinstall.signatures.required`を`false`にする。
1. [about:addons](about:addons) を開く
1. `ファイルからアドオンをインストール...`を押す
1. 先ほどダウンロードしたzipを指定
1. 権限周りを許可

## GitHub Actionsで配布ZIPを作成

デフォルトブランチに `.github/workflows/distribution.yml` を配置すると、GitHubの **Actions → Build Firefox distribution ZIP → Run workflow** から手動実行できます。タグ付与・push・PRなどによる自動実行はありません。

選択したブランチのコードに対して、Gitタグの版判定、依存の固定インストール、型検査、テスト、ビルド、web-ext検査、ZIP内容検査を順に実行します。すべて成功すると、実行画面のArtifactsから配布ZIPを直接取得できます。保存期間は30日で、実行サマリーにはバージョンとSHA-256が表示されます。

- 対象コミットに `v1.2.3` または `1.2.3` のタグがある場合: `youtube_apple_music_linker-1.2.3.zip`。ZIP内部のmanifestも `1.2.3` になります。
- タグがない場合: `youtube_apple_music_linker-<package.jsonの版>-dev-<コミットID先頭12桁>.zip`。内部manifestはpackage.jsonの版です。過去のタグを新しいコミットのリリース番号として流用しません。
- 対象コミットに異なる版のタグが複数ある場合や、リリースタグが対応外の形式（先頭ゼロ・プレリリース接尾辞など）の場合はエラーになります。

リリース用ZIPを作る際は、このWorkflowの変更を含む対象コミットにリリースタグを付けてから、そのコミットを対象に手動実行してください。タグ付与だけでは起動しません。ソースのpackage.json・manifest.jsonはWorkflowで書き換えず、生成物だけへ版を反映します。

ZIPには、ルートのmanifest.json、ブラウザーで必要なJS・HTML、LICENSE、SOURCE.txtだけが入ります。Node.js依存、package.json、テスト、TypeScriptソース、Worker、開発設定は入りません。SOURCE.txtにはCIでビルドしたコミットのソースURLを記載します。Firefox側にNode.jsをインストールする必要はありません。

このWorkflowはZIP作成とArtifact保存までです。AMO署名・公開、GitHub Release作成、タグ付加、デプロイは行いません。GitHub上での手動実行には、このWorkflowがデフォルトブランチに存在する必要があります。

ローカルで同じ検証を行う場合は、Node.js 26とPython 3を用意して実行します。Pythonは配布ZIPの検査だけに使い、配布物へ同梱しません。

```sh
npm ci
npm run typecheck
npm test
npm run test:distribution
npm run build
npm run lint
npm run package
npm run verify:distribution
```

