import { App } from "aws-cdk-lib";
import { AlphaLensStack } from "../lib/alphalens-stack.js";

const app = new App();

new AlphaLensStack(app, "AlphaLensMvpStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1"
  }
});
