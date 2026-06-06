# AlphaLens JP 実装メモ

このリポジトリは `docs/` の設計書を実装するモノレポです。

## ローカル起動

```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run smoke:local
npm run dev:backend
npm run dev:frontend
```

Backend: http://localhost:4000/api/health
Frontend: http://localhost:3000

MVPでは `MARKET_DATA_PROVIDER=mock` と `AI_PROVIDER=mock` で、外部APIキーなしでも主要導線を確認できます。

`npm run smoke:local` は実HTTPサーバーを一時起動し、CSRF取得、登録、銘柄検索、銘柄詳細、Watchlist、AIレポート、分析履歴、ログアウト後401を確認します。既定では `alphalens_smoke` DBを使います。
