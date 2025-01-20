import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { getContact } from "../../dynamodb/registrations/paid.mjs";
import { accepted, getHeader, readPayload, seeOther } from "../../http.mjs";
import { sendEmailWithTemplate, Template } from "../../postmark.mjs";
import { getAuthHeader, fetchInvoice } from "@hackercamp/lib/fakturoid.js";

/** @typedef { import("@aws-sdk/client-dynamodb").DynamoDBClient } DynamoDBClient */
/** @typedef { import("@pulumi/awsx/classic/apigateway").Request } APIGatewayProxyEvent */
/** @typedef { import("@pulumi/awsx/classic/apigateway").Response } APIGatewayProxyResult */

/** @type DynamoDBClient */
const db = new DynamoDBClient({});

/**
 * @param {DynamoDBClient} db
 * @param {{email: string, year: number}} data
 */
async function optout(db, { email, year }) {
  return db.send(
    new PutItemCommand({
      TableName: process.env.db_table_optouts,
      Item: marshall({ email, year }, { convertEmptyValues: true, removeUndefinedValues: true })
    })
  );
}

async function getRegistration(db, { email, year }) {
  console.log("Get registration", { email, year });
  const resp = await db.send(
    new GetItemCommand({
      TableName: process.env.db_table_registrations,
      Key: { email: { S: email }, year: { N: year.toString() } }
    })
  );
  return resp.Item;
}

/**
 * @param {DynamoDBClient} db
 * @param {{email: string, year: number}} data
 */
async function moveToTrash(db, { email, year, slackID }) {
  console.log({ event: "Moving registration to trash", email, year });

  const reg = await getRegistration(db, { email, year });
  await db.send(
    new PutItemCommand({
      TableName: "trash",
      Item: Object.assign({}, reg, {
        deletedBy: { S: slackID },
        deleted: { S: new Date().toISOString() }
      })
    })
  );
  await db.send(
    new DeleteItemCommand({
      TableName: process.env.db_table_registrations,
      Key: { email: { S: email }, year: { N: year.toString() } }
    })
  );
}

/**
 * @param {DynamoDBClient} db
 * @param {*} data
 */
function addRegistration(db, data) {
  console.log({ event: "Put registration", data });

  return db.send(
    new PutItemCommand({
      TableName: process.env.db_table_registrations,
      Item: marshall({ ...data }, { convertEmptyValues: true, removeUndefinedValues: true })
    })
  );
}

async function approve(db, { email, year, referral }) {
  console.log({ event: "Approving registration", email, year, referral });
  await db.send(
    new UpdateItemCommand({
      TableName: process.env.db_table_registrations,
      Key: marshall({ email, year }, { removeUndefinedValues: true, convertEmptyValues: true }),
      UpdateExpression: "SET approved = :approved, approvedBy = :approvedBy",
      ExpressionAttributeValues: marshall({ ":approved": new Date().toISOString(), ":approvedBy": referral })
    })
  );
  return sendEmailWithTemplate({
    token: process.env.postmark_token,
    templateId: Template.RegistrationApproved,
    data: {},
    to: email,
    tag: "registration-approved"
  });
}

async function sendVolunteerSlackInvitation(email, postmarkToken) {
  await sendEmailWithTemplate({
    token: postmarkToken,
    to: email,
    templateId: Template.VolunteerSlackInvite,
    data: {},
    tag: "volunteer-slack-invitation"
  });
  console.log({ event: "Volunteer slack invitation sent", email });
}

async function approveVolunteer(db, { registrations, referral }) {
  for (const registration of registrations) {
    console.log({ event: "Marking volunteer registration as paid", ...registration });
    const contact = await getContact(db, registration.email);
    if (!contact) {
      console.log({ event: "No contact found", email: registration.email });
      await sendVolunteerSlackInvitation(registration.email, process.env.postmark_token);
    }

    await db.send(
      new UpdateItemCommand({
        TableName: process.env.db_table_registrations,
        Key: marshall(registration, { removeUndefinedValues: true, convertEmptyValues: true }),
        UpdateExpression: "SET paid = :paid, approved = :approved, approvedBy = :approvedBy",
        ExpressionAttributeValues: marshall({
          ":paid": new Date().toISOString(),
          ":approved": new Date().toISOString(),
          ":approvedBy": referral
        })
      })
    );
  }
}

async function invoiced(db, { registrations, invoiceId }) {
  const { fakturoid_client_id, fakturoid_client_secret } = process.env;
  const authHeader = await getAuthHeader(fakturoid_client_id, fakturoid_client_secret);
  // TODO: Fakturoid create invoice (get/create subject; create invoice for subject)
  const { created_at: invoiced, id } = await fetchInvoice(authHeader, invoiceId);
  for (const key of registrations) {
    console.log({ event: "Marking registration as invoiced", invoiceId, ...key });
    await db.send(
      new UpdateItemCommand({
        TableName: process.env.db_table_registrations,
        Key: marshall(key, { removeUndefinedValues: true, convertEmptyValues: true }),
        UpdateExpression: "SET invoice_id = :invoice_id, invoiced = :invoiced",
        ExpressionAttributeValues: marshall({ ":invoice_id": id, ":invoiced": invoiced }, {
          removeUndefinedValues: true,
          convertEmptyValues: true
        })
      })
    );
  }
}

async function editRegistration(db, { key, data }) {
  console.log({ event: "Update registration", key, data });
  if (key.email === data.email) {
    return db.send(
      new UpdateItemCommand({
        TableName: process.env.db_table_registrations,
        Key: { email: { S: key.email }, year: { N: key.year.toString() } },
        UpdateExpression:
          "SET firstName = :firstName, lastName = :lastName, phone = :phone, company = :company, edited = :now, editedBy = :editedBy, ticketType = :ticketType, paid = :paid,"
          + "invRecipient = :invRecipient, invRecipientEmail = :invRecipientEmail, invRecipientPhone = :invRecipientPhone, invRecipientFirstname = :invRecipientFirstname, invRecipientLastname = :invRecipientLastname,"
          + "invName = :invName, invAddress = :invAddress, invRegNo = :invRegNo, invVatNo = :invVatNo, invText = :invText, invEmail = :invEmail",
        ExpressionAttributeValues: marshall({
          ":firstName": data.firstName,
          ":lastName": data.lastName,
          ":company": data.company,
          ":now": new Date().toISOString(),
          ":editedBy": data.editedBy,
          ":ticketType": data.ticketType,
          ":phone": data.phone,
          ":paid": data.paid ?? null,
          ":invRecipient": data.invRecipientEmail ? 1 : 0,
          ":invRecipientEmail": data.invRecipientEmail,
          ":invRecipientPhone": data.invRecipientPhone,
          ":invRecipientFirstname": data.invRecipientFirstname,
          ":invRecipientLastname": data.invRecipientLastname,
          ":invName": data.invName,
          ":invAddress": data.invAddress,
          ":invRegNo": data.invRegNo,
          ":invVatNo": data.invVatNo,
          ":invText": data.invText,
          ":invEmail": data.invEmail
        }, { removeUndefinedValues: true, convertEmptyValues: true })
      })
    );
  }

  const originalData = await getRegistration(db, key);
  const formData = marshall(Object.assign(data, { year: parseInt(data.year) }), {
    convertEmptyValues: true,
    removeUndefinedValues: true
  });

  console.log({
    event: "Update registration with new email - deleting old item and adding new one",
    key,
    originalData,
    formData
  });

  return db.send(
    new TransactWriteItemsCommand({
      TransactItems: [{
        Put: { TableName: process.env.db_table_registrations, Item: Object.assign({}, originalData, formData) }
      }, {
        Delete: {
          TableName: process.env.db_table_registrations,
          Key: { email: { S: key.email }, year: { N: key.year.toString() } }
        }
      }]
    })
  );
}

/**
 * @param {DynamoDBClient} db
 * @param {*} data
 */
async function processRequest(db, data) {
  switch (data.command) {
    case "optout":
      await optout(db, data.params);
      break;
    case "approve":
      await approve(db, data.params);
      break;
    case "approveVolunteer":
      await approveVolunteer(db, data.params);
      break;
    case "invoiced":
      await invoiced(db, data.params);
      break;
    case "edit":
      await editRegistration(db, data.params);
      break;
    case "move-to-trash":
      await moveToTrash(db, data.params);
      break;
    case "add":
      await addRegistration(db, data.params);
      break;
  }
}

/**
 * @param {APIGatewayProxyEvent} event
 * @returns {Promise.<APIGatewayProxyResult>}
 */
export async function handler(event) {
  const data = readPayload(event);
  await processRequest(db, data);
  if (getHeader(event.headers, "Accept") === "application/json") {
    return accepted();
  }
  return seeOther(getHeader(event.headers, "Referer"));
}
