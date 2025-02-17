import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { liteClient } from "algoliasearch/lite";
import { resultsCount } from "../../algolia.mjs";
import { getItemsFromDB } from "../../attendees.js";
import { getHeader } from "../../http.mjs";
import { formatResponse } from "../csv.mjs";

/** @typedef { import("@aws-sdk/client-dynamodb").DynamoDBClient } DynamoDBClient */
/** @typedef { import("@pulumi/awsx/classic/apigateway").Request } APIGatewayProxyEvent */
/** @typedef { import("@pulumi/awsx/classic/apigateway").Response } APIGatewayProxyResult */

/** @type DynamoDBClient */
const db = new DynamoDBClient({});

async function getAttendees(query, tag, year, page, pageSize, { allYears }) {
  const { algolia_app_id, algolia_search_key, algolia_index_name } = process.env;
  const client = liteClient(algolia_app_id, algolia_search_key);

  console.log({ event: "Loading Attendees", tag, year, page, pageSize, query, allYears });

  const { results } = await client.search({
    requests: [
      {
        query,
        indexName: algolia_index_name,
        attributesToRetrieve: ["year", "slackID"],
        tagFilters: [
          allYears ? null : year.toString(),
          tag === "searchAttendees" || tag === "attendees" ? null : tag.replace("Attendees", "")
        ].filter(Boolean),
        hitsPerPage: pageSize,
        page
      },
      resultsCount(algolia_index_name, year, null),
      resultsCount(algolia_index_name, year, "hacker"),
      resultsCount(algolia_index_name, year, "volunteer"),
      resultsCount(algolia_index_name, year, "staff"),
      resultsCount(algolia_index_name, year, "crew")
    ]
  });

  const [{ hits, nbHits, nbPages }, ...counts] = results;
  const [all, hacker, volunteer, staff, crew] = counts.map((x) => x.nbHits);

  const tableName = process.env.db_table_attendees;
  const items = await getItemsFromDB(db, tableName, hits);

  return { items, page, pages: nbPages, total: nbHits, counts: { all, hacker, volunteer, staff, crew } };
}

/**
 * @param {APIGatewayProxyEvent} event
 * @returns {Promise.<APIGatewayProxyResult>}
 */
export async function handler(event) {
  console.log({ queryString: event.queryStringParameters });
  const { type, year, page, pageSize, format, query } = Object.assign({
    year: process.env.year ?? "2022",
    query: "",
    page: "0",
    pageSize: "20",
    format: getHeader(event.headers, "Accept")
  }, event.queryStringParameters);

  const respData = await getAttendees(query, type, parseInt(year), parseInt(page), parseInt(pageSize), {
    allYears: format === "csv" || format === "text/csv" && !event.queryStringParameters.year
  });
  return formatResponse(respData, { year, resource: "attendees", type, format });
}
