import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps
} from "aws-cdk-lib";
import {
  Distribution,
  OriginProtocolPolicy,
  ViewerProtocolPolicy,
  CachePolicy,
  AllowedMethods
} from "aws-cdk-lib/aws-cloudfront";
import { LoadBalancerV2Origin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
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
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..", "..");

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
    const container = task.addContainer("Api", {
      image: ContainerImage.fromAsset(path.join(repoRoot, "backend")),
      logging: LogDrivers.awsLogs({ streamPrefix: "alphalens-api" }),
      environment: {
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
        MARKET_DATA_PROVIDER: "mock",
        AI_PROVIDER: "mock",
        DATABASE_HOST: database.dbInstanceEndpointAddress,
        DATABASE_PORT: database.dbInstanceEndpointPort,
        DATABASE_NAME: "alphalens",
        DATABASE_USER: "alphalens"
      },
      secrets: {
        SESSION_SECRET: EcsSecret.fromSecretsManager(sessionSecret),
        DATABASE_PASSWORD: EcsSecret.fromSecretsManager(dbSecret, "password")
      }
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
          cachePolicy: CachePolicy.CACHING_DISABLED
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
