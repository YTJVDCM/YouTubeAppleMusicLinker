# YouTube → Apple Music Linker

## これは何

YouTubeで再生中の楽曲MVなどをiTunes経由で検索し、Apple Musicへのリンクを表示するFirefoxアドオンです。

## 使い方

### Firefox

> [!IMPORTANT]
> 通常版Firefoxでは未署名アドオンの永続的インストールができません。  
> 起動毎に都度インストールするか、永続化したい場合はFirefox Developer Editionを使ってください。

1. zipをダウンロード
1. 展開
1. [about:debugging](about:debugging) を開く。
1. `このFirefox`タブより、`一時的なアドオンを読み込む...`を押す
1. 展開したフォルダに含まれるmanifest.jsonを読み込み
1. 権限周りを許可

### Firefox Developer Edition

1. zipをダウンロード
1. [about:config](about:config) を開く。
1. `xpinstall.signatures.required`を`false`にする。
1. [about:addons](about:addons) を開く
1. `ファイルからアドオンをインストール...`を押す
1. 先ほどダウンロードしたzipを指定

## GitHub Actionsで配布ZIPを作成

デフォルトブランチに `.github/workflows/distribution.yml` を配置すると、GitHubの **Actions → Build Firefox distribution ZIP → Run workflow** から手動実行できます。タグ付与・push・PRなどによる自動実行はありません。

選択したブランチのコードに対して、依存の固定インストール、型検査、テスト、ビルド、web-ext検査、ZIP内容検査を順に実行します。すべて成功すると、実行画面のArtifactsから `youtube_apple_music_linker-<version>.zip` を直接取得できます。保存期間は30日で、実行サマリーにはSHA-256が表示されます。

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

