import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  accepted,
  errorResponse,
  getHeader,
  notFound,
  readPayload,
  response,
  unauthorized,
  unprocessableEntity,
  withCORS
} from "../http.mjs";
import { Attachments, sendEmailWithTemplate, Template } from "../postmark.mjs";
import Rollbar from "../rollbar.mjs";

/** @typedef { import("@aws-sdk/client-dynamodb").DynamoDBClient } DynamoDBClient */
/** @typedef { import("@pulumi/awsx/classic/apigateway").Request } APIGatewayProxyEvent */
/** @typedef { import("@pulumi/awsx/classic/apigateway").Response } APIGatewayProxyResult */

/** @type DynamoDBClient */
const db = new DynamoDBClient({});
const rollbar = Rollbar.init({ lambdaName: "fakturoid-webhook" });

async function markAsPaid(registrations, paid_at, invoice_id) {
  for (const registration of registrations) {
    console.log({ event: "Marking as paid", ...registration });
    await db.send(
      new UpdateItemCommand({
        TableName: process.env.db_table_registrations,
        Key: registration,
        UpdateExpression: "SET paid = :paid",
        ExpressionAttributeValues: { ":paid": { S: new Date(paid_at).toISOString() } }
      })
    );
    await sendEmailWithTemplate({
      token: process.env["postmark_token"],
      templateId: Template.RegistrationPaid,
      data: {},
      to: registration.email.S,
      attachments: [Attachments.Event2024],
      tag: "registration-paid"
    });
    console.log({ event: "Invoice marked as paid", invoice_id, ...registration });
  }
}

async function markAsCancelled(registrations, paid_at, invoice_id) {
  for (const registration of registrations) {
    console.log({ event: "Marking as canceled", ...registration });
    await db.send(
      new UpdateItemCommand({
        TableName: process.env.db_table_registrations,
        Key: registration,
        UpdateExpression: "SET cancelled = :now",
        ExpressionAttributeValues: { ":now": { S: new Date(paid_at).toISOString() } }
      })
    );
    console.log({ event: "Invoice marked as cancelled", invoice_id, ...registration });
  }
}

async function getInvoicedRegistrations(db, invoice_id) {
  const tableName = process.env.db_table_registrations;
  const resp = await db.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: `${tableName}-by-invoice-id`,
      KeyConditionExpression: "invoice_id = :id",
      ExpressionAttributeValues: { ":id": { N: invoice_id.toString() } },
      ExpressionAttributeNames: { "#year": "year" },
      ProjectionExpression: "#year, email"
    })
  );
  return resp.Items;
}

/**
 * @param {APIGatewayProxyEvent} event
 * @returns {Promise.<APIGatewayProxyResult>}
 */
export async function fakturoidWebhook(event) {
  const withCORS_ = withCORS(["POST", "OPTIONS"], getHeader(event.headers, "Origin"));

  try {
    const { token } = event.queryStringParameters;
    if (token !== process.env.TOKEN) {
      console.log({ event: "Invalid token", token });
      return withCORS_(unauthorized());
    }

    const payload = readPayload(event);
    rollbar.configure({ payload });
    console.log({ payload });
    switch (payload.event_name) {
      case "invoice_overdue": {
        // there is nothing we want to do, accept it for now.
        return withCORS_(accepted());
      }
      case "invoice_paid": {
        const { invoice_id, paid_at, paid_on } = payload;
        const registrations = await getInvoicedRegistrations(db, invoice_id);
        if (!registrations.length) {
          console.log({ event: "Registrations not found", invoice_id });
          return withCORS_(notFound());
        }

        if (payload.total < 0) {
          // canceled invoice has a negative total to compensate the balance
          await markAsCancelled(registrations, paid_on ?? paid_at, invoice_id);
        } else {
          await markAsPaid(registrations, paid_on ?? paid_at, invoice_id);
        }
        return withCORS_(response({}));
      }
      default: {
        console.log({ event: "Unknown event", payload });
        return withCORS_(unprocessableEntity());
      }
    }
  } catch (err) {
    rollbar.error(err);
    console.error(err);
    return withCORS_(errorResponse(err));
  }
}

export const handler = rollbar.lambdaHandler(fakturoidWebhook);
