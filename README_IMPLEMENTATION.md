# AlphaLens JP 実装メモ

このリポジトリは `docs/` の設計書を実装するモノレポです。

## ローカル起動

```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev:backend
npm run dev:frontend
```

Backend: http://localhost:4000/api/health
Frontend: http://localhost:3000

MVPでは `MARKET_DATA_PROVIDER=mock` と `AI_PROVIDER=mock` で、外部APIキーなしでも主要導線を確認できます。
