#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsBaseStack } from '../lib/ecs-base-stack';

const awsAccountEnv = { 
  account: 'XXXXXXXXXXXX', 
  region: 'ap-northeast-1' 
};

const app = new cdk.App();

// Development Environment
new EcsBaseStack(app, 'EcsBaseStack', {
  env: awsAccountEnv,
  stackName: "dev",
});

// Staging Environment
new EcsBaseStack(app, 'EcsBaseStack', {
  env: awsAccountEnv,
  stackName: "stg",
});

// Production Environment
new EcsBaseStack(app, 'EcsBaseStack', {
  env: awsAccountEnv,
  stackName: "prod",
});