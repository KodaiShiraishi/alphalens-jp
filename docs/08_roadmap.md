# AlphaLens JP 実装ロードマップ

## 目次
- [1. 実装方針](#policy)
- [2. Phase 0: プロジェクト準備](#phase-0)
- [3. Phase 1: MVPコア](#phase-1)
- [4. Phase 2: J-Quants実連携とAI分析](#phase-2)
- [5. Phase 3: AWSデプロイ](#phase-3)
- [6. Phase 4: ポートフォリオ品質化](#phase-4)
- [7. 将来拡張](#future)
- [8. 優先順位付きBacklog](#backlog)

<a id="policy"></a>
## 1. 実装方針

最初から全部盛りにしないで、動くMVPを早く作ります。

優先順位:

1. 銘柄検索と詳細表示
2. 財務・株価データ表示
3. J-Quants実データ連携
4. AI分析レポート生成
5. Watchlistと履歴保存
6. AWS公開
7. テストとREADME整備

<a id="phase-0"></a>
## 2. Phase 0: プロジェクト準備

成果物:

- Monorepo作成
- Next.jsアプリ作成
- Node.js / TypeScript API作成
- PostgreSQL Docker Compose
- Drizzle ORM / drizzle-kit設定
- 基本README

候補ディレクトリ:

```text
alphalens-jp/
  frontend/
  backend/
  infra/
  docs/
  docker-compose.yml
  README.md
```

完了条件:

- フロントエンドが起動する。
- Node.js / TypeScript APIのhealth checkが動く。
- PostgreSQLに接続できる。
- Drizzle migrationを適用できる。

<a id="phase-1"></a>
## 3. Phase 1: MVPコア

実装内容:

- ユーザー登録/ログイン
- 銘柄マスタテーブル
- Mock Provider
- 銘柄検索API
- 銘柄詳細API
- 株価チャート
- 財務サマリ表示
- Watchlist

完了条件:

- Mockデータで主要画面が動く。
- ログインユーザーごとにWatchlistが保存される。
- API結合テストが通る。

<a id="phase-2"></a>
## 4. Phase 2: J-Quants実連携とAI分析

実装内容:

- J-Quants Provider実装
- 銘柄コード正規化
- 株価四本値取得
- 財務情報取得
- 外部API取得ログ
- Mockデータと実データの区別表示
- AIレポート生成API
- 構造化入力作成
- OpenAI Responses API連携
- Structured Outputs用JSON Schema実装
- プロンプト実装
- JSON Schema検証
- レポート保存
- 分析履歴画面
- 禁止表現チェック

完了条件:

- 代表銘柄のJ-Quants実データを取得できる。
- J-Quants APIキーがない環境でもMock Providerで同じ画面が動く。
- 代表銘柄でAIレポートが生成される。
- レポートに免責文が表示される。
- 投資助言表現を避けられる。
- 同じinput_hashのレポートを再利用できる。

<a id="phase-3"></a>
## 5. Phase 3: AWSデプロイ

実装内容:

- Dockerfile作成
- AWS CDK v2
- S3 + CloudFront
- RDS PostgreSQL
- ECS Fargate
- ALB
- Secrets Manager
- CloudWatch Logs
- GitHub Actions
- フロントエンド公開

完了条件:

- 公開URLでログインできる。
- APIがAWS上で動く。
- DBに保存できる。
- CloudWatchでログを確認できる。

<a id="phase-4"></a>
## 6. Phase 4: ポートフォリオ品質化

実装内容:

- README強化
- アーキテクチャ図
- ER図
- API仕様
- デモ動画またはスクリーンショット
- テスト結果掲載
- 既知の制約掲載
- 技術選定理由掲載

READMEに書くべき内容:

- なぜ作ったか
- 何を解決するか
- 技術構成
- AWS構成
- DB設計
- AI設計
- デモURL
- テスト方法
- 今後の改善

<a id="future"></a>
## 7. 将来拡張

- EDINET有価証券報告書連携
- 決算短信PDFのRAG
- 競合比較機能
- ニュース要約
- 業種別ランキング
- 米国株対応
- 暗号資産オンチェーン分析
- Nansen connector
- 非同期ジョブとWebSocket通知
- 課金機能

<a id="backlog"></a>
## 8. 優先順位付きBacklog

| 優先度 | タスク | 内容 |
| --- | --- | --- |
| P0 | リポジトリ作成 | frontend/backend/infra/docsを作る |
| P0 | DB接続 | PostgreSQL、Drizzle ORM、drizzle-kit migrationを用意 |
| P0 | Health Check | `/api/health` を実装 |
| P0 | CSRF基盤 | `/api/auth/csrf` とDouble Submit Cookieを実装 |
| P0 | Mock Provider | 実APIなしで開発できるようにする |
| P0 | 銘柄検索 | 検索APIと画面 |
| P0 | 銘柄詳細 | 財務・株価を表示 |
| P1 | 認証 | 登録、ログイン、ログアウト |
| P1 | J-Quants実連携 | APIキー取得後にProvider実装 |
| P1 | Watchlist | 追加、削除、一覧 |
| P1 | AIレポート | 生成、保存、履歴 |
| P1 | APIテスト | 主要APIの結合テスト |
| P2 | AWSデプロイ | CDKでS3/CloudFront/ALB/ECS/RDS/Secrets/CloudWatch |
| P2 | CI/CD | GitHub Actions |
| P2 | README整備 | 採用向け説明を強化 |
| P3 | EDINET連携 | 有報データ拡張 |
| P3 | RAG | PDF/テキストの根拠引用 |
