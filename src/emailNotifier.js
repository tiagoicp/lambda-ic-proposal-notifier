import nodemailer from "nodemailer";
import { awsGetRunnerSecrets } from "./awsWrapper.js";
import { CONFIG } from "./config.js";

export async function notifyByEmail(proposalIdsToAdd) {
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
  const secrets = await awsGetRunnerSecrets();

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

  console.log("Time " + proposalId + " started: " + new Date().toISOString());
  transport.sendMail(message, (err, info) => {
    if (err) {
      throw err;
    } else {
      console.log(info);
    }
  });
  console.log("Time " + proposalId + " ended: " + new Date().toISOString());
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
