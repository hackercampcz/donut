import { unmarshall } from "@aws-sdk/util-dynamodb";
import { selectKeys } from "@hackercamp/lib/object.js";
import { getAttendeesProjection } from "@hackercamp/lib/search.js";
import { algoliasearch } from "algoliasearch";
import { fromJS } from "immutable";
import Rollbar from "../../rollbar.mjs";

/** @typedef {import("aws-lambda").DynamoDBStreamEvent} DynamoDBStreamEvent */
/** @typedef {import("algoliasearch").Algoliasearch} SearchClient */

const rollbar = Rollbar.init({ lambdaName: "dynamodb-reindex-attendees" });

const keysToIndex = new Set([
  "year",
  "slackID",
  "email",
  "company",
  "name",
  "paid",
  "invoiced",
  "invoice_id",
  "ticketType",
  "travel",
  "housing"
]);

/**
 * @param {DynamoDBStreamEvent} event
 * @param {SearchClient} searchClient
 * @param {String} indexName
 */
async function deleteRemovedItems(event, searchClient, indexName) {
  const objectIDs = event.Records.filter((x) => x.eventName === "REMOVE").map((x) =>
    `${x.dynamodb.OldImage.year.N}-${x.dynamodb.OldImage.slackID.S}`
  );

  if (objectIDs.length > 0) {
    console.log({ event: "Removing attendees from index", objectIDs });
    await searchClient.deleteObjects({ indexName, objectIDs });
  }
}

/**
 * @param {DynamoDBStreamEvent} event
 * @param {SearchClient} searchClient
 * @param {String} indexName
 */
async function updateAttendeesIndex(event, searchClient, indexName) {
  const updatedAttendees = event.Records.filter((x) => x.eventName !== "REMOVE").map((
    x
  ) => [
    fromJS(selectKeys(unmarshall(x.dynamodb.NewImage), keysToIndex)),
    x.dynamodb.OldImage ? fromJS(selectKeys(unmarshall(x.dynamodb.OldImage), keysToIndex)) : null
  ]).filter(([n, o]) => !n.equals(o)).map(([n]) => n.toJS()).map(getAttendeesProjection());
  if (updatedAttendees.length > 0) {
    console.log({ event: "Updating attendees index", updatedAttendees: updatedAttendees.map((x) => x.objectID) });
    await searchClient.saveObjects({ indexName, objects: updatedAttendees });
  }
}

/**
 * @param {DynamoDBStreamEvent} event
 * @returns {Promise<void>}
 */
async function indexUpdate(event) {
  rollbar.configure({ payload: { event } });
  try {
    const { algolia_app_id, algolia_admin_key, algolia_index_name } = process.env;
    const client = algoliasearch(algolia_app_id, algolia_admin_key);
    await Promise.all([
      deleteRemovedItems(event, client, algolia_index_name),
      updateAttendeesIndex(event, client, algolia_index_name)
    ]);
  } catch (err) {
    rollbar.error(err);
  }
}

export const handler = rollbar.lambdaHandler(indexUpdate);
