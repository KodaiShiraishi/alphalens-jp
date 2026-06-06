# AlphaLens JP テスト設計書

## 目次
- [1. テスト方針](#policy)
- [2. テスト対象](#targets)
- [3. 単体テスト](#unit-tests)
- [4. API結合テスト](#api-tests)
- [5. フロントエンドテスト](#frontend-tests)
- [6. 外部API連携テスト](#provider-tests)
- [7. AI機能テスト](#ai-tests)
- [8. E2Eテスト](#e2e-tests)
- [9. スモークテスト](#smoke-tests)
- [10. テストデータ](#test-data)

<a id="policy"></a>
## 1. テスト方針

MVPでは、全機能を広く浅くテストするより、採用で説明しやすい重要導線を確実に検証します。

重点:

- 認証
- CSRF対策
- 銘柄検索
- 銘柄コード正規化
- 銘柄詳細
- Watchlist
- J-Quants Provider / Mock Provider切り替え
- AIレポート生成
- 外部API失敗時のハンドリング

<a id="targets"></a>
## 2. テスト対象

| 種別 | 対象 | ツール候補 |
| --- | --- | --- |
| 単体 | Go service、計算ロジック | Go test |
| API結合 | REST API | Go test、httptest |
| フロント | UI component | Vitest、Testing Library |
| E2E | 主要導線 | Playwright |
| AI評価 | OpenAI Responses APIのStructured Outputs検証、固定入力の出力検証 | Go test、JSON Schema |
| インフラ | IaC構文、デプロイ後確認 | Terraform validate、curl |

<a id="unit-tests"></a>
## 3. 単体テスト

### 3.1 財務指標計算

| ケース | 入力 | 期待値 |
| --- | --- | --- |
| 売上成長率 | 前期100、当期120 | 0.2 |
| 営業利益率 | 売上100、営業利益10 | 0.1 |
| EPSなし | EPS null | PER未計算 |
| BPSなし | BPS null | PBR未計算 |
| 前期売上0 | 前期0、当期100 | 売上成長率未計算 |

### 3.2 認証

- パスワードハッシュが平文と一致しない。
- 正しいパスワードでログインできる。
- 間違ったパスワードでログインできない。
- 期限切れセッションは無効。

### 3.3 Watchlist

- Watchlistに追加できる。
- 同じ銘柄を重複登録できない。
- 他ユーザーのWatchlistを取得できない。
- Watchlistから削除できる。

<a id="api-tests"></a>
## 4. API結合テスト

| API | テスト |
| --- | --- |
| `POST /api/auth/register` | 登録できる、重複メールは409 |
| `POST /api/auth/login` | ログインできる、失敗時401 |
| state-changing APIs | CSRFトークンなしのリクエストは403 |
| `GET /api/stocks` | 検索できる、limitが効く |
| `GET /api/stocks` | 4桁入力と5桁provider codeを正規化できる |
| `GET /api/stocks/{code}` | 詳細を取得できる、存在しない銘柄は404 |
| `GET /api/stocks/{code}/prices` | 日付範囲で取得できる |
| `GET /api/stocks/{code}/financials` | 財務時系列を取得できる |
| `POST /api/watchlist` | 認証済みユーザーが追加できる |
| `POST /api/stocks/{code}/analysis-reports` | AIレポートを生成できる |

<a id="frontend-tests"></a>
## 5. フロントエンドテスト

重点コンポーネント:

- 検索フォーム
- 検索結果テーブル
- 株価チャート
- 財務サマリカード
- AIレポート表示
- Watchlistボタン

確認内容:

- ローディング状態が表示される。
- エラー状態が表示される。
- データなし状態が表示される。
- スマホ幅でレイアウトが崩れない。

<a id="provider-tests"></a>
## 6. 外部API連携テスト

外部APIは本番APIを直接叩くテストと、Mock Providerのテストを分けます。

### 6.1 Mock Provider

- 正常レスポンスを返す。
- 404相当を返す。
- 429相当を返す。
- タイムアウトを返す。
- 欠損値を含む財務データを返す。
- 4桁入力と5桁provider codeの混在ケースを返す。

### 6.2 実APIスモーク

実APIスモークはCIで毎回実行しません。手動またはスケジュール実行にします。

確認項目:

- APIキーが有効。
- 代表銘柄の銘柄情報を取得できる。
- 日足データを取得できる。
- 財務データを取得できる。
- J-Quants APIキーがない環境ではMock Providerへ切り替えられる。

<a id="ai-tests"></a>
## 7. AI機能テスト

### 7.1 JSON Schema検証

OpenAI Responses APIのStructured Outputsを使い、AI出力が次を満たすか確認します。

- 必須フィールドが存在する。
- `risks` と `checkpoints` は配列。
- `evidence` は配列。
- `disclaimer` が存在する。
- JSONとしてパースできる。
- OpenAIの拒否応答や不完全出力を保存せず、エラーとして扱う。

### 7.2 禁止表現チェック

次の表現が含まれる場合は警告対象です。

- 買い推奨
- 売り推奨
- 目標株価
- 必ず上がる
- 投資すべき
- 利益保証

### 7.3 固定入力評価

固定入力で以下を検証します。

| ケース | 期待 |
| --- | --- |
| 成長企業 | 成長性に触れる |
| 赤字企業 | 収益性リスクに触れる |
| 自己資本比率低下 | 安全性リスクに触れる |
| 財務データ欠損 | `dataLimitations` に欠損を書く |
| 株価データ欠損 | 株価分析を断定しない |
| OpenAI拒否応答 | レポートを保存せず、ユーザーに生成失敗を表示する |

<a id="e2e-tests"></a>
## 8. E2Eテスト

Playwrightで確認する主要導線:

1. ユーザー登録
2. ログイン
3. 銘柄検索
4. 銘柄詳細へ遷移
5. Watchlist追加
6. データソース表示がMock/J-Quantsのどちらか分かる
7. AIレポート生成
8. 分析履歴で確認
9. ログアウト

<a id="smoke-tests"></a>
## 9. スモークテスト

本番デプロイ後に確認する項目:

- フロントエンドURLが200を返す。
- API health checkが200を返す。
- 未認証で保護APIが401を返す。
- ログインできる。
- 銘柄検索できる。
- AIレポート生成できる。
- CloudWatch Logsにエラーが出ていない。

<a id="test-data"></a>
## 10. テストデータ

MVPでは、実APIが使えない環境でも動くようにサンプルデータを用意します。

サンプル銘柄:

- 大型株
- 中小型株
- 赤字企業
- 財務データ欠損企業
- 株価データ欠損ケース

サンプルデータは `backend/testdata` または `fixtures` にJSONで保存します。実データを使う場合は、外部APIの利用規約に従って保存可否を確認してください。
