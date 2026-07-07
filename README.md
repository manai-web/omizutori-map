# 全国お水取りマップ

九星気学の方位と全国の御神水・お水取りスポットで、「いつ・どこへ」お水取りに行くかがわかるWebアプリ(PWA)。

## 構成

- `index.html` — 画面全体
- `css/style.css` — 和風・ゴールド基調のスタイル
- `js/data.js` — お水取りスポットデータ(77件)
- `js/geo.js` — 距離・方位角・磁気偏角(地理院2020.0近似)の計算
- `js/koyomi.js` — 暦計算(節気の天文計算・干支・年月日盤・陽遁陰遁)
- `js/kigaku.js` — 九星気学の吉凶判定(吉方・凶殺・天道・月命切替)
- `js/ban.js` — 八角形の命盤SVG描画
- `js/themes.js` — 9宮の月テーマ定義
- `js/app.js` — アプリ本体
- `announce.csv` — お知らせ(運用時はGoogleシートの公開CSVに差し替え)
- `sw.js` / `manifest.webmanifest` — PWA(オフライン対応・ホーム画面追加)

## 運用メモ

- お知らせ配信: `js/app.js` の `ANNOUNCE_URL` をGoogleスプレッドシート(ファイル>共有>ウェブに公開>CSV)のURLに変更。列は「日付, 種別(全員/会員/コード), タイトル, 本文」
- 会員コード: シートの「コード」行、なければ `js/app.js` の `VALID_CODES`
- 販売ページURL: `js/app.js` の `PREMIUM_URL`

ビルド不要。そのまま静的ホスティング(GitHub Pages等)で動作します。

© 全国お水取りマップ — 地図: 国土地理院 / OpenStreetMap contributors
