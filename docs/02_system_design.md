# AlphaLens JP 基本設計書

## 目次
- [1. システム概要](#overview)
- [2. 全体アーキテクチャ](#architecture)
- [3. コンポーネント構成](#components)
- [4. 画面設計](#screens)
- [5. データフロー](#data-flow)
- [6. 認証・認可](#auth)
- [7. 外部API連携](#external-api)
- [8. エラー設計](#error-design)
- [9. セキュリティ設計](#security)
- [10. ログ・監視](#logging)

<a id="overview"></a>
## 1. システム概要

AlphaLens JPは、Next.jsフロントエンド、Node.js / TypeScriptバックエンド、PostgreSQL、AWS基盤で構成するWebアプリケーションです。

外部データソースから日本株データを取得し、DBにキャッシュします。ユーザーはブラウザから銘柄を検索し、財務・株価・AI分析を確認します。

TypeScript学習とバックエンド設計の見せ方を優先するため、MVPのAPIはNext.js API Routesに寄せず、`backend/` 配下の独立したNode.js / TypeScript APIとして実装します。APIフレームワークはFastify、DBアクセスはDrizzle ORM、マイグレーションはdrizzle-kitを採用します。

<a id="architecture"></a>
## 2. 全体アーキテクチャ

### 2.1 MVP構成

```mermaid
flowchart LR
  User["User Browser"] --> FE["Next.js Frontend"]
  FE --> API["Node.js / TypeScript REST API"]
  API --> DB["PostgreSQL"]
  API --> JQ["J-Quants API"]
  API --> OpenAI["OpenAI Responses API"]
  API --> CW["CloudWatch Logs"]
```

MVPでは、J-Quants取得、OpenAIレポート生成、DB保存をNode.js / TypeScript API内のサービス層で同期的に実行します。非同期Worker、SQS、WebSocket通知はMVPでは実装しません。

### 2.2 将来構成

```mermaid
flowchart LR
  User["User Browser"] --> FE["Next.js Frontend"]
  FE --> API["Node.js / TypeScript REST API"]
  API --> DB["PostgreSQL"]
  API --> Queue["SQS / Job Queue"]
  Queue --> Worker["Data & AI Worker"]
  Worker --> DB
  Worker --> JQ["J-Quants API"]
  Worker --> OpenAI["OpenAI Responses API"]
  Worker --> S3["S3"]
  API --> CW["CloudWatch Logs"]
  Worker --> CW
```

将来構成では、データ更新、AIレポート生成、リトライ処理をWorkerへ切り出します。MVP段階では同期APIとして実装しますが、Provider層、AI入力作成、レポート保存処理はWorkerへ移せる粒度で分離します。

<a id="components"></a>
## 3. コンポーネント構成

| コンポーネント | 技術 | 責務 |
| --- | --- | --- |
| Frontend | Next.js / TypeScript | 画面、フォーム、チャート、API呼び出し |
| Backend API | Node.js / TypeScript、Fastify、Drizzle ORM | REST API、認証、DBアクセス、外部API連携制御 |
| Worker | Node.js / TypeScript | 将来拡張。データ同期、AIレポート生成、再試行 |
| Database | PostgreSQL | ユーザー、銘柄、株価、財務、分析履歴を保存 |
| Object Storage | S3 | 将来拡張。PDF、CSV、分析スナップショット保存 |
| Queue | SQS | 将来拡張。非同期ジョブ管理 |
| Scheduler | EventBridge | 将来拡張。定期データ更新 |
| Monitoring | CloudWatch | ログ、メトリクス、アラーム |

<a id="screens"></a>
## 4. 画面設計

### 4.1 Dashboard

表示項目:

- Watchlist
- 最近分析した銘柄
- AI分析生成状態
- 直近のデータ更新日時

### 4.2 Stock Search

表示項目:

- 検索入力
- 業種フィルター
- 市場フィルター
- 検索結果テーブル

検索結果テーブル:

| 項目 | 内容 |
| --- | --- |
| 銘柄コード | 例: 7203 |
| 企業名 | 例: トヨタ自動車 |
| 市場 | Prime / Standard / Growth |
| 業種 | 33業種名 |
| アクション | 詳細、Watchlist追加 |

### 4.3 Company Detail

表示項目:

- 企業基本情報
- 株価チャート
- 財務サマリカード
- 財務推移グラフ
- AI分析生成ボタン
- 最新AIレポート

### 4.4 AI Report

表示項目:

- 成長性
- 収益性
- 安全性
- 懸念点
- 追加で確認すべき点
- 利用データ
- 免責文

### 4.5 Analysis History

表示項目:

- 過去レポート一覧
- 対象銘柄
- 生成日時
- 使用データ期間
- レポート詳細

<a id="data-flow"></a>
## 5. データフロー

### 5.1 銘柄検索

```mermaid
sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant API as Node.js API
  participant DB as PostgreSQL

  U->>FE: 銘柄検索
  FE->>API: GET /api/stocks?query=...
  API->>DB: stocks検索
  DB-->>API: 検索結果
  API-->>FE: JSON
  FE-->>U: 検索結果表示
```

### 5.2 銘柄詳細表示

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant API as Node.js API
  participant DB as PostgreSQL
  participant JQ as J-Quants

  FE->>API: GET /api/stocks/{code}
  API->>DB: 銘柄/財務/株価を取得
  alt データ不足または古い
    API->>JQ: データ取得
    JQ-->>API: 外部データ
    API->>DB: キャッシュ保存
  end
  API-->>FE: 企業詳細データ
```

### 5.3 AIレポート生成

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant API as Node.js API
  participant DB as PostgreSQL
  participant OpenAI as OpenAI Responses API

  FE->>API: POST /api/stocks/{code}/analysis-reports
  API->>DB: 財務/株価/企業情報を取得
  API->>OpenAI: 構造化データとJSON Schemaを渡す
  OpenAI-->>API: Structured Outputs形式の分析レポート
  API->>DB: レポート保存
  API-->>FE: レポート返却
```

<a id="auth"></a>
## 6. 認証・認可

MVPでは、Node.js / TypeScript APIでメール/パスワード認証を実装し、HttpOnly Cookieで不透明なセッショントークンを発行します。

認証方針:

- セッション実体は `sessions` テーブルで管理する。
- セッションCookie名は本番では `__Host-al_session`、ローカルHTTP開発では `al_session` とし、DB保存済みトークンの生値を入れる。DBにはハッシュのみ保存する。
- 本番のセッションCookieは `HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/` を設定し、`Domain` は指定しない。ローカルHTTP開発では `al_session` に限り `Secure` を無効化する。
- 本番ではCloudFrontの同一ドメイン配下にフロントエンドと `/api/*` を配置する。Vercelなど別site構成はMVPでは採用しない。
- 状態変更APIはDouble Submit Cookie方式で保護する。APIはJavaScriptから読める `al_csrf` Cookieを発行し、フロントエンドは同じ値を `X-CSRF-Token` ヘッダーで送る。
- ログイン、登録、ログアウトを含む状態変更APIはCSRFトークンを必須とする。

認可方針:

- Watchlist、分析履歴、ユーザー設定は本人のみ参照可能
- 銘柄、株価、財務データは全ユーザー共通
- 管理者機能はMVPでは実装しない

<a id="external-api"></a>
## 7. 外部API連携

外部APIは次のインターフェースで抽象化します。

```ts
type ProviderRequestOptions = {
  signal?: AbortSignal;
};

interface MarketDataProvider {
  normalizeCode(input: string, options?: ProviderRequestOptions): Promise<StockCode>;
  searchStocks(query: StockSearchQuery, options?: ProviderRequestOptions): Promise<Stock[]>;
  getStockProfile(code: string, options?: ProviderRequestOptions): Promise<StockProfile | null>;
  getDailyPrices(code: string, from: Date, to: Date, options?: ProviderRequestOptions): Promise<DailyPrice[]>;
  getFinancialStatements(code: string, options?: ProviderRequestOptions): Promise<FinancialStatement[]>;
}
```

`StockCode` は、ユーザー向けの `display_code` と外部API向けの `provider_code` を持ちます。J-Quantsでは4桁入力と5桁コードが混在しうるため、API境界で正規化します。

外部APIの生レスポンスはMVPではDBへ保存しません。DBには画面表示とAI入力に必要な正規化済みデータ、取得日時、provider名、リクエスト識別子、失敗ログのみ保存します。利用規約上の保存可否を確認できた場合だけ、生レスポンス保存を将来拡張として検討します。

実装候補:

- `JQuantsProvider`: J-Quants APIを呼び出す
- `MockMarketDataProvider`: ローカル開発とテスト用
- `EdinetProvider`: 将来の有価証券報告書連携用

<a id="error-design"></a>
## 8. エラー設計

| エラー | APIレスポンス | UI表示 |
| --- | --- | --- |
| 認証なし | 401 | ログイン画面へ誘導 |
| 権限なし | 403 | 権限がない旨を表示 |
| 銘柄なし | 404 | 銘柄が見つからない |
| 外部API制限 | 429 | 時間を置いて再試行 |
| 外部API失敗 | 502 | データ取得に失敗 |
| AI生成失敗 | 503 | レポート生成に失敗 |
| バリデーション | 400 | 入力エラーを表示 |

<a id="security"></a>
## 9. セキュリティ設計

- 外部APIキーはフロントエンドに渡さない。
- パスワードはハッシュ化する。
- Cookieを使う場合はHttpOnly、Secure、SameSiteを設定する。
- CORSはフロントエンドの本番ドメインだけ許可する。
- APIリクエストにレート制限を設ける。
- AIプロンプトにはユーザー入力をそのまま命令として扱わない。
- ログにAPIキー、パスワード、個人情報を出力しない。

<a id="logging"></a>
## 10. ログ・監視

記録するログ:

- APIリクエストID
- ユーザーID
- 銘柄コード
- 外部API呼び出し結果
- AI生成結果のステータス
- エラーコード
- 処理時間

メトリクス:

- APIレスポンスタイム
- 外部API失敗率
- AI生成失敗率
- レポート生成数
- Watchlist登録数
