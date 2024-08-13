import https from "https";
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";

const CONFIG = {
  storeParameterName: "pt_hub-shared_data",
  topicsString: "TOPIC_IC_OS_VERSION_ELECTION",
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
  if (proposalIdsToAdd.length != 0) {
    const newProposalsArray = buildNewProposals(proposalIdsToAdd);
    await joinAndUpdateSharedData(
      storedData,
      newProposalsArray,
      activeProposalIds,
    );
  }

  // execute task (if new or not started)
  if (proposalIdsToAdd.length != 0 || hasProposalsNotStarted(storedData)) {
    await notifyByEmail();
  } else {
    return {
      statusCode: 200,
      body: JSON.stringify("Success: No new proposals found"),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify("Success: New proposal(s) were run"),
  };
};

async function getAcceptingVotesReplicaProposals() {
  const url =
    "https://ic-api.internetcomputer.org/api/v3/proposals?include_topic=" +
    CONFIG.topicsString +
    "&include_reward_status=ACCEPT_VOTES";

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
      started_at: "",
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

function hasProposalsNotStarted(storedData) {
  const proposalsNotStarted = storedData.filter(
    (proposalData) => proposalData.started_at == "",
  );
  return proposalsNotStarted.length != 0;
}

async function notifyByEmail() {
  // TODO: send email
  let response = "email was sent";
  try {
    // response = await client.send(command);
  } catch (error) {
    console.log(JSON.stringify(error));
    process.exit(1);
  }

  // always log full response
  console.log(JSON.stringify(response));
}

console.log(await handler());
