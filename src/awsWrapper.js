import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { CONFIG } from "./config.js";

export async function awsGetSharedData() {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/classes/getparametercommand.html
  const client = new SSMClient({ region: CONFIG.awsRegion });
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

export async function awsPutParameterCommand(newStoredData) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ssm/classes/putparametercommand.html
  const client = new SSMClient({ region: CONFIG.awsRegion });
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

export const awsGetRunnerSecrets = async () => {
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
