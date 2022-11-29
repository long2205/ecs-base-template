export const envConstants = {
    "dev": {
        cidr: "172.255.0.0/16",
        certLB: "",
        url: "infra-test.afterfit.site"
    },
    "stg": {
        cidr: "172.254.1.0/16",
        certLB: "",
        url: "infra-test.afterfit.site"
    },
    "prod": {
        cidr: "172.253.2.0/16",
        certLB: "",
        url: "infra-test.afterfit.site"
    }
  }
export const commonConstants = {
    "codeStarGithubConnectionARN": "",
    "GithubRepoName" : "ecs-base-template-test"
}