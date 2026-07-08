# FloatPlayer (Electron)

🇯🇵 日本語 | [🇺🇸 English](./README.en.md)

Windows / macOS 両対応の、常に最前面に浮くフローティングプレイヤーです。YouTube・写真(スクリーンショット等)・保存済み動画を、他のアプリで作業しながら同時に見続けられます。

[Swift/AppKit版(macOS専用)](https://github.com/HaruBoo/FloatPlayer)を、Electronで1つのコードベースにより両OS対応させたバージョンです。

> **注記**: 開発者はWindows実機を持っていないため、Windows版はGitHub Actions(windows-latest)でのビルド・パッケージングのみ自動検証しています。実際の操作感の細部は未検証です。動作報告・Issue歓迎です。

---

## 特徴

- **YouTube再生** — 公式のIFrame Player APIを使った埋め込み再生(ダウンロードは行いません)
- **写真/スクリーンショット表示** — ファイル選択・ドラッグ&ドロップ・クリップボード貼り付けに対応
- **動画ファイルのループ再生**
- **スクリーンショットの自動フローティング** — スクショを撮ると、UIなし・画像だけのウィンドウが自動で浮かび上がります(macOS: デスクトップ、Windows: Pictures/Screenshotsを監視)。ドラッグで移動、端から自由に拡大縮小、スクロールまたは右クリックメニューで透明度調整ができます
- **クリップボードの画像も自動でフローティング**(既定オフ) — Cmd+Ctrl+Shift+4等ファイル保存を伴わないスクショにも対応(設定 → メニューから有効化)
- **2種類の透明度スライダー** — 「映像」と「UI」を別々に透明にできます
- **賢いウィンドウの重なり** — メインパネル・スクリーンショットのフローティングウィンドウとも、アクティブな間だけ最前面、他アプリ使用中は背面に回ります
- **チャプター抽出** — YouTube Data API v3で概要欄のタイムスタンプから自動抽出

## 必要環境

- Node.js 20以降

## セットアップ

```sh
git clone https://github.com/HaruBoo/FloatPlayer-electron.git
cd FloatPlayer-electron
npm install
npm start
```

## パッケージのビルド

```sh
npm run build:mac    # macOS用 .dmg
npm run build:win    # Windows用 インストーラ(.exe)
npm run build:all    # 両方
```

`electron-builder`はMac上からでもWindows用パッケージを作成できます(コード署名は行わないため、Windows側でSmartScreenの警告が出ることがあります)。

## 使い方

macOS/Swift版と同じ操作感です。詳しい機能説明は[macOS版のREADME](https://github.com/HaruBoo/FloatPlayer#使い方)を参照してください。主な違いは以下の通りです。

- メニューバー/システムトレイのアイコンから操作(macOSはメニューバー、Windowsはタスクトレイ)
- チャプター取得のAPIキーはブラウザのlocalStorageに保存されます

## 技術構成

Electron / Node.js / chokidar(フォルダ監視) / YouTube IFrame Player API / YouTube Data API v3

## ライセンス

個人プロジェクトです。ライセンスは特に設定していません。
