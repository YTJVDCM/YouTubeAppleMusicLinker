# iTunes主系統への切替（TASK-006 / 0.2.0）

## 決定

利用者の明示指示により、Apple Music API + 必須Workerから、**iTunes Search/Lookupを主系統、MusicBrainzを補助とする認証不要の方式**へ切り替えた。この指示は既存AGENTS.md・元仕様書のApple Music API主系統という前提に優先する。本書を当該箇所の変更記録とする。前回のdocs/developer-account-free-design.mdは調査時点の案であり、下記実装が現在の動作。

iTunesで得た曲・アルバムIDをmusic.apple.comのURLへ対応付け、再生不可でも照合候補から除外しない。画面では再生可否をApple Musicで確認するよう案内する。MVと通常音源は別候補のまま、MVのISRCから音源を断定しない。

TASK-006の所有範囲はsrc/の契約・設定・キャッシュ・照合・通信・UI、対応テスト、manifest、package/lockの版、互換Workerの型契約、この文書と関連手順。Codexが単独で所有し、既存の利用者ファイルは変更・コミットしない。実APIへの送信・公開・デプロイはしていない。

## 現在の構成

```text
YouTubeの明示クリック → Background
                       ├─ iTunes Search/Lookup（主系統、認証なし）
                       └─ MusicBrainz（必要時だけ、表記・録音の補助）
                     → 共通照合 → Shadow DOM候補パネル
                     → 明示クリック → 保護条件を守ったApple Musicタブ
```

Apple Developerアカウント、MusicKit JS、サーバーURL、Token、Appleアカウント認証は不要。以前のendpoint設定は読まず、保存時に除去する。worker/と旧matchClientは互換用コードとして残すが、拡張の通常検索からは呼び出さない。

## iTunes

- 直接Apple Musicリンクから曲/MVのIDを取り出してLookupする。対応結果がなければ曲名+アーティスト検索へ進む。
- song検索を主系統に、MV判定時はmusicVideoを別検索。結果のkindを検証し、相互に混ぜない。
- APIのtrackId・collectionIdを検証し、曲は `https://music.apple.com/{country}/album/{collectionId}?i={trackId}`（収録盤不明時は `/song/{trackId}`）、MVは `/music-video/{trackId}`、アルバムは `/album/{collectionId}` を生成する。APIから返る任意のviewURLに遷移しない。
- 候補に収録盤・発売日を添える。曲目一覧は「収録曲を表示」でLookupし、検索時に全候補の曲目を同時取得しない。APIが返す先頭200件までで、全曲保証はしない。
- 約20呼び出し/分という公式目安に余裕を取り、Background内の全iTunes呼び出しを最低3.5秒間隔・直列にする。再試行も同じキューを通す。
- artworkとpreviewは取得・表示しない。販促コンテンツ条件に対応するまでジャケットはプレースホルダー。音声の試聴・録音はしない。

## MusicBrainz

一致なし、または先頭スコア0.70未満の場合だけ補助する。複数曲クレジットでは一意に推定しない。明示された音源ISRCがあればrecordingのISRC検索、なければエスケープした曲名・アーティストの検索を行う。

高い検索スコアでもそれだけで正答とせず、曖昧な複数録音、タイトル差、Live/Remix等の版矛盾を拒否する。アーティスト名が異なる場合はartistのaliasesを追加確認する。確認した表記でiTunesを再検索し、元タイトル・版情報を保って再採点する。MusicBrainz検索スコアも確率として表示しない。補助側失敗は注意表示に留め、iTunes候補を破棄しない。

MusicBrainzの識別要件に合わせ、設定にアプリ公開HTTPS URLまたは連絡先メールを入力し、MusicBrainzへの接続を許可すると有効になる。Git author用のnoreplyアドレスは流用しない。未登録の場合も主系統のiTunes検索は動き、補助が必要になったときだけ設定案内を出す。User-Agentにアプリ名・版・登録した連絡先を付ける。全MusicBrainz呼び出しを最低1.1秒間隔・直列にする。Firefoxがこのヘッダーを保持することは実機確認項目。

## 契約・キャッシュ・権限

- CONTRACT_VERSION=2。Candidateにproviderを追加し、song/music-videoは維持。MatchResultに補助失敗などのnoticesを追加。収録曲遅延取得用albumメッセージも追加。互換Worker側も同じversionに揃えた。
- キャッシュキーは `match:v2:itunes:{storefront}:{videoId}`。旧Apple Music APIのキャッシュと混同しない。旧キャッシュは再利用せず、設定画面の削除対象には含める。新しい手動選択を優先する。自動正例7日、負例1日。
- YouTubeホストに加えてiTunesだけを必須ホストにし、MusicBrainzは設定時の追加許可。旧来の任意HTTPSホスト許可は削除した。バージョン更新でiTunes権限が未付与の場合は設定から許可できる。
- API送信はBackgroundから、検索操作後のみ。クエリの曲名・アーティスト・国、直接リンク由来のカタログID、信頼済み音源ISRC（補助時）だけを使用する。動画ID/URL、再生音声、Cookieは送らない。MusicBrainzへはアプリ連絡先も送る。
- credentials=omit、redirect=error、no-referrer、応答サイズ上限1MB、8秒タイムアウト、最大2試行。429・5xxの再試行は間隔を守り、長いRetry-Afterはエラーとして待機時間を案内し、同一Background内でクールダウンする。
- タブ遷移のmusic.apple.com限定、ユーザー操作要件、pinned/audible保護、通常/プライベート/コンテナ隔離は維持。プライベート結果は引き続き永続保存しない。

## 検証

実施した検証はnpm run typecheck、npm test（13ファイル・55件）、npm run build、npm run lint（errors/notices/warningsすべて0）、npm run package。主要な追加検証は、認証・サーバー不要の照合、直接ID、地域差、MV分離、アルバム遅延取得、MusicBrainzの別名・曖昧性・失敗、API間隔・タイムアウト・429・5xx再試行、設定移行、旧キャッシュ分離。Firefox実機と実API応答は未確認。以前の0.1.1の表示・設定遷移の実機成功を、0.2.0の実検索成功とは扱わない。

確認した公式情報:

- [iTunes Search / Lookupと制限](https://performance-partners.apple.com/search-api)
- [iTunesレスポンス](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/UnderstandingSearchResults.html)
- [MusicBrainz検索](https://musicbrainz.org/doc/MusicBrainz_API/Search)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [MusicBrainzレート制限](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)

API/利用条件の調査は2026-11-22。今回レート制限文書の再取得は429となったため、直前調査で取得済みの公式内容も参照した。
