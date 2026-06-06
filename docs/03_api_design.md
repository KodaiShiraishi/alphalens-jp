# AlphaLens JP API設計書

## 目次
- [1. API概要](#overview)
- [2. 共通仕様](#common)
- [3. Health Check](#health-api)
- [4. 認証API](#auth-api)
- [5. 銘柄API](#stock-api)
- [6. Watchlist API](#watchlist-api)
- [7. AI分析レポートAPI](#analysis-api)
- [8. データ同期API](#sync-api)
- [9. エラー仕様](#errors)
- [10. バリデーション](#validation)

<a id="overview"></a>
## 1. API概要

AlphaLens JPのバックエンドはREST APIとして実装します。

ベースパス:

```text
/api
```

APIの責務:

- 認証
- 銘柄検索
- 銘柄詳細取得
- Watchlist管理
- AI分析レポート生成
- 外部データ同期

<a id="common"></a>
## 2. 共通仕様

### 2.1 Content-Type

```text
application/json
```

### 2.2 認証

認証が必要なAPIには、Node.js / TypeScript APIが発行するHttpOnly Cookieを使用します。Cookieには不透明なセッショントークンを入れ、DBにはトークンハッシュのみ保存します。

状態変更APIではCSRF対策としてDouble Submit Cookie方式を使います。APIは `al_csrf` Cookieを発行し、フロントエンドは同じ値を `X-CSRF-Token` ヘッダーで送ります。ログイン、登録、ログアウトを含む `POST`、`PUT`、`PATCH`、`DELETE` はCSRFトークン必須です。

Cookie:

| Cookie | 用途 | 属性 |
| --- | --- | --- |
| `__Host-al_session` | 本番セッション | HttpOnly、Secure、SameSite=Lax、Path=/、Domainなし |
| `al_session` | ローカルHTTP開発用セッション | HttpOnly、SameSite=Lax、Path=/ |
| `al_csrf` | CSRFトークン | Secure、SameSite=Lax、Path=/、HttpOnlyなし |

本番ではCloudFrontの同一ドメインでフロントエンドと `/api/*` を配信します。ローカル開発ではNext.jsのプロキシで `/api/*` をバックエンドへ転送し、同一siteとして扱います。

### 2.3 日付形式

```text
YYYY-MM-DD
```

### 2.4 通貨・数値

- 金額は原則として円単位の整数または小数で保持する。
- パーセンテージは `0.1234` のような小数でAPI返却し、UIで `12.34%` 表示に変換する。

<a id="health-api"></a>
## 3. Health Check

### 3.1 API Health Check

```http
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "db": "ok",
  "version": "0.1.0"
}
```

Health checkではDB接続のみ確認します。J-Quants APIやOpenAI APIなど外部サービスは呼び出しません。

<a id="auth-api"></a>
## 4. 認証API

### 4.1 CSRFトークン取得

```http
GET /api/auth/csrf
```

Response:

```json
{
  "csrfToken": "csrf_01H..."
}
```

このAPIは未ログインでも呼び出せます。レスポンスと同時に `al_csrf` Cookieを設定します。

### 4.2 ユーザー登録

```http
POST /api/auth/register
```

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "user": {
    "id": "usr_01H...",
    "email": "user@example.com"
  }
}
```

登録成功時は本番では `__Host-al_session`、ローカルHTTP開発では `al_session` を設定し、新しい `al_csrf` Cookieも設定します。

### 4.3 ログイン

```http
POST /api/auth/login
```

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "user": {
    "id": "usr_01H...",
    "email": "user@example.com"
  }
}
```

ログイン成功時は本番では `__Host-al_session`、ローカルHTTP開発では `al_session` を設定し、新しい `al_csrf` Cookieも設定します。

### 4.4 ログアウト

```http
POST /api/auth/logout
```

Response:

```json
{
  "ok": true
}
```

ログアウト成功時はセッションCookieを削除し、`al_csrf` Cookieをローテーションします。

### 4.5 自分のユーザー情報

```http
GET /api/auth/me
```

Response:

```json
{
  "user": {
    "id": "usr_01H...",
    "email": "user@example.com"
  }
}
```

<a id="stock-api"></a>
## 5. 銘柄API

### 5.1 銘柄検索

```http
GET /api/stocks?query=toyota&market=prime&sector=transportation&limit=20
```

Response:

```json
{
  "items": [
    {
      "code": "7203",
      "displayCode": "7203",
      "providerCode": "72030",
      "name": "トヨタ自動車",
      "nameEn": "TOYOTA MOTOR CORPORATION",
      "market": "Prime",
      "sector33": "輸送用機器",
      "lastPrice": 3021.5
    }
  ],
  "total": 1
}
```

### 5.2 銘柄詳細

```http
GET /api/stocks/{code}
```

Response:

```json
{
  "stock": {
    "code": "7203",
    "displayCode": "7203",
    "providerCode": "72030",
    "name": "トヨタ自動車",
    "nameEn": "TOYOTA MOTOR CORPORATION",
    "market": "Prime",
    "sector17": "Automobiles & Transportation Equipment",
    "sector33": "輸送用機器"
  },
  "latestPrice": {
    "date": "2026-06-05",
    "close": 3021.5,
    "volume": 12345600
  },
  "latestFinancials": {
    "periodEnd": "2026-03-31",
    "netSales": 45000000000000,
    "operatingProfit": 5000000000000,
    "ordinaryProfit": 5200000000000,
    "profit": 3900000000000,
    "eps": 250.12,
    "bps": 2800.25,
    "equityRatio": 0.38
  },
  "dataUpdatedAt": "2026-06-06T12:00:00Z"
}
```

### 5.3 株価時系列

```http
GET /api/stocks/{code}/prices?from=2025-01-01&to=2026-06-06
```

Response:

```json
{
  "items": [
    {
      "date": "2026-06-05",
      "open": 3000.0,
      "high": 3050.0,
      "low": 2980.0,
      "close": 3021.5,
      "adjustedClose": 3021.5,
      "volume": 12345600
    }
  ]
}
```

### 5.4 財務時系列

```http
GET /api/stocks/{code}/financials
```

Response:

```json
{
  "items": [
    {
      "periodType": "FY",
      "periodEnd": "2026-03-31",
      "netSales": 45000000000000,
      "operatingProfit": 5000000000000,
      "ordinaryProfit": 5200000000000,
      "profit": 3900000000000,
      "eps": 250.12,
      "bps": 2800.25,
      "equityRatio": 0.38
    }
  ]
}
```

<a id="watchlist-api"></a>
## 6. Watchlist API

### 6.1 Watchlist取得

```http
GET /api/watchlist
```

Response:

```json
{
  "items": [
    {
      "code": "7203",
      "name": "トヨタ自動車",
      "latestPrice": 3021.5,
      "lastAnalyzedAt": "2026-06-06T12:00:00Z",
      "createdAt": "2026-06-06T10:00:00Z"
    }
  ]
}
```

### 6.2 Watchlist追加

```http
POST /api/watchlist
```

Request:

```json
{
  "code": "7203"
}
```

Response:

```json
{
  "ok": true
}
```

### 6.3 Watchlist削除

```http
DELETE /api/watchlist/{code}
```

Response:

```json
{
  "ok": true
}
```

<a id="analysis-api"></a>
## 7. AI分析レポートAPI

### 7.1 AI分析レポート生成

```http
POST /api/stocks/{code}/analysis-reports
```

Request:

```json
{
  "language": "ja",
  "forceRefresh": false
}
```

Response:

```json
{
  "report": {
    "id": "rep_01H...",
    "stockCode": "7203",
    "title": "トヨタ自動車 ファンダメンタルズ調査メモ",
    "summary": "直近の財務データでは...",
    "growth": "売上高は...",
    "profitability": "営業利益率は...",
    "stability": "自己資本比率は...",
    "risks": [
      "為替影響を受けやすい",
      "原材料価格の変動リスクがある"
    ],
    "checkpoints": [
      "次回決算で営業利益率の改善を確認する",
      "地域別販売台数の推移を確認する"
    ],
    "dataLimitations": [
      "キャッシュフロー情報はMVPの入力データに含まれていません。"
    ],
    "evidence": [
      {
        "label": "営業利益",
        "period": "2026-03-31",
        "value": 5000000000000,
        "source": "J-Quants /fins/statements"
      }
    ],
    "disclaimer": "このレポートは投資助言ではありません。",
    "inputDataVersion": "hash_...",
    "createdAt": "2026-06-06T12:00:00Z"
  }
}
```

MVPでは同期生成として扱います。同一 `inputDataVersion` のレポートが存在し、`forceRefresh=false` の場合は既存レポートを返します。新規生成がタイムアウト、拒否応答、スキーマ不一致、禁止表現チェック失敗になった場合はレポートを保存せず `AI_PROVIDER_ERROR` を返します。

### 7.2 分析履歴取得

```http
GET /api/analysis-reports?code=7203&limit=20
```

Response:

```json
{
  "items": [
    {
      "id": "rep_01H...",
      "stockCode": "7203",
      "stockName": "トヨタ自動車",
      "title": "トヨタ自動車 ファンダメンタルズ調査メモ",
      "createdAt": "2026-06-06T12:00:00Z"
    }
  ]
}
```

### 7.3 分析レポート詳細

```http
GET /api/analysis-reports/{id}
```

Response:

```json
{
  "report": {
    "id": "rep_01H...",
    "stockCode": "7203",
    "body": {
      "summary": "...",
      "growth": "...",
      "profitability": "...",
      "stability": "...",
      "risks": [],
      "checkpoints": [],
      "dataLimitations": [],
      "evidence": []
    },
    "sourceSnapshot": {
      "stockDataUpdatedAt": "2026-06-06T10:00:00Z",
      "financialPeriods": ["2024-03-31", "2025-03-31", "2026-03-31"]
    },
    "createdAt": "2026-06-06T12:00:00Z"
  }
}
```

<a id="sync-api"></a>
## 8. データ同期API

MVPでは管理者APIとして公開しません。バックエンド内部処理またはCLIで実行します。以下のHTTP APIはSQS/Worker導入後の将来拡張案であり、MVP実装対象外です。

### 8.1 銘柄データ更新

```http
POST /api/internal/sync/stocks
```

### 8.2 個別銘柄データ更新

```http
POST /api/internal/sync/stocks/{code}
```

Response:

```json
{
  "jobId": "job_01H...",
  "status": "queued"
}
```

<a id="errors"></a>
## 9. エラー仕様

エラーレスポンス:

```json
{
  "error": {
    "code": "STOCK_NOT_FOUND",
    "message": "銘柄が見つかりません。",
    "requestId": "req_01H..."
  }
}
```

| HTTP | code | 内容 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 入力値不正 |
| 401 | UNAUTHORIZED | 未ログイン |
| 403 | FORBIDDEN | 権限なし |
| 403 | CSRF_TOKEN_INVALID | CSRFトークンなし、または不一致 |
| 404 | STOCK_NOT_FOUND | 銘柄なし |
| 404 | REPORT_NOT_FOUND | レポートなし |
| 409 | WATCHLIST_ALREADY_EXISTS | Watchlist登録済み |
| 429 | RATE_LIMITED | レート制限 |
| 502 | MARKET_DATA_PROVIDER_ERROR | 外部データ取得失敗 |
| 503 | AI_PROVIDER_ERROR | AI生成失敗 |
| 500 | INTERNAL_ERROR | サーバー内部エラー |

<a id="validation"></a>
## 10. バリデーション

| 項目 | ルール |
| --- | --- |
| email | メール形式、最大255文字 |
| password | 8文字以上 |
| stock code | 4桁入力またはJ-Quantsの5桁コードを許容し、内部で `displayCode` と `providerCode` に正規化する |
| query | 1文字以上、100文字以下 |
| limit | 1以上100以下 |
| from/to | `YYYY-MM-DD`、from <= to |
| language | `ja` または `en` |
