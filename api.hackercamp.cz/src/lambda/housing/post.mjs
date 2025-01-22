import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { getToken, validateToken } from "@hackercamp/lib/auth.js";
import { housingToText } from "@hackercamp/lib/housing.js";
import { accepted, getHeader, readPayload, seeOther } from "../http.mjs";
import { postChatMessage } from "../slack.mjs";

/** @typedef { import("@aws-sdk/client-dynamodb").DynamoDBClient } DynamoDBClient */
/** @typedef { import("@pulumi/awsx/classic/apigateway").Request } APIGatewayProxyEvent */
/** @typedef { import("@pulumi/awsx/classic/apigateway").Response } APIGatewayProxyResult */

const dynamo = new DynamoDBClient({});

function saveAttendee(dynamo, data) {
  console.log({ event: "Save attendee", data });
  return dynamo.send(
    new UpdateItemCommand({
      TableName: "attendees",
      Key: { slackID: { S: data.slackID }, year: { N: data.year.toString() } },
      UpdateExpression: "SET housing = :housing, housingPlacement = :housingPlacement",
      ExpressionAttributeValues: marshall({ ":housing": data.housing, ":housingPlacement": data.housingPlacement }, {
        removeUndefinedValues: true
      })
    })
  );
}

const placement = (p) => (p === "custom" ? "" : ` ${p}`);

function sendSlackMessage(submittedBy, item) {
  console.log({ event: "Sending Slack message", submittedBy, item });
  const message = submittedBy === item.slackID
    ? `Super! Právě sis vybral svoje ubytko na Campu.
Držíme Ti místo ${housingToText.get(item.housing)}${placement(item.housingPlacement)}, jak sis přál.

Potřebuješ to změnit? Stačí si <https://donut.hackercamp.cz/|upravit ve svém profilu>, ale pozor, jen do 21. 8.!
Pak už to půjde jen po osobní domluvě s Pájou.

Vidíme se na Sobeňáku,

Tvoje Hacker Camp Crew`
    : `Gratulujeme, milý hackere,

Právě ti někdo zamluvil ubytko na Campu. Tvoje poděkování si zaslouží <@${submittedBy}>.
Takže teď Ti držíme místo ${housingToText.get(item.housing)}${placement(item.housingPlacement)}.
Chceš si zkontrolovat, co to znamená? Koukni na <https://donut.hackercamp.cz/ubytovani/|svůj profil s ubytkem>.

Máš bydlení bez práce! Super. Užij si ušetřené minuty na fajn relax, nebo milá slova tomu, kdo Ti pomohl :)

Potřebuješ ubytko změnit? Stačí si <https://donut.hackercamp.cz/|upravit ve svém profilu>,
ale pozor týden před akcí se ta možnost zavře!
Pak už to půjde jen po osobní domluvě s Pájou.

Vidíme se na Sobeňáku,

Tvoje Hacker Camp Crew`;
  return postChatMessage(item.slackID, message);
}

/**
 * @param {APIGatewayProxyEvent} event
 * @returns {Promise.<APIGatewayProxyResult>}
 */
export async function handler(event) {
  const data = readPayload(event);
  const token = getToken(event.headers);
  const payload = await validateToken(token, process.env.private_key);
  const submittedBy = payload["https://slack.com/user_id"];
  const year = parseInt(data.year, 10);
  console.log({ method: "POST", data, token: payload });
  for (const item of data.items) {
    await saveAttendee(dynamo, Object.assign({ year }, item));
    await sendSlackMessage(submittedBy, item);
  }
  if (getHeader(event.headers, "Accept") === "application/json") {
    return accepted();
  }
  return seeOther(`https://${process.env.donut}/ubytovani/ulozeno/`);
}
