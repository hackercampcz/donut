import * as lambdaBuilder from "@hackercamp/infrastructure/lambda-builder";
import * as aws from "@pulumi/aws";
import { lambda } from "@pulumi/aws/types/input";
import { LambdaAuthorizer, Method } from "@pulumi/awsx/classic/apigateway";
import { Parameter } from "@pulumi/awsx/classic/apigateway/requestValidator";
import * as pulumi from "@pulumi/pulumi";
import { Api, ApiRoute, CacheSettings } from "@topmonks/pulumi-aws";
import * as path from "node:path";

const config = new pulumi.Config();
const postmarkConfig = new pulumi.Config("postmark");

const algoliaEnv = {
  algolia_app_id: config.require("algolia-app-id"),
  algolia_admin_key: config.require("algolia-admin-key"),
  algolia_search_key: config.require("algolia-search-key"),
};
const rollbar_access_token = config.require("rollbar-access-token");

export function createRoutes({
  queues,
  db,
  postmarkTemplates,
}: Record<string, any>) {
  return new Map<string, Record<string, RouteArgs>>([
    [
      "v1",
      {
        attendees: {
          httpMethod: "ANY",
          path: "/attendees",
          fileName: "attendees/index.mjs",
          environment: {
            variables: {
              rollbar_access_token,
              db_table_attendees: db.attendeesDataTable,
              postmark_token: postmarkConfig.require("server-api-token"),
              algolia_index_name: config.require("algolia-attendees-index-name"),
              ...algoliaEnv,
              ...postmarkTemplates,
            },
          },
        },
        auth: {
          httpMethod: "POST",
          path: "/auth",
          fileName: "auth/index.mjs",
          environment: {
            variables: {
              rollbar_access_token,
              hostname: config.require("donut-domain"),
              private_key: config.require("private-key"),
              slack_client_id: config.require("slack-client-id"),
              slack_client_secret: config.require("slack-client-secret"),
              postmark_token: postmarkConfig.require("server-api-token"),
              ...postmarkTemplates,
            },
          },
        },
        authSignOut: {
          httpMethod: "GET",
          path: "/auth/sign-out",
          fileName: "auth/sign-out.mjs",
          environment: {
            variables: {
              rollbar_access_token,
              hostname: config.require("donut-domain"),
              postmark_token: postmarkConfig.require("server-api-token"),
              ...postmarkTemplates,
            },
          },
        },
        contacts: {
          httpMethod: "GET",
          path: "/contacts",
          fileName: "contacts/index.mjs",
          environment: {
            variables: {
              rollbar_access_token,
              db_table_contacts: db.contactsDataTable,
              hostname: config.require("web-domain"),
              donut: config.require("donut-domain"),
              private_key: config.require("private-key"),
              postmark_token: postmarkConfig.require("server-api-token"),
              ...postmarkTemplates,
            },
          },
        },
        registration: {
          httpMethod: "ANY",
          path: "/registration",
          fileName: "registration/index.mjs",
          environment: {
            variables: {
              rollbar_access_token,
              db_table_registrations: db.registrationsDataTable,
              hostname: config.require("web-domain"),
              donut: config.require("donut-domain"),
              private_key: config.require("private-key"),
              postmark_token: postmarkConfig.require("server-api-token"),
              ...postmarkTemplates,
            },
          },
        },
        housing: {
          httpMethod: "ANY",
          path: "/housing",
          fileName: "housing/index.mjs",
          environment: {
            variables: {
              rollbar_access_token,
              donut: config.require("donut-domain"),
              db_table_attendees: db.attendeesDataTable,
              private_key: config.require("private-key"),
              slack_bot_token: config.require("slack-bot-token"),
              algolia_index_name: config.require("algolia-attendees-index-name"),
              ...algoliaEnv,
            },
          },
        },
        program: {
          httpMethod: "ANY",
          path: "/program",
          fileName: "program/index.mjs",
          environment: {
            variables: {
              rollbar_access_token,
              db_table_registrations: db.registrationsDataTable,
              private_key: config.require("private-key"),
            },
          },
        },
        optout: {
          httpMethod: "POST",
          path: "/optout",
          fileName: "optout/index.mjs",
          environment: {
            variables: {
              rollbar_access_token,
            },
          },
        },
        adminRegistrations: {
          httpMethod: "ANY",
          path: "/admin/registrations",
          fileName: "admin/registrations/index.mjs",
          environment: {
            variables: {
              year: config.require("year"),
              rollbar_access_token,
              db_table_optouts: db.optOutsDataTable,
              db_table_registrations: db.registrationsDataTable,
              private_key: config.require("private-key"),
              fakturoid_client_id: config.require("fakturoid-client-id"),
              fakturoid_client_secret: config.require("fakturoid-client-secret"),
              postmark_token: postmarkConfig.require("server-api-token"),
              algolia_index_name: config.require("algolia-registrations-index-name"),
              ...algoliaEnv,
              ...postmarkTemplates,
            },
          },
        },
        adminAttendees: {
          httpMethod: "ANY",
          path: "/admin/attendees",
          fileName: "admin/attendees/index.mjs",
          environment: {
            variables: {
              year: config.require("year"),
              rollbar_access_token,
              db_table_attendees: db.attendeesDataTable,
              private_key: config.require("private-key"),
              postmark_token: postmarkConfig.require("server-api-token"),
              algolia_index_name: config.require("algolia-attendees-index-name"),
              ...algoliaEnv,
              ...postmarkTemplates,
            },
          },
        },
        adminHousing: {
          httpMethod: "ANY",
          path: "/admin/housing",
          fileName: "admin/housing/index.mjs",
          environment: {
            variables: {
              year: config.require("year"),
              rollbar_access_token,
              db_table_attendees: db.attendeesDataTable,
              private_key: config.require("private-key"),
              algolia_index_name: config.require("algolia-attendees-index-name"),
              ...algoliaEnv,
            },
          },
        },
        adminProgram: {
          httpMethod: "ANY",
          path: "/admin/program",
          fileName: "admin/program/index.mjs",
          environment: {
            variables: {
              year: config.require("year"),
              rollbar_access_token,
              db_table_attendees: db.attendeesDataTable,
              db_table_program: db.programDataTable,
              private_key: config.require("private-key"),
              postmark_token: postmarkConfig.require("server-api-token"),
              ...postmarkTemplates,
            },
          },
        },
        ares: {
          httpMethod: "GET",
          path: "/ares",
          fileName: "ares/index.mjs",
          requiredParameters: [{ in: "query", name: "ico" }],
          cache: { ttl: 3600 },
          memorySize: 512,
          environment: {
            variables: {
              rollbar_access_token,
            },
          },
        },
        fakturoidWebhook: {
          httpMethod: "POST",
          path: "/webhooks/fakturoid",
          fileName: "fakturoid/webhook.mjs",
          environment: {
            variables: {
              rollbar_access_token,
              db_table_registrations: db.registrationsDataTable,
              TOKEN: config.require("fakturoid-webhook-token"),
              postmark_token: postmarkConfig.require("server-api-token"),
              ...postmarkTemplates,
            },
          },
        },
        postmarkWebhook: {
          httpMethod: "POST",
          path: "/webhooks/postmark",
          fileName: "postmark/webhook.mjs",
          environment: {
            variables: {
              db_table_postmark: db.postmarkDataTable,
              token: config.require("postmark-webhook-token"),
              rollbar_access_token,
            },
          },
        },
        slackWebhook: {
          httpMethod: "POST",
          path: "/webhooks/slack",
          fileName: "slack/webhook.mjs",
          environment: {
            variables: {
              year: config.require("year"),
              rollbar_access_token,
              slack_queue_url: queues.slackQueueUrl,
              slack_bot_token: config.require("slack-bot-token"),
              postmark_token: postmarkConfig.require("server-api-token"),
              ...postmarkTemplates,
            },
          },
        },
        nfctron: {
          httpMethod: "GET",
          path: "/nfctron",
          fileName: "nfctron/index.mjs",
          environment: {
            variables: {
              rollbar_access_token,
            },
          },
        },
      },
    ],
  ]);
}

function hcName(t: string, options?: { stage?: string }) {
  const suffix = options?.stage ? `-${options.stage}` : "";
  return `hc-${t}${suffix}`;
}

const buildAssets = (fileName: string) =>
  lambdaBuilder.buildCodeAsset(
    path.join(__dirname, "src", "lambda", fileName),
    {
      minify: false,
      format: "esm",
      external: [
        "@aws-sdk/client-dynamodb",
        "@aws-sdk/util-dynamodb",
        "@aws-sdk/client-sqs",
      ],
    },
  );

const getHandler = (
  name: string,
  fileName: string,
  role: aws.iam.Role,
  { environment, timeout = 15, memorySize = 128 }: HandlerArgs,
): aws.lambda.Function =>
  new aws.lambda.Function(name, {
    publish: true,
    runtime: "nodejs20.x",
    architectures: ["arm64"],
    role: role.arn,
    handler: "index.handler",
    code: buildAssets(fileName),
    memorySize,
    timeout, // reasonable timeout for initial request without 500
    environment,
  });

const getRouteHandler = (
  name: string,
  fileName: string,
  role: aws.iam.Role,
  { stage, ...args }: RouteHandlerArgs,
): aws.lambda.Function => getHandler(hcName(`api-${name}-lambda`, { stage }), fileName, role, args);

const getTableEventHandler = (
  name: string,
  fileName: string,
  role: aws.iam.Role,
  args: HandlerArgs,
): aws.lambda.Function =>
  getHandler(
    hcName(`dynamodb-${name}-lambda`),
    path.join("dynamodb", fileName),
    role,
    args,
  );

const getSQSHandler = (
  name: string,
  fileName: string,
  role: aws.iam.Role,
  args: HandlerArgs,
): aws.lambda.Function =>
  getHandler(
    hcName(`sqs-${name}-lambda`),
    path.join("sqs", fileName),
    role,
    args,
  );

export function createDB({ queues, postmarkTemplates }) {
  const defaultLambdaRole = createDefaultLambdaRole("dynamodb");

  const optOuts = new aws.dynamodb.Table("optouts", {
    name: "optouts",
    hashKey: "email",
    rangeKey: "year",
    attributes: [
      { name: "email", type: "S" },
      { name: "year", type: "N" },
    ],
    billingMode: "PAY_PER_REQUEST",
  });

  const registrations = new aws.dynamodb.Table("registrations", {
    name: "registrations",
    hashKey: "email",
    rangeKey: "year",
    attributes: [
      { name: "email", type: "S" },
      { name: "year", type: "N" },
      { name: "id", type: "S" },
      { name: "invoice_id", type: "N" },
    ],
    billingMode: "PAY_PER_REQUEST",
    streamEnabled: true,
    streamViewType: "NEW_AND_OLD_IMAGES",
    globalSecondaryIndexes: [
      { name: "registrations-by-id", hashKey: "id", projectionType: "KEYS_ONLY" },
      { name: "registrations-by-invoice-id", hashKey: "invoice_id", rangeKey: "email", projectionType: "KEYS_ONLY" },
    ],
  });
  registrations.onEvent(
    "paidRegistration",
    getTableEventHandler("paid-registration", "registrations/paid.mjs", defaultLambdaRole, {
      environment: {
        variables: {
          rollbar_access_token,
          slack_queue_url: queues.slackQueueUrl,
          postmark_token: postmarkConfig.get("server-api-token"),
          ...postmarkTemplates,
        },
      },
    }),
    { startingPosition: "LATEST" },
  );
  registrations.onEvent(
    "search-indexing-registrations",
    getTableEventHandler("search-indexing-registrations", "registrations/search-index.mjs", defaultLambdaRole, {
      environment: {
        variables: {
          rollbar_access_token,
          slack_bot_token: config.get("slack-bot-token"),
          algolia_index_name: config.get("algolia-registrations-index-name"),
          ...algoliaEnv,
        },
      },
    }),
    { startingPosition: "LATEST" },
  );

  const attendees = new aws.dynamodb.Table("attendees", {
    name: "attendees",
    hashKey: "slackID",
    rangeKey: "year",
    attributes: [
      { name: "slackID", type: "S" },
      { name: "year", type: "N" },
      { name: "email", type: "S" },
    ],
    billingMode: "PAY_PER_REQUEST",
    streamEnabled: true,
    streamViewType: "NEW_AND_OLD_IMAGES",
    globalSecondaryIndexes: [{
      name: "attendees-by-email",
      hashKey: "email",
      rangeKey: "year",
      projectionType: "KEYS_ONLY",
    }],
  });
  attendees.onEvent(
    "search-indexing-attendees",
    getTableEventHandler("search-indexing-attendees", "attendees/search-index.mjs", defaultLambdaRole, {
      environment: {
        variables: {
          rollbar_access_token,
          slack_bot_token: config.get("slack-bot-token"),
          algolia_index_name: config.get("algolia-attendees-index-name"),
          ...algoliaEnv,
        },
      },
    }),
    { startingPosition: "LATEST" },
  );

  const contacts = new aws.dynamodb.Table("contacts", {
    name: "contacts",
    hashKey: "email",
    rangeKey: "slackID",
    attributes: [
      { name: "email", type: "S" },
      { name: "slackID", type: "S" },
    ],
    billingMode: "PAY_PER_REQUEST",
    streamEnabled: true,
    streamViewType: "NEW_AND_OLD_IMAGES",
  });
  contacts.onEvent(
    "contact-image-changed",
    getTableEventHandler("contact-image-changed", "contacts/image-changed.mjs", defaultLambdaRole, {
      environment: {
        variables: {
          year: config.require("year"),
          rollbar_access_token,
          slack_bot_token: config.require("slack-bot-token"),
          db_table_attendees: attendees.name,
        },
      },
    }),
    { startingPosition: "LATEST" },
  );

  const program = new aws.dynamodb.Table("program", {
    name: "program",
    hashKey: "_id",
    rangeKey: "year",
    attributes: [
      { name: "_id", type: "S" },
      { name: "year", type: "N" },
    ],
    billingMode: "PAY_PER_REQUEST",
  });

  const postmark = new aws.dynamodb.Table("postmark", {
    name: "postmark",
    hashKey: "MessageID",
    rangeKey: "RecordType",
    attributes: [
      { name: "MessageID", type: "S" },
      { name: "RecordType", type: "S" },
    ],
    billingMode: "PAY_PER_REQUEST",
    streamEnabled: true,
    streamViewType: "NEW_IMAGE",
  });
  postmark.onEvent(
    "postmark-subscription-change",
    getTableEventHandler("postmark-subscription-change", "postmark/subscription-change.mjs", defaultLambdaRole, {
      environment: {
        variables: {
          db_table_optouts: optOuts.name,
          year: config.require("year"),
        },
      },
    }),
    { startingPosition: "LATEST" },
  );

  const trash = new aws.dynamodb.Table("trash", {
    name: "trash",
    hashKey: "email",
    rangeKey: "year",
    attributes: [
      { name: "email", type: "S" },
      { name: "year", type: "N" },
    ],
    billingMode: "PAY_PER_REQUEST",
  });

  return pulumi.Output.create({
    registrationsDataTable: registrations.name,
    contactsDataTable: contacts.name,
    optOutsDataTable: optOuts.name,
    attendeesDataTable: attendees.name,
    programDataTable: program.name,
    postmarkDataTable: postmark.name,
    trashDataTable: trash.name,
  });
}

export function createDefaultLambdaRole(stage) {
  const defaultLambdaRole = new aws.iam.Role(
    hcName("default-lambda-role", { stage }),
    {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(
        aws.iam.Principals.LambdaPrincipal,
      ),
    },
  );

  new aws.iam.RolePolicyAttachment(
    hcName("lambda-basic-execution-attachment", { stage }),
    {
      policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
      role: defaultLambdaRole,
    },
  );

  new aws.iam.RolePolicyAttachment(
    hcName("lambda-dynamo-read-write-attachment", { stage }),
    {
      policyArn: aws.iam.ManagedPolicy.AmazonDynamoDBFullAccess,
      role: defaultLambdaRole,
    },
  );

  new aws.iam.RolePolicyAttachment(
    hcName("lambda-s3-read-attachment", { stage }),
    {
      policyArn: aws.iam.ManagedPolicy.AmazonS3ReadOnlyAccess,
      role: defaultLambdaRole,
    },
  );

  new aws.iam.RolePolicyAttachment(hcName("lambda-sqs-attachment", { stage }), {
    policyArn: aws.iam.ManagedPolicy.AmazonSQSFullAccess,
    role: defaultLambdaRole,
  });
  return defaultLambdaRole;
}

export function createQueues({ postmarkTemplates }) {
  const defaultRole = createDefaultLambdaRole("sqs");
  const slackQueue = new aws.sqs.Queue(hcName("slack-message-queue"), {});
  slackQueue.onEvent(
    "slack-message",
    getSQSHandler("slack", "slack/handler.mjs", defaultRole, {
      environment: {
        variables: {
          rollbar_access_token,
          year: config.getNumber("year"),
          db_table_attendees: "attendees",
          db_table_contacts: "contacts",
          db_table_registrations: "registrations",
          slack_announcement_channel: config.require("slack-announcement-channel"),
          slack_bot_token: config.require("slack-bot-token"),
          postmark_token: postmarkConfig.require("server-api-token"),
          ...postmarkTemplates,
        },
      },
    }),
  );
  return { slackQueueUrl: slackQueue.url };
}

export function createApi(
  name: string,
  stage: string,
  domain: string,
  routes: Record<string, RouteArgs> | undefined,
) {
  if (!routes) throw new Error("No routes provided");
  const defaultLambdaRole = createDefaultLambdaRole(stage);
  const createHandlerRoute = (
    name: string,
    {
      httpMethod,
      path,
      fileName,
      role,
      requiredParameters,
      cache,
      timeout,
      memorySize,
      authorizers,
      environment,
    }: RouteArgs,
  ): ApiRoute => ({
    type: "handler",
    handler: getRouteHandler(name, fileName, role ?? defaultLambdaRole, {
      timeout: timeout ?? 15,
      memorySize,
      environment,
      stage,
    }),
    authorizers,
    requiredParameters,
    httpMethod,
    path,
    cache,
  });

  const api = new Api(name, {
    stageName: stage,
    description: "HackerCamp API",
    cacheEnabled: false,
    cacheSize: "0.5", // GB
    routes: Object.entries(routes).map(([name, route]) => createHandlerRoute(name, route)),
  });

  return { url: api.gateway.url };
}

interface HandlerArgs {
  timeout?: number;
  environment?: lambda.FunctionEnvironment;
  memorySize?: number;
}

interface RouteHandlerArgs extends HandlerArgs {
  stage?: string;
}

interface RouteArgs {
  httpMethod: Method;
  path: string;
  fileName: string;
  role?: aws.iam.Role;
  requiredParameters?: Parameter[];
  cache?: CacheSettings;
  timeout?: number;
  authorizers?: LambdaAuthorizer[] | LambdaAuthorizer;
  environment?: lambda.FunctionEnvironment;
  memorySize?: number;
}
