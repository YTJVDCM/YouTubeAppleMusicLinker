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

## Build

### 条件

- Node.js : 26 or later
- Python : 3

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

