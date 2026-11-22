# ボタン非表示の調査（TASK-002）

実機で「動画ページにボタンがなく、ページコンソールにもエラーがない」と報告された。現環境にFirefoxはなく、報告時点の注入状態・権限・読み込みパスは未確定のため、原因を確定したとは扱わない。

変更範囲はContent Script、ツールバーポップアップ、manifest、ビルド、対応テスト・文書。全てCodexが単独所有し、既存の利用者ファイルはコミットしない。検索・API契約・タブ再利用の変更や権限の追加はない。

- ツールバーからYouTube権限とContent Script応答を確認できるようにした。未注入の場合は動画ページの再読み込みを案内する。権限許可と再読み込みはユーザー操作時のみ実施する。
- Content Scriptは拡張内部の診断メッセージだけに応答し、外部検索を実行しない。
- YouTube等によるホスト要素の除去後、既存のURL確認時に同じShadow DOMを復帰させる。マウントやイベントリスナーを増殖させない。
- 読み込み対象がdist/extension/manifest.jsonであることと、拡張更新後の動画ページ再読み込み、拡張側コンソールの確認場所を手動手順に追記した。

Firefox MV3のホスト権限はインストール時に表示・付与されるが利用者が取り消せる。権限不足と断定せず、実際のpermissions.contains結果で案内する。[Mozilla公式](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions)

実機での原因確定・修正後の表示確認は利用者による再検証が必要。
