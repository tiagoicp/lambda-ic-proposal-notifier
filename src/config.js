export const SANDBOX_MODE = false;
export const CONFIG = {
  storeParameterName: "pt_hub-shared_data",
  secretName: "pt-hub/proposal-notifier-secrets",
  awsRegion: "eu-west-1",
  topics: [
    "TOPIC_GOVERNANCE",
    "TOPIC_NETWORK_ECONOMICS",
    "TOPIC_SNS_AND_COMMUNITY_FUND",
  ],
  notifyEmails: SANDBOX_MODE ? [""] : ["icp-hub-proposals@googlegroups.com"],
};
