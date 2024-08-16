import https from "https";
import nodemailer from "nodemailer";
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const SANDBOX_MODE = false;
const CONFIG = {
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

// eslint-disable-next-line no-unused-vars
export const handler = async (event) => {
  const proposals = await getAcceptingVotesReplicaProposals();
  if (proposals.data.length == 0) {
    return { statusCode: 200, body: "No accepting votes proposals found" };
  }

  // parse to get proposal ids
  const activeProposalIds = getAndReverseProposalIds(proposals);

  // update store prop
  const storedData = await getSharedData();
  const storedProposalIds = getStoredProposalIds(storedData);
  const proposalIdsToAdd = activeProposalIds.filter(
    (id) => !storedProposalIds.includes(id),
  );

  // add missing proposal ids
  if (proposalIdsToAdd.length == 0) {
    return {
      statusCode: 200,
      body: JSON.stringify("Success: No new proposals found"),
    };
  }

  // execute task
  await notifyByEmail(proposalIdsToAdd);

  const newProposalsArray = buildNewProposals(proposalIdsToAdd);
  await joinAndUpdateSharedData(
    storedData,
    newProposalsArray,
    activeProposalIds,
  );

  return {
    statusCode: 200,
    body: JSON.stringify("Success: New proposal(s) were run"),
  };
};

async function getAcceptingVotesReplicaProposals() {
  let topicsString = "";
  CONFIG.topics.forEach((topic) => {
    topicsString += "&include_topic=" + topic;
  });

  const url =
    "https://ic-api.internetcomputer.org/api/v3/proposals?include_reward_status=ACCEPT_VOTES" +
    topicsString;

  return new Promise((resolve) => {
    https
      .get(url, (resp) => {
        let data = "";

        // A chunk of data has been received.
        resp.on("data", (chunk) => {
          data += chunk;
        });

        // The whole response has been received. Handle the result.
        resp.on("end", () => {
          const result = JSON.parse(data);
          // if success
          if ("data" in result) {
            resolve(result);
          } else {
            console.log("Error, API Proposals Failed Response: " + data);
            process.exit(1);
          }
        });
      })
      .on("error", (err) => {
        console.log("Error on API Proposals: " + err.message);
        process.exit(1);
      });
  });
}

function getAndReverseProposalIds(proposals) {
  let ids = [];
  for (let proposal of proposals.data) {
    ids.push(proposal.proposal_id.toString());
  }
  return ids.reverse();
}

async function getSharedData() {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/classes/getparametercommand.html
  const client = new SSMClient({ region: "eu-west-1" });
  const command = new GetParameterCommand({ Name: CONFIG.storeParameterName });

  let response;
  try {
    response = await client.send(command);
  } catch (error) {
    console.log(JSON.stringify(error));
    process.exit(1);
  }

  const sharedData = response?.Parameter?.Value;
  return JSON.parse(sharedData);
}

function getStoredProposalIds(storedData) {
  let ids = [];
  for (let proposalData of storedData) {
    ids.push(proposalData.proposal);
  }
  return ids;
}

function buildNewProposals(proposalIds) {
  let newProposalsArray = [];
  // build full hash
  for (let proposal_id of proposalIds) {
    let newHash = {
      proposal: proposal_id,
    };
    newProposalsArray.push(newHash);
  }

  return newProposalsArray;
}

async function joinAndUpdateSharedData(
  storedData,
  newProposalsArray,
  activeProposalIds,
) {
  // remove inactive ones
  const activeProposalsArray = storedData.filter((proposalData) =>
    activeProposalIds.includes(proposalData.proposal),
  );

  // join new ones
  const newStoredData = activeProposalsArray.concat(newProposalsArray);

  // update
  await putParameterCommand(newStoredData);
}

async function putParameterCommand(newStoredData) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/classes/putparametercommand.html
  const client = new SSMClient({ region: "eu-west-1" });
  const input = {
    Name: CONFIG.storeParameterName,
    Value: JSON.stringify(newStoredData),
    Overwrite: true,
  };
  const command = new PutParameterCommand(input);

  let response;
  try {
    response = await client.send(command);
  } catch (error) {
    console.log(JSON.stringify(error));
    process.exit(1);
  }

  const hasVersion = response?.Version;
  if (!hasVersion) {
    console.log(
      "Error, Failed to update Stored Data: " + JSON.stringify(response),
    );
  }

  return !!hasVersion;
}

async function notifyByEmail(proposalIdsToAdd) {
  try {
    proposalIdsToAdd.forEach(async (proposalId) => {
      await sendEmail(proposalId);
    });

    console.log("Emails sent to proposal(s): " + proposalIdsToAdd.join(","));
  } catch (error) {
    console.log(
      "Failed to send email on proposal(s): " + proposalIdsToAdd.join(","),
    );
    console.log(JSON.stringify(error));
    process.exit(1);
  }
}

async function sendEmail(proposalId) {
  const secrets = await getRunnerSecrets();

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    auth: {
      user: secrets.gmailUsername,
      pass: secrets.gmailAppPassword,
    },
  });

  const message = {
    from: secrets.gmailUsername,
    to: CONFIG.notifyEmails.join(","),
    subject: `[ICP HUB] Proposal requires your vote - ${proposalId}`,
    text: getBody(proposalId),
  };

  transport.sendMail(message, (err, info) => {
    if (err) {
      throw err;
    } else {
      console.log(info);
    }
  });
}

const getBody = (proposalId) => {
  return (
    "Hi,\n\n" +
    `Proposal ${proposalId} requires your vote.\n` +
    `Please see all details here: https://dashboard.internetcomputer.org/proposal/${proposalId}\n\n` +
    "Regards,\n" +
    "ICP HUB Bot"
  );
};

const getRunnerSecrets = async () => {
  const secretsString = await getSecret();
  return JSON.parse(secretsString);
};

const getSecret = async () => {
  // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-started.html
  const client = new SecretsManagerClient({ region: CONFIG.awsRegion });

  let response;

  try {
    response = await client.send(
      new GetSecretValueCommand({ SecretId: CONFIG.secretName }),
    );
  } catch (error) {
    // https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
    console.log(JSON.stringify(error));
    process.exit(1);
  }

  const secret = response.SecretString;
  return secret;
};

console.log(await handler());
