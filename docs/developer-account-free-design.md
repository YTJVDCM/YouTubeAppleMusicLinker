# Developerアカウント不要の検索方式の調査（TASK-005）

**追記:** 利用者の採用指示により、0.2.0でiTunes主系統・MusicBrainz補助を実装した。iTunes IDをApple MusicのURLへ対応付け、再生不可を照合から除外しない決定を採用。現在の動作は[実装記録](itunes-main-implementation.md)を参照。以下は採用前の調査・提案。

## 結論と位置付け

調査日: 2026-11-22。**認証不要のiTunes Search APIを、Apple Music配信未確認のメタデータ検索モードとして追加する設計は可能**。Apple Music APIの完全な置換にはならない。通常のAppleアカウント認証だけでApple Music APIを使う案は、公式のDeveloper Token要件を解消しない。

今回は資料調査とコードの適合性確認。APIへの実検索、ログイン、デプロイ、実装切替はしていない。現在動くコードは引き続きApple Music API + Worker方式である。この文書は採用提案であり、既存仕様の「Apple Music APIを主系統」とする決定やAGENTS.mdを黙って変更するものではない。無料モードを既定にする場合は、その仕様変更を実装と同時に明記する。

## 確認できた選択肢

| 方式 | 認証・登録 | 得られるもの | 現行機能との関係 |
|---|---|---|---|
| Apple Music API / MusicKit Web | Developer Tokenが必要。利用者固有データにはMusic User Tokenも必要 | Apple Musicカタログ、アルバム、ISRC照会等 | 現行の完全機能。通常のAppleアカウントだけでは代替不可 |
| iTunes Search / Lookup | 公開仕様の呼び出しにAPIキー・Token・利用者ログインの指定なし | iTunes Storeの曲・MV・収録盤・長さ等 | 無料モードの候補。Apple Musicの配信可否や全カタログを保証しない |
| MusicBrainz | 公開メタデータ読取はAPIキー不要。意味のあるUser-Agentが必要 | 録音、別名、ISRC、リリース、登録されているURL関係 | 補助照合向き。Apple Musicの現行配信情報の代替にはならない |
| Apple Musicの手動検索画面 | アドオン内認証不要。再生・契約は移動先のApple側に任せる | ユーザー自身がApple Music上で検索 | 現行の手動検索導線をそのまま活用可能。候補パネルの自動取得はできない |

AppleのDeveloper Token資料は、Apple Developer Programの開発者として認証し、全Apple Music APIリクエストに署名済みTokenが必要と説明している。Music User Tokenは利用者固有データ用の追加認証で、Developer Tokenを置換しない。[Developer Tokens](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens)、[User Authentication](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit)

iTunes SearchはApple公式の現行Performance Partners資料に掲載され、旧Documentation ArchiveのSearchingページも同資料へリダイレクトする。認証不要という判断は、公開された検索・Lookup手順に認証項目がないことに基づく。実応答の到達性・返却フィールド・Firefoxからの通信は今回未検証。[Search API](https://performance-partners.apple.com/search-api)

MusicBrainzは公開読取と利用者情報/書込の認証を区別する。非商用Webサービス利用は無料で、商用は別条件。補助取得時も約1リクエスト/秒とUser-Agent要件を守る。データ本体のコアはCC0、補助データは別ライセンスであり、画像まで自由利用とみなさない。[API](https://musicbrainz.org/doc/MusicBrainz_API)、[レート制限](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)、[ライセンス](https://musicbrainz.org/doc/About/Data_License)

## iTunes方式で維持できる機能と差分

曲名・アーティスト・再生時間による検索、複数候補、Live/Remix等の減点、MVとsongの分離、関連アルバム、手動選択は維持できる見込み。APIレスポンスのtrackName、artistName、collectionName、trackTimeMillis等を現行の照合入力へ変換する。albumのLookupにentity=songを指定して曲目を補う。[レスポンス項目](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/UnderstandingSearchResults.html)、[Lookup例](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html)

設計に用いるリクエスト例（今回未実行）:

```text
GET https://itunes.apple.com/search?term={artist+title}&country=jp&media=music&entity=song&limit=10&lang=ja_jp
GET https://itunes.apple.com/search?term={artist+title}&country=jp&media=musicVideo&entity=musicVideo&limit=10&lang=ja_jp
GET https://itunes.apple.com/lookup?id={collectionId}&country=jp&entity=song
```

実装時はURLSearchParamsでエンコードし、JSONだけをfetchで取得する。資料のJSONP例を拡張にコピーしてリモートスクリプトを実行しない。

制約:

- iTunes StoreのヒットをApple Music配信確認済みと扱わない。購入用のviewURLが返る仕様であり、返却ホストやIDをApple Musicへ無条件に置換する根拠は今回の公式資料では確認できない。
- iTunes IDとApple Music IDの全件同一性、ストア間・地域間の完全互換性は仮定しない。Apple Music URLがなければ、選んだ候補の曲名・アーティストでApple Musicの検索画面を開く。
- 音源ISRCによるApple Music song照会と同等のiTunes検索フィルターは今回確認できない。未対応能力として扱い、MVのISRCや推定IDで補わない。
- ジャケット・プレビューには販促利用条件がある。公式資料はiTunes購入ページへつながる承認済みバッジ等を求める。「Apple Musicで開く」だけで条件を満たすとは判断できない。初期案は画像・プレビューを取得表示せず、文字情報とプレースホルダーにする。画像を復活させる場合は適用条件と、music.apple.comのみへ遷移する既存仕様との整合を別途確認する。[販促コンテンツの条件](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html)
- 無認証は無制限・無条件の利用を意味しない。API応答の保証やメタデータの無制限な再配布権を推定しない。

公式資料の上限は約20呼び出し/分で変更されうる。検索・MV検索・アルバムLookupを合算してクライアント単位の直列キューと余裕のある上限を設け、429では待機する。候補全件に同時Lookupせず、利用者が開いたアルバムだけ遅延取得する。正例・負例キャッシュと同時検索統合を維持する。上限の厳密な集計単位やSLAは未確認。[制限とキャッシュ](https://performance-partners.apple.com/search-api)

## 推奨する組み込み方

Backgroundに切替可能なCatalogProviderを置き、**認証不要のiTunes直結モード**と**現行のApple Music Workerモード**を明示的に選べるようにする。Content Scriptが外部APIを直接叩く構成にはしない。iTunesモードはサーバーURL・Appleアカウント・Developer Tokenを不要にできる。一方、Worker側にiTunesアダプターだけを追加する最小案も可能だが、利用者がサーバーを用意する問題は残る。

```text
Content Script → Background → 選択したCatalogProvider
                             ├─ public-itunes → iTunes Search / Lookup（認証なし）
                             └─ apple-music-worker → 現行Worker → Apple Music API
                    ↓
             共通の照合・パネル・安全なタブ操作
```

自動で異なる提供元へ切り替えず、送信先を設定画面に明示する。検索はボタン押下後だけ。iTunesへ送るのは曲名・アーティスト等の検索語と地域で、YouTube動画ID・URL・Cookie・Appleアカウント情報は送らない。`credentials: omit`を使う。`https://itunes.apple.com/*`への最小ホスト許可を利用者に求める。公開APIのCORSの有無に依存せずBackgroundから許可済みホストへfetchし、Firefox実機で検証する。

### 現行コードとの具体的な接点

| 現行パス | 必要な変更 |
|---|---|
| src/services/matchClient.ts | Worker専用通信を残し、別のCatalogProvider選択層とiTunesクライアントを追加。現行validResultはmusic.apple.com URLを必須にするので、そのままiTunes結果を流し込めない |
| src/shared/contracts.ts | 提供元・元ID・カタログ能力・Apple Musicの確認状態を区別。遷移先を「検証済みmusic.apple.com URL」または「検索語」のunionにし、URL未確認の候補も表現。変更時は契約versionを更新し、全利用側とテストを同時変更 |
| src/matching/score.ts | 型をブラウザー非依存に維持。既存のタイトル・アーティスト・時間・版照合を再利用し、スコアとApple Music配信状態を独立させる |
| src/services/cache.ts | 既存の地域+動画IDにproviderと契約versionを追加。候補・手動選択のIDはprovider+kind+sourceIdで識別し、別カタログの同じ数字を混同しない。旧データはApple Music由来として移行または無効化 |
| src/entrypoints/background.ts | 設定でproviderを選択し検索を調停。未検証URLは開かず、候補選択に基づく手動検索へ。切替中の古い結果・手動マッピングを別providerへ流用しない |
| src/entrypoints/options.ts/html | 「無料メタデータ検索／Apple Music API」の選択と送信先説明。無料モードでendpoint必須を解除。既存のWorker設定を保持し移行時に無断で送信先を切り替えない |
| src/entrypoints/youtube.content.ts | 「iTunesの候補・Apple Music配信未確認」を表示。URLがあれば開く、なければ「この候補をApple Musicで検索」。無料モードはジャケットなし・アルバム遅延取得 |
| src/services/tabNavigation.ts | music.apple.com限定、明示操作、pinned/audible保護、プライベート・コンテナ隔離は維持。iTunesホストを許可リストに追加しない |
| worker/src/index.ts/appleMusic.ts | 現行方式を継続。無料直結モードはここを経由せず、APPLE_MUSIC_TOKEN未設定503を回避する |
| manifest.json・scripts/manifest.mjs | iTunesのホスト許可を追加する場合、直下/配布manifestの整合検証も継続。新しいリモートコード許可は不要 |

provider能力は例としてsearchSong/searchMusicVideo/lookupAlbum/audioIsrc/appleMusicCatalogConfirmationを分け、未対応機能は「候補なし」ではなく「この方式では未対応」と表示する。手動選択は利用者の選択であり、配信確認状態を自動的に確認済みに昇格させない。

## 採らない案

- 通常のAppleアカウントのログイン画面を追加してDeveloper Tokenを省く案。公式APIの認証要件を満たさない。
- Apple Music WebのCookie・内部Tokenの抽出、Webクライアント専用APIの流用、他者のDeveloper Tokenの転載。公式にサポートされる認証方法として確認できず採用しない。
- HTMLスクレイピングをApple Music APIと同等の安定したカタログ契約と扱う案。
- Odesli旧APIを認証不要の主系統にする案。公式旧リポジトリは非推奨で新ヘルプへ案内しており、現行ヘルプの利用条件を今回取得できなかった。第三者の記事だけで現在利用可能・終了済みのいずれとも断定しない。[公式旧資料](https://github.com/songlink/docs)

## 実装前の受け入れ条件

1. 一般的な公開曲の固定クエリで、iTunes JSON・地域・kind・長さ・Lookupの実応答を確認。個人の閲覧情報を送る検証とは分離する。
2. FirefoxのBackground fetch、ホスト権限の付与/取消、拡張CSP、未認証状態を実機確認する。
3. Apple Music専売・Storeのみ・地域差・MV・Live/Remix・同曲複数盤・URL欠損を用意し、配信可否を誤表示しない。
4. 全API呼び出しのレート制限、遅延アルバム取得、タイムアウト・429・5xx・負例TTLを検証する。
5. providerを切り替えても旧結果や手動選択が混ざらず、旧設定・旧キャッシュを安全に扱う。
6. 既存の型検査・テスト・manifest静的検査・ビルドを維持し、タブ隔離・明示操作の回帰を確認する。

結論: Developerアカウントも自前サーバーも不要な実用モードは設計できる。ただし「無料でApple Music APIと同じ保証を持つ」とはしない。推奨はiTunesの文字メタデータ候補 + Apple Musicでの確認検索を基本に、現行Worker方式を高機能モードとして残す構成。
