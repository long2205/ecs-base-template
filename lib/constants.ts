export const envConstants = {
    "dev": {
        cidr: "172.255.0.0/16",
        certLB: "arn:aws:acm:ap-northeast-1:077272092711:certificate/19e01746-d5d5-41d3-8628-8f25e107da3b",
        url: "infra-test.afterfit.site"
    },
    "stg": {
        cidr: "172.254.1.0/16",
        certLB: "arn:aws:acm:ap-northeast-1:077272092711:certificate/19e01746-d5d5-41d3-8628-8f25e107da3b",
        url: "infra-test.afterfit.site"
    },
    "prod": {
        cidr: "172.253.2.0/16",
        certLB: "arn:aws:acm:ap-northeast-1:077272092711:certificate/19e01746-d5d5-41d3-8628-8f25e107da3b",
        url: "infra-test.afterfit.site"
    }
  }
export const commonConstants = {
    "codeStarGithubConnectionARN": "arn:aws:codestar-connections:ap-northeast-1:077272092711:connection/bddc7fbc-e392-4a14-861f-fab4ab848e0d",
    "GithubRepoName" : "ecs-base-template-test"
}