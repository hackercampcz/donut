import { unmarshall } from "@aws-sdk/util-dynamodb";
import { selectKeys } from "@hackercamp/lib/object.js";
import { getRegistrationProjection } from "@hackercamp/lib/search.js";
import { algoliasearch } from "algoliasearch";
import { fromJS } from "immutable";
import Rollbar from "../../rollbar.mjs";

/** @typedef {import("aws-lambda").DynamoDBStreamEvent} DynamoDBStreamEvent */
/** @typedef {import("algoliasearch").Algoliasearch} SearchClient */

const rollbar = Rollbar.init({ lambdaName: "dynamodb-reindex-registrations" });

const keysToIndex = new Set([
  "year",
  "email",
  "company",
  "firstName",
  "lastName",
  "timestamp",
  "invoiced",
  "invoice_id",
  "paid",
  "firstTime",
  "referral",
  "ticketType",
  "approved"
]);

/**
 * @param {DynamoDBStreamEvent} event
 * @param {SearchClient} searchClient
 * @param {String} indexName
 */
async function deleteRemovedItems(event, searchClient, indexName) {
  const objectIDs = event.Records.filter((x) => x.eventName === "REMOVE").map((x) =>
    `${x.dynamodb.OldImage.year.N}-${x.dynamodb.OldImage.email.S}`
  );

  if (objectIDs.length > 0) {
    console.log({ event: "Removing registrations from index", deletedRegistrations: objectIDs });
    await searchClient.deleteObjects({ indexName, objectIDs });
  }
}

/**
 * @param {DynamoDBStreamEvent} event
 * @param {SearchClient} searchIndex
 * @param {String} indexName
 */
async function updateRegistrationsIndex(event, searchIndex, indexName) {
  const updatedRegistrations = event.Records.filter((x) => x.eventName !== "REMOVE").map((
    x
  ) => [
    fromJS(selectKeys(unmarshall(x.dynamodb.NewImage), keysToIndex)),
    x.dynamodb.OldImage ? fromJS(selectKeys(unmarshall(x.dynamodb.OldImage), keysToIndex)) : null
  ]).filter(([n, o]) => !n.equals(o)).map(([n]) => n.toJS()).map(getRegistrationProjection());
  if (updatedRegistrations.length > 0) {
    console.log({
      event: "Updating registrations index",
      updatedRegistrations: updatedRegistrations.map((x) => x.objectID)
    });
    await searchIndex.saveObjects({ indexName, objects: updatedRegistrations });
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
      updateRegistrationsIndex(event, client, algolia_index_name)
    ]);
  } catch (err) {
    rollbar.error(err);
  }
}

export const handler = rollbar.lambdaHandler(indexUpdate);
