# AlphaLens JP API設計書

## 目次
- [1. API概要](#overview)
- [2. 共通仕様](#common)
- [3. 認証API](#auth-api)
- [4. 銘柄API](#stock-api)
- [5. Watchlist API](#watchlist-api)
- [6. AI分析レポートAPI](#analysis-api)
- [7. データ同期API](#sync-api)
- [8. エラー仕様](#errors)
- [9. バリデーション](#validation)

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

認証が必要なAPIには、HttpOnly CookieまたはBearer Tokenを使用します。MVPではGo APIによるHttpOnly Cookie方式を推奨します。

### 2.3 日付形式

```text
YYYY-MM-DD
```

### 2.4 通貨・数値

- 金額は原則として円単位の整数または小数で保持する。
- パーセンテージは `0.1234` のような小数でAPI返却し、UIで `12.34%` 表示に変換する。

<a id="auth-api"></a>
## 3. 認証API

### 3.1 ユーザー登録

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

### 3.2 ログイン

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

### 3.3 ログアウト

```http
POST /api/auth/logout
```

Response:

```json
{
  "ok": true
}
```

### 3.4 自分のユーザー情報

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
## 4. 銘柄API

### 4.1 銘柄検索

```http
GET /api/stocks?query=toyota&market=prime&sector=transportation&limit=20
```

Response:

```json
{
  "items": [
    {
      "code": "7203",
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

### 4.2 銘柄詳細

```http
GET /api/stocks/{code}
```

Response:

```json
{
  "stock": {
    "code": "7203",
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

### 4.3 株価時系列

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

### 4.4 財務時系列

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
## 5. Watchlist API

### 5.1 Watchlist取得

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

### 5.2 Watchlist追加

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

### 5.3 Watchlist削除

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
## 6. AI分析レポートAPI

### 6.1 AI分析レポート生成

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
    "disclaimer": "このレポートは投資助言ではありません。",
    "inputDataVersion": "hash_...",
    "createdAt": "2026-06-06T12:00:00Z"
  }
}
```

### 6.2 分析履歴取得

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

### 6.3 分析レポート詳細

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
      "checkpoints": []
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
## 7. データ同期API

MVPでは管理者APIとして公開せず、バックエンド内部処理またはCLIで実行してもよいです。

### 7.1 銘柄データ更新

```http
POST /api/internal/sync/stocks
```

### 7.2 個別銘柄データ更新

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
## 8. エラー仕様

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
| 404 | STOCK_NOT_FOUND | 銘柄なし |
| 404 | REPORT_NOT_FOUND | レポートなし |
| 409 | WATCHLIST_ALREADY_EXISTS | Watchlist登録済み |
| 429 | RATE_LIMITED | レート制限 |
| 502 | MARKET_DATA_PROVIDER_ERROR | 外部データ取得失敗 |
| 503 | AI_PROVIDER_ERROR | AI生成失敗 |
| 500 | INTERNAL_ERROR | サーバー内部エラー |

<a id="validation"></a>
## 9. バリデーション

| 項目 | ルール |
| --- | --- |
| email | メール形式、最大255文字 |
| password | 8文字以上 |
| stock code | 数字4桁またはJ-Quantsの仕様に合わせたコード |
| query | 1文字以上、100文字以下 |
| limit | 1以上100以下 |
| from/to | `YYYY-MM-DD`、from <= to |
| language | `ja` または `en` |

