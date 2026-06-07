import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CfnOutput,
  Duration,
  IgnoreMode,
  RemovalPolicy,
  Stack,
  type StackProps
} from "aws-cdk-lib";
import {
  Distribution,
  OriginProtocolPolicy,
  ViewerProtocolPolicy,
  CachePolicy,
  AllowedMethods,
  OriginRequestPolicy
} from "aws-cdk-lib/aws-cloudfront";
import { LoadBalancerV2Origin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import {
  Cluster,
  ContainerImage,
  FargateTaskDefinition,
  LogDrivers,
  Protocol,
  Secret as EcsSecret
} from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { InstanceClass, InstanceSize, InstanceType, Port, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, PostgresEngineVersion } from "aws-cdk-lib/aws-rds";
import { Bucket, BlockPublicAccess, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Secret, type ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..", "..");
const allowedMarketDataProviders = ["mock", "jquants"] as const;
const allowedAiProviders = ["mock", "openai"] as const;
const allowedJQuantsApiVersions = ["v2", "v1"] as const;

export class AlphaLensStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: SubnetType.PUBLIC },
        { name: "private", subnetType: SubnetType.PRIVATE_ISOLATED }
      ]
    });

    const frontendBucket = new Bucket(this, "FrontendBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const dbSecret = new Secret(this, "DatabaseSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "alphalens" }),
        generateStringKey: "password",
        excludePunctuation: true
      }
    });

    const dbSecurityGroup = new SecurityGroup(this, "DbSecurityGroup", { vpc });
    const appSecurityGroup = new SecurityGroup(this, "AppSecurityGroup", {
      vpc,
      allowAllOutbound: true
    });
    dbSecurityGroup.addIngressRule(appSecurityGroup, Port.tcp(5432), "API to PostgreSQL");

    const database = new DatabaseInstance(this, "Postgres", {
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_16_3 }),
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      allocatedStorage: 20,
      credentials: Credentials.fromSecret(dbSecret),
      databaseName: "alphalens",
      removalPolicy: RemovalPolicy.SNAPSHOT,
      backupRetention: Duration.days(7),
      publiclyAccessible: false
    });

    const cluster = new Cluster(this, "Cluster", { vpc });
    const task = new FargateTaskDefinition(this, "ApiTask", {
      cpu: 512,
      memoryLimitMiB: 1024
    });
    const sessionSecret = new Secret(this, "SessionSecret", {
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true
      }
    });
    const marketDataProvider = enumContext(this, "marketDataProvider", allowedMarketDataProviders, "mock");
    const aiProvider = enumContext(this, "aiProvider", allowedAiProviders, "mock");
    const registrationEnabled = enumContext(this, "registrationEnabled", ["true", "false"] as const, "true");
    const registerRateLimitMax = contextString(this, "registerRateLimitMax") ?? "10";
    const registerRateLimitTimeWindow = contextString(this, "registerRateLimitTimeWindow") ?? "1 minute";
    const jquantsApiVersion = enumContext(this, "jquantsApiVersion", allowedJQuantsApiVersions, "v2");
    const jquantsApiBaseUrl =
      contextString(this, "jquantsApiBaseUrl") ??
      (jquantsApiVersion === "v2" ? "https://api.jquants.com/v2" : "https://api.jquants.com/v1");
    const openAiModel = contextString(this, "openAiModel") ?? "gpt-5-mini";
    const containerEnvironment: Record<string, string> = {
      NODE_ENV: "production",
      RUN_MIGRATIONS_ON_START: "true",
      REGISTRATION_ENABLED: registrationEnabled,
      REGISTER_RATE_LIMIT_MAX: registerRateLimitMax,
      REGISTER_RATE_LIMIT_TIME_WINDOW: registerRateLimitTimeWindow,
      COOKIE_SECURE: "true",
      MARKET_DATA_PROVIDER: marketDataProvider,
      MARKET_DATA_MAX_RETRIES: "2",
      MARKET_DATA_RETRY_DELAY_MS: "250",
      JQUANTS_API_VERSION: jquantsApiVersion,
      JQUANTS_API_BASE_URL: jquantsApiBaseUrl,
      AI_PROVIDER: aiProvider,
      OPENAI_MODEL: openAiModel,
      DATABASE_HOST: database.dbInstanceEndpointAddress,
      DATABASE_PORT: database.dbInstanceEndpointPort,
      DATABASE_NAME: "alphalens",
      DATABASE_USER: "alphalens"
    };
    const containerSecrets: Record<string, EcsSecret> = {
      SESSION_SECRET: EcsSecret.fromSecretsManager(sessionSecret),
      DATABASE_PASSWORD: EcsSecret.fromSecretsManager(dbSecret, "password")
    };

    if (marketDataProvider === "jquants") {
      if (jquantsApiVersion === "v2") {
        containerSecrets.JQUANTS_API_KEY = EcsSecret.fromSecretsManager(
          importedSecret(this, "JQuantsApiKeySecret", "jquantsApiKeySecretArn", "jquantsApiKeySecretName")
        );
      } else {
        containerSecrets.JQUANTS_EMAIL = EcsSecret.fromSecretsManager(
          importedSecret(this, "JQuantsEmailSecret", "jquantsEmailSecretArn", "jquantsEmailSecretName")
        );
        containerSecrets.JQUANTS_PASSWORD = EcsSecret.fromSecretsManager(
          importedSecret(this, "JQuantsPasswordSecret", "jquantsPasswordSecretArn", "jquantsPasswordSecretName")
        );
      }
    }

    if (aiProvider === "openai") {
      containerSecrets.OPENAI_API_KEY = EcsSecret.fromSecretsManager(
        importedSecret(this, "OpenAiApiKeySecret", "openAiApiKeySecretArn", "openAiApiKeySecretName")
      );
    }

    const container = task.addContainer("Api", {
      image: ContainerImage.fromAsset(repoRoot, {
        file: path.join("backend", "Dockerfile"),
        ignoreMode: IgnoreMode.GLOB,
        exclude: [
          "node_modules/**",
          "**/node_modules/**",
          "backend/dist/**",
          "frontend/.next/**",
          "frontend/out/**",
          "infra/dist/**",
          "cdk.out/**",
          ".git/**",
          ".env",
          ".env.*",
          "*.log",
          "**/*.tsbuildinfo"
        ]
      }),
      logging: LogDrivers.awsLogs({ streamPrefix: "alphalens-api" }),
      environment: containerEnvironment,
      secrets: containerSecrets
    });
    container.addPortMappings({ containerPort: 4000, protocol: Protocol.TCP });

    const service = new ApplicationLoadBalancedFargateService(this, "ApiService", {
      cluster,
      taskDefinition: task,
      publicLoadBalancer: true,
      assignPublicIp: true,
      securityGroups: [appSecurityGroup],
      taskSubnets: { subnetType: SubnetType.PUBLIC },
      desiredCount: 1,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      listenerPort: 80,
      healthCheckGracePeriod: Duration.seconds(60)
    });
    service.targetGroup.configureHealthCheck({
      path: "/api/health",
      healthyHttpCodes: "200"
    });
    new Alarm(this, "AlbTarget5xxAlarm", {
      alarmDescription: "AlphaLens API target 5xx responses exceeded the MVP threshold.",
      metric: new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HTTPCode_Target_5XX_Count",
        dimensionsMap: {
          LoadBalancer: service.loadBalancer.loadBalancerFullName,
          TargetGroup: service.targetGroup.targetGroupFullName
        },
        statistic: "Sum",
        period: Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING
    });
    new Alarm(this, "AlbTargetResponseTimeAlarm", {
      alarmDescription: "AlphaLens API target response time is above the MVP target.",
      metric: new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "TargetResponseTime",
        dimensionsMap: {
          LoadBalancer: service.loadBalancer.loadBalancerFullName,
          TargetGroup: service.targetGroup.targetGroupFullName
        },
        statistic: "Average",
        period: Duration.minutes(5)
      }),
      threshold: 2,
      evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING
    });
    new Alarm(this, "RdsCpuAlarm", {
      alarmDescription: "AlphaLens RDS CPU utilization is high.",
      metric: database.metricCPUUtilization({
        statistic: "Average",
        period: Duration.minutes(5)
      }),
      threshold: 80,
      evaluationPeriods: 3,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING
    });
    new Alarm(this, "EcsRunningTaskAlarm", {
      alarmDescription: "AlphaLens ECS service has no running API task.",
      metric: new Metric({
        namespace: "AWS/ECS",
        metricName: "RunningTaskCount",
        dimensionsMap: {
          ClusterName: cluster.clusterName,
          ServiceName: service.service.serviceName
        },
        statistic: "Average",
        period: Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING
    });

    const distribution = new Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      additionalBehaviors: {
        "api/*": {
          origin: new LoadBalancerV2Origin(service.loadBalancer, {
            protocolPolicy: OriginProtocolPolicy.HTTP_ONLY
          }),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
        }
      }
    });

    new BucketDeployment(this, "FrontendDeployment", {
      sources: [Source.asset(path.join(repoRoot, "frontend", "out"))],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ["/*"]
    });

    new CfnOutput(this, "FrontendBucketName", { value: frontendBucket.bucketName });
    new CfnOutput(this, "DistributionDomainName", { value: distribution.distributionDomainName });
  }
}

function contextString(scope: Construct, key: string): string | undefined {
  const value = scope.node.tryGetContext(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function enumContext<const T extends readonly string[]>(
  scope: Construct,
  key: string,
  allowed: T,
  defaultValue: T[number]
): T[number] {
  const value = contextString(scope, key) ?? defaultValue;
  if ((allowed as readonly string[]).includes(value)) return value as T[number];
  throw new Error(`Invalid CDK context ${key}=${value}. Allowed values: ${allowed.join(", ")}`);
}

function importedSecret(scope: Construct, id: string, arnContextKey: string, nameContextKey: string): ISecret {
  const arn = contextString(scope, arnContextKey);
  if (arn) return Secret.fromSecretCompleteArn(scope, id, arn);
  const name = contextString(scope, nameContextKey);
  if (name) return Secret.fromSecretNameV2(scope, id, name);
  throw new Error(`Missing CDK context: provide ${arnContextKey} or ${nameContextKey}.`);
}
