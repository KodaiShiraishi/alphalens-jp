# AlphaLens JP インフラ設計書

## 目次
- [1. インフラ方針](#policy)
- [2. AWS構成](#aws-architecture)
- [3. 環境構成](#environments)
- [4. ネットワーク](#network)
- [5. デプロイ方式](#deploy)
- [6. Secrets管理](#secrets)
- [7. 監視・ログ](#monitoring)
- [8. コスト管理](#cost)
- [9. IaC方針](#iac)

<a id="policy"></a>
## 1. インフラ方針

MVPでは、実装速度とAWSアピールのバランスを取ります。ローカルではDocker Compose、本番ではAWSにデプロイします。

優先順位:

1. 公開URLでデモできる
2. API、DB、外部API連携、AI生成が動く
3. ログとエラーを確認できる
4. AWS SAAの知識を構成図で説明できる
5. コストを抑える

<a id="aws-architecture"></a>
## 2. AWS構成

```mermaid
flowchart TB
  User["User"] --> CF["CloudFront"]
  CF --> FE["S3 Static Frontend Origin"]
  CF -->|"/api/*"| ALB["Application Load Balancer"]
  ALB --> ECS["ECS Fargate: Node.js API"]
  ECS --> RDS["RDS PostgreSQL"]
  ECS --> JQ["J-Quants API"]
  ECS --> OpenAI["OpenAI Responses API"]
  ECS --> CW["CloudWatch"]
  Secrets["Secrets Manager"] --> ECS
```

将来拡張:

```mermaid
flowchart TB
  ECS["ECS Fargate: Node.js API"] --> SQS["SQS"]
  SQS --> Worker["ECS Fargate Worker"]
  Worker --> RDS
  Worker --> JQ["J-Quants API"]
  Worker --> OpenAI["OpenAI Responses API"]
  EventBridge["EventBridge Scheduler"] --> SQS
  Worker --> CW["CloudWatch"]
  Secrets["Secrets Manager"] --> Worker
```

MVPではWorker、SQS、EventBridgeを省略し、Node.js / TypeScript API内で同期的にAIレポート生成します。ただし、コード上は後からWorkerに切り出せるようにサービス層を分離します。

<a id="environments"></a>
## 3. 環境構成

| 環境 | 用途 | 構成 |
| --- | --- | --- |
| local | 開発 | Docker Compose、PostgreSQL、Mock Provider |
| staging | 動作確認 | AWS最小構成、本番相当の環境変数 |
| production | 公開デモ | AWS公開URL、監視あり |

ポートフォリオではstagingとproductionを分けなくてもよいですが、READMEには本来の分離方針を書きます。

<a id="network"></a>
## 4. ネットワーク

MVP採用構成:

- VPCを作成する。
- Public SubnetにALBを配置する。
- Public SubnetにECS Taskを配置し、Public IPでJ-Quants APIとOpenAI APIへ outbound 接続する。
- Private SubnetにRDSを配置する。
- Security GroupでECS Taskへの inbound はALBからの通信だけ許可する。

本来の商用運用構成:

- ECS TaskはPrivate Subnetに置き、外部APIへの通信はNAT Gateway経由にする。
- READMEでは、MVPではコスト削減のためPublic Subnet構成、本来はPrivate Subnet + NAT Gatewayにする理由を説明する。

<a id="deploy"></a>
## 5. デプロイ方式

### 5.1 Frontend

採用:

- Next.jsは静的exportできるSPA寄りの構成にし、S3 + CloudFrontで配信する。
- CloudFrontで `/api/*` をALBへルーティングし、フロントエンドとAPIを同一ドメインにする。
- MVPではVercelやAmplify Hostingは採用しない。別site構成にするとCookie、CORS、CSRF設計が増えるためです。

### 5.2 Backend

採用:

- Node.js / TypeScript APIはECS Fargateでコンテナ化する。
- Docker、ALB、RDS、CloudWatchを説明できるため、フルスタック/AWSポートフォリオとして見栄えがよい。
- MVPではLambda + API Gatewayは採用しない。Fastifyの常駐API、Cookie認証、DB接続管理を素直に扱うためECSを優先する。

### 5.3 Database

- RDS PostgreSQLを使用する。
- 個人開発MVPでは小さいインスタンスを使う。
- 開発環境はDocker ComposeのPostgreSQLでよい。

<a id="secrets"></a>
## 6. Secrets管理

管理対象:

- DB接続情報
- J-Quants APIキー
- OpenAI APIキー
- Cookie署名キー

管理方針:

- ローカルは `.env.local` を使用し、Git管理しない。
- AWSはSecrets ManagerまたはSSM Parameter Storeを使用する。
- フロントエンドに外部APIキーを渡さない。

<a id="monitoring"></a>
## 7. 監視・ログ

CloudWatch Logsに出力するログ:

- APIリクエスト
- 外部API呼び出し
- AI生成処理
- エラー
- 処理時間

アラーム候補:

- 5xxエラー率
- AI生成失敗率
- 外部API 429回数
- RDS CPU使用率
- ECS Task停止

<a id="cost"></a>
## 8. コスト管理

コストを抑える方針:

- まずは小さいRDSインスタンスを使う。
- 開発中は不要な環境を停止する。
- AIレポート生成はキャッシュする。
- J-QuantsやOpenAI APIのレート制限と利用量をログで確認する。
- S3保存は必要最小限にする。

MVPの目標コスト:

- 月額数千円から1万円台を目安にする。ALB、RDS、NAT Gatewayは固定費が出やすいため、デプロイ前に見積もる。
- NAT Gatewayはコストが上がりやすいため、MVP段階では採用可否を慎重に判断する。

<a id="iac"></a>
## 9. IaC方針

IaCはAWS CDK v2をTypeScriptで実装します。

採用理由:

- アプリ本体と同じTypeScriptで書けるため、学習対象が一貫する。
- ECS、ALB、RDS、CloudFront、S3、Secrets、CloudWatchをコードで説明しやすい。
- Terraformは将来の選択肢とし、MVPでは採用しない。

MVPでは次をIaC化します。

- VPC
- ECS Cluster
- ECS Service
- ALB
- RDS
- Secrets
- CloudWatch Logs
- Frontend hosting

将来拡張では次を追加します。

- S3 artifact bucket
- SQS
- EventBridge
- Worker service
