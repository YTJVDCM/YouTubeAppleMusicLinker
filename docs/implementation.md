# MVP実装と検証

**現在の方式（0.2.0）:** iTunesを主系統・MusicBrainzを補助とするサーバー不要の検索へ変更済み。現在のセットアップと差分は[切替記録](itunes-main-implementation.md)と[実機チェック](manual-checks.md)を参照。以下のWorker必須・endpoint設定に関する説明は0.1.x時点の記録であり、通常利用には不要。

## 構成と判断

TASK-001の所有範囲は、新規のsrc/、worker/、scripts/、tests/、ビルド設定、manifest.json、この文書と手動検証手順、および空だった.gitignoreへの追記。親Codexが単独で実装し、委譲・並列Git操作はしていない。既存AGENTS.md、Claude.md、製品仕様書、.claude/は変更・コミットしない。

製品仕様の推奨スタックは必須ではないため、TypeScript + esbuild + DOM APIを採用。Preact/WXTを追加せず、Shadow DOMと安全なtextContent描画でMVPを構築する。共有契約はsrc/shared/contracts.ts（version=1）。候補IDはkindと組にし、songとmusic-videoを混同しない。Workerには動画ID・動画URLを送信しない。

FirefoxのMV3はbackground.scriptsを使う。現行のデータ送信同意を利用するため、最低対応をFirefox Desktop 140とし、websiteContent/browsingActivityを宣言。これは仕様のFirefox対象内の互換性判断。Androidは検証対象外。tabsは候補タブ属性の取得、storageは設定・照合キャッシュ、cookiesはcookieStoreIdを指定したコンテナ保持に使用し、Cookie自体は読み書きしない。接続先は設定時にHTTPSオリジン単位で追加許可し、広域ホスト権限を自動付与しない。

## 実装済み

- watch動画IDの検出、SPAイベントとURL確認、単一Shadow DOMホスト、操作前の検索抑止。
- 説明欄のApple Music直接リンク、タイトル・チャンネル・再生時間を取得。装飾語を除去しLive/Remix等は照合に維持。
- Workerで直接曲URL→信頼済み音源ISRC入力→songs/music-videos検索の順に処理。アルバム・トラック情報を最大5候補へ追加。
- 複数盤・僅差・版不一致を要確認として表示。スコアは確率としない。MVは対応音源未確定と表示。
- 読み込み、候補なし、通信失敗、再検索、手動検索、手動選択の保存、アルバムへの移動。
- 地域別キャッシュ（正例7日・負例1日）、手動選択優先、明示的再検索で解除、設定画面の全キャッシュ削除。
- タブ再利用の直列化、HTTPS/正確なホスト検証、通常/プライベート/コンテナ隔離、pinned/audible保護、同一窓・最近使用優先。
- Workerの入力サイズ制限、タイムアウト、401/429/5xx分類、上限付き指数バックオフ、必須のエッジレート制限。

プライベート検索は永続キャッシュを読み書きせず、Backgroundのメモリに直近候補だけ保持する。タブを閉じたときに削除する。イベントページ停止後は再検索が必要。手動確定もプライベートでは保存しない。

## セットアップ

Node.js 22.12以上とnpmを用意し、リポジトリで実行する。

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run lint
npm run package
```

Firefoxのabout:debugging → このFirefox → 一時的なアドオンを読み込む、からmanifest.json（直下）またはdist/extension/manifest.jsonを選ぶ。0.1.1以降は両方をサポートし、ビルド時に両manifestの参照先ファイルとHTML内のスクリプトの存在を検証する。設定画面で自分が管理・信頼するWorkerのHTTPS /match URLを保存し、接続権限を許可する。サーバー未設定時は検索エラーと手動検索導線を表示する。

Workerはworker/wrangler.tomlを使用する。Apple Developerの利用資格・カタログAPI利用条件を確認し、有効なDeveloper TokenをAPPLE_MUSIC_TOKENというサーバーシークレットに登録する。署名鍵はバックエンド運用環境だけで管理し、トークンも有効期限前に更新する。トークン発行エンドポイントは公開しない。RATE_LIMITERバインディングは必須で、未設定時は503とする。公開前に自分のアカウントに合わせnamespace_idと制限値、費用上限、アクセス制御を確認する。アプリケーションはログを出さず、インフラ側のアクセスログ・保持期間も運用者が確認する。今回デプロイ・実API通信は行っていない。

## 未実施・後続改善

実施済み検証: npm run typecheck、npm test（27件）、npm run build、npm run lint（web-ext: errors/notices/warningsすべて0）、npm run package。依存インストール時のnpm監査は脆弱性0件。生成ZIPはweb-ext-artifacts/に出力しGit対象外。秘密鍵・Tokenの実値は設定していない。

Firefox実機E2E・Apple実カタログ照合は未確認。docs/manual-checks.mdで人間が確認する。YouTubeの公開DOMは変化するため、タイトル・チャンネル・説明欄取得の実機確認が必要。

Phase 2の音楽クレジットDOM取得、MusicBrainzによる別名補完は未実装。音源ISRCは型/APIとして受け付けるが、ページ本文から推測して送信しない。日本語/英語別名の自動同定は保証せず、低一致をユーザーへ確認させる。アルバムのみの直接リンクは曲IDを断定せず、メタデータ検索へ進む。APIのアルバムトラックのページ送りは未対応で、返された先頭ページを表示する。重み・閾値は暫定で、実動画教師データによる調整は後続。Shortsは対象外。

## 公式資料（2026-11-22確認）

- [Firefox MV3移行](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
- [Firefoxデータ送信同意](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [tabs.createとcookieStoreId](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/create)
- [Apple Music API](https://developer.apple.com/documentation/applemusicapi)
- [Appleカタログ検索](https://developer.apple.com/documentation/applemusicapi/search)
- [Workersレート制限](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
