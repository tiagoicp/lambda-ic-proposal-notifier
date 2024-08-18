import https from "https";
import { CONFIG } from "./src/config.js";
import { awsGetSharedData, awsPutParameterCommand } from "./src/awsWrapper.js";
import { notifyByEmail } from "./src/emailNotifier.js";

// eslint-disable-next-line no-unused-vars
export const handler = async (event) => {
  const proposals = await getAcceptingVotesReplicaProposals();
  if (proposals.data.length == 0) {
    return { statusCode: 200, body: "No accepting votes proposals found" };
  }

  // parse to get proposal ids
  const activeProposalIds = getAndReverseProposalIds(proposals);

  // update store prop
  const storedData = await awsGetSharedData();
  const storedProposalIds = getStoredProposalIds(storedData);
  const proposalIdsToAdd = activeProposalIds.filter(
    (id) => !storedProposalIds.includes(id),
  );

  // add missing proposal ids
  if (proposalIdsToAdd.length == 0) {
    return {
      statusCode: 200,
      body: "Success: No new proposals found",
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
  await awsPutParameterCommand(newStoredData);
}

console.log(await handler());
