import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { envConstants, commonConstants } from './constants';
import * as path from 'path';

type ObjectKey = keyof typeof envConstants;

export class EcsBaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stackName = props?.stackName as ObjectKey;
    /**
     * VPC
     */
     const vpc = new cdk.aws_ec2.Vpc(this, 'VPC', {
      vpcName: `VPC-${props?.stackName}`,
      cidr: envConstants[stackName].cidr,
      maxAzs: 2,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration:[
        {
          cidrMask: 24,
          name: 'public-subnet',
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 24,
          name: 'private-subnet',
          subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED
        }
      ],
      gatewayEndpoints: {
        S3: {
          service: cdk.aws_ec2.GatewayVpcEndpointAwsService.S3,
        },
      },
    });
    /**
     * Load Balancer
     */
    const securityGroupLb = new cdk.aws_ec2.SecurityGroup(this, 'LoadBalancerSG',{
      vpc: vpc,
      description: 'Security Group of Load Balancer'
    });
    securityGroupLb.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(80), 'Allow HTTP');
    securityGroupLb.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(443), 'Allow HTTPS');

    const loadBalancer = new cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'LoadBalancer',{
      loadBalancerName: `Load-Balancer-${props?.stackName}`,
      vpc: vpc,
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
      },
      internetFacing: true,
      securityGroup: securityGroupLb
    });

    loadBalancer.addListener('listenerHttp', { 
      port: 80,
      defaultAction: cdk.aws_elasticloadbalancingv2.ListenerAction.redirect({port: "443",protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS})
    });

    const httpsListener = loadBalancer.addListener('listenerHttps', { 
      port: 443,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTPS,
      certificates: [ cdk.aws_elasticloadbalancingv2.ListenerCertificate.fromArn(envConstants[stackName].certLB) ],
      defaultAction: cdk.aws_elasticloadbalancingv2.ListenerAction.fixedResponse(404,{
        contentType: 'text/html',
        messageBody: 'お指定URLをご確認ください！'
      }),
      sslPolicy: cdk.aws_elasticloadbalancingv2.SslPolicy.TLS12
    });

    const targetGroup = new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, "TargetGroupFront", {
      targetGroupName: `ecs-base-tg-${props?.stackName}`,
      targetType: cdk.aws_elasticloadbalancingv2.TargetType.IP,
      port: 80,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      vpc: vpc
    });

    const httpsRule = new cdk.aws_elasticloadbalancingv2.ApplicationListenerRule(this, "HttpsFrontEndRule", {
      listener: httpsListener,
      priority: 1,
      conditions: [
        cdk.aws_elasticloadbalancingv2.ListenerCondition.hostHeaders([envConstants[stackName].url])
      ],
      targetGroups: [targetGroup]
    });
    
    /**
     * ECS Fargate Cluster
     */
    const cluster = new cdk.aws_ecs.Cluster(this, "ECSCluster",{
      vpc: vpc,
      clusterName: `${props?.stackName}-backend-cluster`
    });

    /**
     * CICD Pipeline
     */

    //Source
    const ecrRepo = new cdk.aws_ecr.Repository(this, 'ECRRepo',{
      repositoryName: `${commonConstants.GithubRepoName}-ecrRepo`
    });

    const sourceOutput = new cdk.aws_codepipeline.Artifact();
    const sourceAction = new cdk.aws_codepipeline_actions.CodeStarConnectionsSourceAction({
      actionName: 'GitHubSource',
      owner: 'aws',
      repo: commonConstants.GithubRepoName,
      branch: 'main',
      output: sourceOutput,
      connectionArn: commonConstants.codeStarGithubConnectionARN
      // master branch
    });

    //Build
    const codebuildProject = new cdk.aws_codebuild.PipelineProject(this, 'BuildProject', {
      environment: {
        privileged: true 
      },
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              "$(aws ecr get-login --region $AWS_DEFAULT_REGION --no-include-email)",
              "docker build -t $REPOSITORY_URI:latest .",
              "docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION"
            ]
          },
          post_build: {
            commands: [
              "docker push $REPOSITORY_URI:latest",
              "docker push $REPOSITORY_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION",
              "export imageTag=$CODEBUILD_RESOLVED_SOURCE_VERSION",
              "printf '[{\"name\":\"app\",\"imageUri\":\"%s\"}]' $REPOSITORY_URI:$imageTag > imagedefinitions.json"
            ]
          }
        },
        env: {
          "exported-variables": ["imageTag"]
        },
        artifacts: {
            "files": "imagedefinitions.json",
            "secondary-artifacts": {
                "imagedefinitions": {
                    "files": "imagedefinitions.json",
                    "name": "imagedefinitions"
                }
            }
        }
      }),
      environmentVariables: {
        REPOSITORY_URI: { value: ecrRepo.repositoryUri }
      }
    });
    ecrRepo.grantPullPush(codebuildProject);
    const buildOutput = new cdk.aws_codepipeline.Artifact("imagedefinitions");
    const buildAction = new cdk.aws_codepipeline_actions.CodeBuildAction({
      actionName: 'Build',
      project: codebuildProject,
      input: sourceOutput,
      outputs: [ buildOutput ]
    });
    //Deploy
    const deployRole = new cdk.aws_iam.Role(this, "DeployRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    deployRole.addManagedPolicy(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"));
    
    const serviceFargate = new cdk.aws_ecs_patterns.ApplicationLoadBalancedFargateService(this, "Deploy",{
      taskImageOptions: {
        image: cdk.aws_ecs.ContainerImage.fromRegistry(`${ecrRepo.repositoryUri}:latest`),
        containerName: "app",
        executionRole: deployRole
      },
      desiredCount: 1,
      serviceName: "web-micro-service-name",
      listenerPort: 80,
      cluster: cluster,
      loadBalancer: loadBalancer,
      assignPublicIp: true,
    });

    const deployOutput = new cdk.aws_codepipeline.Artifact("imagedefinitions");
    // const deployAction = new cdk.aws_codepipeline_actions.EcsDeployAction({
    //   actionName: 'Deploy',
    //   service:
    // })
    
    const deployAction = new cdk.aws_codepipeline_actions.EcsDeployAction({
      actionName: "Deploy",
      service: serviceFargate.service,
      input: buildOutput,
      runOrder: (props?.stackName == "prod"? 1 : 2)
    })

    const manualApprovalAction = new cdk.aws_codepipeline_actions.ManualApprovalAction({
      actionName: "Manual Approval for Production",
      runOrder: 1
    });

    const pipeline = new cdk.aws_codepipeline.Pipeline(this, 'ECS-Pipeline', {
      pipelineName: `ecs-base-pipeline-${props?.stackName}`,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction]
        },
        {
          stageName: 'Build',
          actions: [buildAction]
        }
      ]
    });
    
    if (props?.stackName == "prod") {
      pipeline.addStage({
        stageName: 'Deploy',
        actions: [
          manualApprovalAction,
          deployAction
        ]
      });
    } else {
      pipeline.addStage({
        stageName: 'Deploy',
        actions: [deployAction]
      });
    }
  }
}
