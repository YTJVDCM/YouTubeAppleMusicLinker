# 直下manifestの参照切れ修正（TASK-003）

実機でボタン・ポップアップ本文が出ず、popup.htmlのQuirks Mode警告だけが表示された。利用者がリポジトリ直下のmanifest.jsonを読み込んだことを確認した。

0.1.0の直下manifestはbackground.js、youtube.js、popup.html、options.htmlを直下から参照していたが、それらの生成先はdist/extension/であり、実際に全参照先が存在しなかった。dist版とZIP内のpopup.htmlにはDOCTYPE・本文が存在することも確認した。DOCTYPE不足を修正すべき症状ではなく、読み込み先の不整合だった。前回TASK-002の診断ポップアップ自身も読み込めない構成を残していた。

0.1.1では直下manifestを開発用の有効な読み込み起点として扱い、各参照をdist/extension/へ向ける。ビルド時は同じ定義から配布用manifestを生成し、ファイル名を配布ディレクトリ内の相対パスへ変換する。両manifestのリソースとHTML内のスクリプトの存在・DOCTYPEをビルド中に検査する。ZIPは引き続きdist/extensionだけを含む。

所有範囲はmanifest.json、package.json/lockfile、scripts/build.mjs・manifest.mjs、popup.html、manifest回帰テスト、この文書と関連手順。Codexが単独で実装・検証・コミットし、利用者ファイルや他タスクの未コミット変更は含めない。新しい権限・外部通信・秘密情報は追加しない。

利用者はnpm run build後、about:debuggingから同じ直下manifestのアドオンを再読み込みし、0.1.1と表示されることを確認してYouTubeページを再読み込みする。現在の環境にFirefoxはなく、実機での表示復旧は再確認が必要。
