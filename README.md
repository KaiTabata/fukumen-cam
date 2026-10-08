# ふくめんカメラ（Fukumen Cam）

顔を出さずに、**アバターとボイスチェンジャー**で Zoom・Google Meet・Teams などのビデオ会議に出演するためのアプリです（Mac / Windows）。

- **見た目**：ひし形タイルの人型（話すと頭が緑に光る）、自分のシルエットをタイルにしたもの、画像のキャラ（標準キャラ「AIモリモリ」＋自分で登録したキャラ 4 人まで）
- **声**：ノイズ除去 → 話していないときは無音 → 声の高さ・ロボット感などを加工。見た目ごとに声を自動で切り替え
- **キャラ**：声に合わせて口パク、8 種類の表情（手動・自分の表情に連動・おまかせ）。画像生成 AI 用のプロンプトと、表情シートの自動切り分け取り込みつき
- 設定画面は「下書き → Zoom に反映」の方式なので、調整中の画面が相手に映りません

## ダウンロード

[Releases](../../releases) から、使っているパソコンに合うファイルをダウンロードしてください。

| パソコン | ファイル |
|---|---|
| Mac（Apple シリコン：M1〜） | `FukumenCam-x.y.z-mac-arm64.dmg` |
| Mac（Intel） | `FukumenCam-x.y.z-mac-x64.dmg` |
| Windows（64 ビット） | `FukumenCam-x.y.z-win-x64.exe` |

## 必要なもの（無料）

ふくめんカメラのほかに、次の 2 つを入れてください。どちらも無料です。

| | Mac | Windows | 何に使うか |
|---|---|---|---|
| OBS Studio | [obsproject.com](https://obsproject.com/ja/download) | [obsproject.com](https://obsproject.com/ja/download) | 仮想カメラ（Zoom のカメラとして映すため） |
| 仮想オーディオ | [BlackHole 2ch](https://existential.audio/blackhole/) | [VB-CABLE](https://vb-audio.com/Cable/) | 加工した声を Zoom のマイクに渡すため |

- OBS はインストール後に一度起動して、最初の「自動構成ウィザード」を終えてから閉じてください。そのあとは、ふくめんカメラが OBS を自動で設定・起動します（OBS の画面を操作する必要はありません）
- VB-CABLE は、ダウンロードした zip を展開し、`VBCABLE_Setup_x64.exe` を右クリック →「管理者として実行」→「Install Driver」。終わったらパソコンを再起動してください

## インストール

### Mac

1. `.dmg` を開き、「ふくめんカメラ」をアプリケーションフォルダにドラッグします
2. 初回だけ、アプリケーションフォルダで「ふくめんカメラ」を**右クリック →「開く」→「開く」**で起動します（開発元の署名がないため、ダブルクリックだと止められます）
   - それでも開けないときは、「システム設定 → プライバシーとセキュリティ」の下にある「このまま開く」を押してください
3. カメラとマイクの使用を求められたら「許可」を押します

### Windows

1. `.exe` を実行します。「Windows によって PC が保護されました」と出たら、**「詳細情報」→「実行」**を押します（開発元の署名がないため）
2. 画面に従ってインストールし、スタートメニューの「ふくめんカメラ」から起動します

## はじめての設定

1. ふくめんカメラを起動すると設定画面が開きます。左のメニューの「**はじめに**」で、準備ができているか確認できます
2. 「**OBS を自動設定する**」を押します。OBS にふくめんカメラ用のシーンが追加され、仮想カメラが始まります
3. Zoom などで、カメラとマイクを次のように選びます

| | カメラ | マイク |
|---|---|---|
| Mac | OBS Virtual Camera | BlackHole 2ch |
| Windows | OBS Virtual Camera | CABLE Output (VB-Audio Virtual Cable) |

次回からは、ふくめんカメラを起動するだけで OBS と仮想カメラも自動で始まります。

## 使い方

- **出力する見た目**で、Zoom に出す見た目を選び、右上の「**Zoom に反映**」を押します。設定の変更はまず右のプレビューにだけ映り、反映ボタンでまとめて Zoom に出ます
- **声**：見た目ごと（タイル人型の声・キャラの声・その他の声）に調整できます。「録音して試聴」で、反映前の声を確認できます
- **キャラの表情**：ボタンかキーボードの 1〜8 で切り替え（すぐ Zoom に出ます）。自分の表情に連動させることもできます
- **キャラの登録**：画像生成 AI（ChatGPT など）でキャラを作って登録できます。全表情を 1 枚に描いてもらう「表情シート」のプロンプトをコピーし、できた画像をドロップするだけでコマを切り分けて取り込みます
- **モニター**：Zoom に出ている声を、イヤホンで自分でも聞けます（スピーカーだとハウリングします）
- 設定画面を閉じても、ふくめんカメラは動き続けます（Mac はメニューバー、Windows は通知領域のアイコンから設定画面をまた開けます）

## 終了

メニューバー（Windows は通知領域）のアイコン →「ふくめんカメラを終了」、または設定画面右上の「システムを終了」。仮想カメラと OBS（ふくめんカメラ用に動いているとき）も一緒に止まります。

## アンインストール

設定画面の「**アンインストール**」から行うと、OBS に加えた設定も元に戻してから削除します（設定と取り込んだ画像を残すか消すかも選べます）。

- Windows は「設定 → アプリ → インストールされているアプリ」からアンインストールしても同じように後片付けをします
- Mac でアプリをそのままゴミ箱に入れた場合は、OBS のシーンコレクション「FukumenCam」と、設定フォルダ `~/Library/Application Support/fukumen-cam` が残ります
- OBS・BlackHole・VB-CABLE は別のソフトなので、必要なければそれぞれ削除してください（手順はアンインストール画面に書いてあります）

## 注意

- 開発元の署名（Apple Developer ID / Windows のコード署名証明書）がないため、初回起動時に OS の警告が出ます
- Windows 版は GitHub Actions でビルドしています。作者の手元に Windows の実機がないため、Windows での動作確認は十分ではありません。不具合があれば Issues で教えてください
- 写真の人物をキャラにするときは、その人の了解をとってから使ってください

---

## 開発者向け

```sh
npm ci          # 依存のインストール
npm start       # 開発版を起動（web/ の .html/.js を書き換えると画面が自動で読み込み直す）
npm run dist:mac
npm run dist:win
```

`v` から始まるタグ（例: `v1.0.1`）を push すると、GitHub Actions が Mac と Windows のファイルをビルドして Releases に公開します（`.github/workflows/build.yml`）。

### 仕組み

```
electron/main.js   … アプリ本体。中継サーバー・センサー（見えないウィンドウ）・設定画面・トレイ・OBS の起動/終了
electron/server.js … 中継サーバー（127.0.0.1:8732）。画面の配信、センサー → 描画ページへの中継（SSE）、設定とアップロード画像の保存
electron/obs.js    … OBS の検出・自動設定（シーンコレクションと WebSocket）・仮想カメラの開始・アンインストール時の復元
web/sensor.html    … カメラ（顔の位置・表情・人物マスク）とマイク（声の加工 → 仮想オーディオへ出力）
web/index.html     … 描画ページ（OBS のブラウザソースとして表示）
web/settings.html  … 設定画面（デジタル庁デザインシステムのトークンを使用）
```

- 設定と取り込んだ画像は、OS のユーザーデータの場所（Mac: `~/Library/Application Support/fukumen-cam`、Windows: `%APPDATA%\fukumen-cam`）に保存します
- OBS の設定フォルダ（Mac: `~/Library/Application Support/obs-studio`、Windows: `%APPDATA%\obs-studio`）に、シーンコレクション `FukumenCam.json` を作り、WebSocket サーバーを有効にします。自動設定の前の状態は `obs-backup.json` に保存し、アンインストール時に戻します
- 設定項目は `web/settings-schema.js`、画像生成 AI 用のプロンプトは `web/prompts.js` にあります（[docs/character-prompt.md](docs/character-prompt.md)）

## ライセンス

- ソースコード：MIT License（[LICENSE](LICENSE)）
- 標準キャラ「AIモリモリ」の画像（`web/assets/default-char/`）は MIT License の対象外です。ふくめんカメラの中で使う場合に限り、利用できます
- 同梱しているもの：MediaPipe Tasks Vision とモデル（Apache License 2.0）、デジタル庁デザインシステムのデザイントークン（MIT License、`web/vendor/dads/`）
