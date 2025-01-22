import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { attributes, mapper } from "@hackercamp/lib/attendee.js";
import { selectKeys } from "@hackercamp/lib/object.js";
import Rollbar from "../../rollbar.mjs";
import { attendeeAnnouncement, postChatMessage, postMessage } from "../../slack.mjs";

/** @typedef {import("aws-lambda").SQSEvent} SQSEvent */

const db = new DynamoDBClient({});
const rollbar = Rollbar.init({ lambdaName: "sqs-slack" });
const { db_table_attendees, db_table_contacts, db_table_registrations } = process.env;

async function getAttendee(slackID, year) {
  console.log({ event: "Get attendee", year, slackID });
  const resp = await db.send(
    new GetItemCommand({
      TableName: db_table_attendees,
      Key: { slackID: { S: slackID }, year: { N: year.toString() } }
    })
  );
  return resp.Item ? unmarshall(resp.Item) : null;
}

function createContact({ id, profile, name }) {
  console.log({ event: "Create contact", slackID: id });
  return db.send(
    new PutItemCommand({
      TableName: db_table_contacts,
      Item: marshall({
        email: profile.email,
        slackID: id,
        slug: name,
        name: profile.real_name,
        image: profile.image_512
      }, { removeUndefinedValues: true, convertEmptyValues: true })
    })
  );
}

async function createAttendee({ id, profile, name }, record) {
  console.log({ event: "Create attendee", slackID: id });
  return db.send(
    new PutItemCommand({
      TableName: db_table_attendees,
      Item: marshall(
        Object.assign({}, {
          email: profile.email,
          slackID: id,
          slug: name,
          name: profile.real_name,
          image: profile.image_512
        }, selectKeys(record, attributes, mapper)),
        { removeUndefinedValues: true, convertEmptyValues: true }
      )
    })
  );
}

async function getContact(email, slackID) {
  console.log({ event: "Get contact", email, slackID });
  const resp = await db.send(
    new GetItemCommand({ TableName: db_table_contacts, Key: { email: { S: email }, slackID: { S: slackID } } })
  );
  return resp.Item ? unmarshall(resp.Item) : null;
}

async function getAttendeeByEmail(email, year) {
  console.log({ event: "Get attendee", year, email });
  const resp = await db.send(
    new ScanCommand({
      TableName: db_table_attendees,
      FilterExpression: "#email = :email and #year = :year",
      ExpressionAttributeValues: { ":email": { S: email }, ":year": { N: year.toString() } },
      ExpressionAttributeNames: { "#email": "email", "#year": "year" }
    })
  );
  return resp.Item ? unmarshall(resp.Item) : null;
}

async function deleteAttendee(slackID, year) {
  console.log({ event: "Delete attendee", slackID, year });
  return db.send(
    new DeleteItemCommand({
      TableName: db_table_attendees,
      Key: { slackID: { S: slackID }, year: { N: year.toString() } }
    })
  );
}

async function getRegistration(email, year) {
  console.log({ event: "Get registration", email, year });
  const resp = await db.send(
    new GetItemCommand({
      TableName: db_table_registrations,
      Key: { email: { S: email }, year: { N: year.toString() } }
    })
  );
  return resp.Item ? unmarshall(resp.Item) : null;
}

function updateAttendee(attendee, user) {
  console.log({ event: "Update attendee", slackID: user.id });
  return db.send(
    new PutItemCommand({
      TableName: db_table_attendees,
      Item: marshall(
        Object.assign({}, attendee, {
          email: user.profile.email ?? attendee.email,
          name: user.profile.real_name ?? attendee.name,
          image: user.profile.image_512,
          company: user.profile?.fields?.Xf03A7A5815F?.alt ?? attendee.company
        }),
        { removeUndefinedValues: true, convertEmptyValues: true }
      )
    })
  );
}

function updateContact(contact, user) {
  console.log({ event: "Update contact", slackID: user.id });
  return db.send(
    new PutItemCommand({
      TableName: db_table_contacts,
      Item: marshall(
        Object.assign({}, contact, {
          email: user.profile.email ?? contact.email,
          name: user.profile.real_name ?? contact.name,
          image: user.profile.image_512,
          company: user.profile?.fields?.Xf03A7A5815F?.alt ?? contact.company
        }),
        { removeUndefinedValues: true, convertEmptyValues: true }
      )
    })
  );
}

function saveAttendeeAnnouncementRef({ slackID, year }, announcement) {
  console.log({ event: "Update attendee announcement", slackID, year, announcement });
  return db.send(
    new UpdateItemCommand({
      TableName: db_table_attendees,
      Key: { slackID: { S: slackID }, year: { N: year.toString() } },
      UpdateExpression: "SET announcement = :announcement",
      ExpressionAttributeValues: {
        ":announcement": { M: { channel: { S: announcement.channel }, ts: { S: announcement.ts } } }
      }
    })
  );
}

async function sendAttendeeAnnouncement({ slackID, year }, { slack_bot_token, slack_announcement_channel }) {
  console.log({ event: "Send announcement message", slackID, year });
  const attendee = await getAttendee(slackID, year);
  if (!attendee) {
    console.log({ event: "No attendee found", slackID, year });
    return;
  }
  const { ok, channel, ts, ...rest } = await postMessage(
    slack_bot_token,
    slack_announcement_channel,
    attendeeAnnouncement({
      slackID: attendee.slackID,
      name: attendee.name,
      image: attendee.image,
      travel: attendee.travel,
      ticketType: attendee.ticketType
    })
  );
  if (ok) {
    await saveAttendeeAnnouncementRef(attendee, { channel, ts });
  } else {
    rollbar.error(rest);
  }
}

async function onTeamJoin({ user }, { year }) {
  const { email } = user.profile;
  console.log({ event: "Team join", email });
  const [registration, attendee] = await Promise.all([getRegistration(email, year), getAttendeeByEmail(email, year)]);
  if (attendee) {
    console.log({ event: "Attendee already exists", email });
    await Promise.all([
      deleteAttendee(attendee.slackID, attendee.year),
      updateAttendee(Object.assign({}, attendee, { slackID: user.id }), user),
      postChatMessage(
        user.id,
        `Ahoj, táborníku,

Vítej v našem slacku. Hacker Camp se blíží. Snad se těšíš stejně jako my.

Nastav si, prosím, svou profilovou fotku, ať tě ostatní poznají nejen
v kanále #kdo_prijede_na_camp.

Můžeš se připojit k jakémukoliv kanálu, který Tě zajímá.
Můžeš sledovat novinky o #program, festivalovém line-upu i nám z org týmu koukat pod ruce.
Nebo se můžeš kouknout, kde a jak zapojit své ruce k dílu → #hands_wanted.

Pokud chceš nebo nabízíš spolujízdu na camp, tak tady → #spolujizda.
Pokud nabízíš volné místo ve stanu či chatce, tak tu → #spolubydleni.
Důležité novinky najdeš v kanále #general.

Máš otázky? Neváhej se na nás obrátit. Help line: team@hackercamp.cz`
      )
    ]);
  } else if (registration && !registration.paid) {
    console.log({ event: "Registration not paid", email });
    await Promise.all([
      createContact(user),
      postChatMessage(
        user.id,
        `Ahoj, táborníku,

Vítej v našem slacku. Hacker Camp se blíží. Snad se těšíš stejně jako my.

Nastav si, prosím, svou profilovou fotku, ať tě ostatní poznají.

Nejspíše ses sem dostals dříve než bys měls. Na další kroky budeš muset počkat,
až ti přijde faktura a ty ji zaplatíš. :) Zatím užívej naší komunitu!

Máš otázky? Neváhej se na nás obrátit. Help line: team@hackercamp.cz`
      )
    ]);
  } else if (registration?.paid) {
    console.log({ event: "Registration paid", email });
    await Promise.all([
      createContact(user),
      createAttendee(user, registration),
      postChatMessage(
        user.id,
        `Ahoj, táborníku,

Vítej v našem slacku. Hacker Camp se blíží. Snad se těšíš stejně jako my.

Nastav si, prosím, svou profilovou fotku, ať tě ostatní poznají nejen
v kanále #kdo_prijede_na_camp.

Můžeš se připojit k jakémukoliv kanálu, který Tě zajímá.
Můžeš sledovat novinky o #program, festivalovém line-upu i nám z org týmu koukat pod ruce.
Nebo se můžeš kouknout, kde a jak zapojit své ruce k dílu → #hands_wanted.

Pokud chceš nebo nabízíš spolujízdu na camp, tak tady → #spolujizda.
Pokud nabízíš volné místo ve stanu či chatce, tak tu → #spolubydleni.
Důležité novinky najdeš v kanále #general.

Máš otázky? Neváhej se na nás obrátit. Help line: team@hackercamp.cz`
      ),
      sendAttendeeAnnouncement({ slackID: user.id, year }, process.env)
    ]);
  }
}

async function onUserProfileChanged({ user }, { year }) {
  const { id: slackID, profile: { email } } = user;
  console.log({ event: "Profile update", email, slackID });
  const [contact, attendee] = await Promise.all([getContact(email, slackID), getAttendee(slackID, year)]);
  if (!contact) {
    return console.log({ event: "Contact not found", email, slackID });
  }
  await updateContact(contact, user);
  if (attendee) await updateAttendee(attendee, user);
}

async function dispatchMessageByType(message) {
  switch (message.event) {
    case "team-join":
      await onTeamJoin(message.payload, process.env);
      break;
    case "user-profile-changed":
      await onUserProfileChanged(message.payload, process.env);
      break;
    case "send-welcome-message":
      await sendAttendeeAnnouncement(message, process.env);
      break;
    // TODO: Move all slack messages here
    default:
      throw new Error("Unknown event: " + message.event);
  }
}

/**
 * @param {SQSEvent} event
 * @returns {Promise<void>}
 */
export async function sqsSlack(event) {
  rollbar.configure({ payload: { event } });
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      await dispatchMessageByType(message);
    } catch (err) {
      rollbar.error(err);
    }
  }
}

export const handler = rollbar.lambdaHandler(sqsSlack);
