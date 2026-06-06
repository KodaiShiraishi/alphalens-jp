# AlphaLens JP 設計ドキュメント

## 目次
- [1. プロジェクト概要](#overview)
- [2. ドキュメント構成](#documents)
- [3. MVPの結論](#mvp-summary)
- [4. 採用向けアピール軸](#career-points)
- [5. 実装時のCodex向け指示](#codex-instructions)
- [6. 参照データソース](#sources)

<a id="overview"></a>
## 1. プロジェクト概要

AlphaLens JPは、日本株の財務データ・株価データ・企業情報を統合し、AIがファンダメンタルズ調査レポートを生成するSaaSです。

目的は「投資助言」ではなく、企業調査に必要な情報収集・整理・比較を効率化することです。ユーザーは銘柄を検索し、財務指標・株価推移・AI分析レポート・Watchlistを通じて、調査メモを継続的に管理できます。

<a id="documents"></a>
## 2. ドキュメント構成

- [docs/01_requirements.md](./docs/01_requirements.md): 要件定義、MVP範囲、ユーザーストーリー、非機能要件
- [docs/02_system_design.md](./docs/02_system_design.md): システム構成、画面、データフロー、セキュリティ方針
- [docs/03_api_design.md](./docs/03_api_design.md): REST API設計、リクエスト/レスポンス、エラー仕様
- [docs/04_db_design.md](./docs/04_db_design.md): DB設計、ER図、テーブル定義、インデックス
- [docs/05_ai_design.md](./docs/05_ai_design.md): AI分析機能、プロンプト、ガードレール、評価方針
- [docs/06_infra_design.md](./docs/06_infra_design.md): AWS構成、CI/CD、監視、コスト管理
- [docs/07_test_design.md](./docs/07_test_design.md): テスト設計、結合テスト、AI評価、スモークテスト
- [docs/08_roadmap.md](./docs/08_roadmap.md): 実装ロードマップ、優先順位、将来拡張

<a id="mvp-summary"></a>
## 3. MVPの結論

MVPでは次を作ります。

- 日本株の銘柄検索
- 銘柄詳細ページ
- 企業基本情報の表示
- 株価推移の表示
- 財務サマリの表示
- AIファンダメンタルズ分析レポート生成
- Watchlist登録
- 分析履歴保存
- ログイン
- AWS上へのデプロイ

MVPでは次を作りません。

- 売買推奨
- 株価予測
- 証券口座連携
- 自動売買
- リアルタイム株価
- 高度なポートフォリオ管理
- 有料課金機能

<a id="career-points"></a>
## 4. 採用向けアピール軸

このプロジェクトで見せる技術要素は次です。

- フロントエンド: Next.js、TypeScript、ダッシュボードUI、チャート、フォーム
- バックエンド: Go API、外部API連携、認証、集計処理、非同期処理
- DB: PostgreSQL、財務時系列データ、分析履歴、Watchlist
- AI: 根拠データ付きレポート生成、プロンプト設計、出力検証
- AWS: ECS/Fargate、RDS、S3、SQS、EventBridge、CloudWatch
- 運用: GitHub Actions、IaC、ログ、メトリクス、エラー監視

面接では「株価を当てるアプリ」ではなく、「企業調査の情報収集と分析を効率化するデータSaaS」と説明します。

<a id="codex-instructions"></a>
## 5. 実装時のCodex向け指示

Codexが実装に入るときは、次の順で読んでください。

1. `README.md`
2. `01_requirements.md`
3. `02_system_design.md`
4. `04_db_design.md`
5. `03_api_design.md`
6. `05_ai_design.md`
7. `06_infra_design.md`
8. `07_test_design.md`
9. `08_roadmap.md`

実装判断で迷った場合は、MVP範囲を優先してください。投資助言、株価予測、自動売買につながる機能はMVPに入れません。

外部APIの仕様は変更される可能性があるため、実装前にJ-Quants APIの現行仕様を確認してください。J-Quants APIはV2移行が進んでいるため、V1前提で実装しないでください。

<a id="sources"></a>
## 6. 参照データソース

- J-Quants API: https://www.jpx.co.jp/markets/other-data-services/j-quants-api/index.html
- J-Quants API docs: https://jpx.gitbook.io/j-quants-ja/api-reference
- J-Quants API client: https://github.com/J-Quants/jquants-api-client-python
- EDINET API catalog: https://api-catalog.e-gov.go.jp/info/ja/apicatalog/view/33
- EDINET DB API: https://edinetdb.jp/docs/api
