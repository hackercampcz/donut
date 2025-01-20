import { createApi, createDB, createQueues, createRoutes } from "@hackercamp/api";
import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import { Output } from "@pulumi/pulumi";
import { registerAutoTags } from "@topmonks/pulumi-aws";
import * as fs from "node:fs";
import { readTemplates } from "./communication";
import * as postmark from "./postmark";

registerAutoTags({
  "user:Project": pulumi.getProject(),
  "user:Stack": pulumi.getStack(),
});

const config = new pulumi.Config();

const domain = config.require("domain");
const donutDomain = config.require("donut-domain");
const webDomain = config.require("web-domain");
const apiDomain = config.require("api-domain");

const account = new cloudflare.Account(
  "rarous",
  {
    name: "rarous",
    enforceTwofactor: true,
  },
  { protect: true },
);

const hackercampCzZone = new cloudflare.Zone(
  "hackercamp.cz",
  {
    accountId: account.id,
    plan: "free",
    zone: domain,
  },
  { protect: true },
);

const hckrCampZone = new cloudflare.Zone(
  "hckr.camp",
  {
    accountId: account.id,
    plan: "free",
    zone: "hckr.camp",
  },
  { protect: true },
);

const postmarkLayout = new postmark.Template("postmark-layout", {
  Name: "Hackercamp styling",
  Alias: `hc-basic`,
  Subject: "Template",
  HtmlBody: fs.readFileSync("../communication/layout.html").toString(),
  TextBody: `{{{ @content }}}`,
  TemplateType: "Layout",
  LayoutTemplate: "",
});
export const postmarkTemplates: Record<string, Output<string>> = {};

for (const args of readTemplates("../communication/")) {
  const template = new postmark.Template(
    `postmark-template-${args.Name}`,
    args,
    { dependsOn: [postmarkLayout] },
  );
  const key = args.Alias.replace(/-/g, "_");
  postmarkTemplates[key] = template.id;
}

export const queues = createQueues({ postmarkTemplates });

const db = createDB({ queues, postmarkTemplates });

export const dataTables = {
  registrations: db.registrationsDataTable,
  contacts: db.contactsDataTable,
  optOuts: db.optOutsDataTable,
  attendees: db.attendeesDataTable,
  program: db.programDataTable,
  postmark: db.postmarkDataTable,
};

const routes = createRoutes({ queues, db, postmarkTemplates });
const api = createApi("hc-api", "v1", apiDomain, routes.get("v1"));
export const apiUrl = new URL("/v1/", `https://${apiDomain}`).href;

const webPages = new cloudflare.PagesProject("web", {
  accountId: account.id,
  name: "hackercamp-web",
  productionBranch: "trunk",
  deploymentConfigs: {
    production: {
      compatibilityDate: "2023-09-29",
      environmentVariables: {
        HC_API_HOSTNAME: config.require("api-domain"),
        HC_DONUT_HOSTNAME: config.require("donut-domain"),
        HC_WEB_HOSTNAME: config.require("domain"),
      },
    },
  },
});

// APEX records for redirect to www (redirect is currently handled in hckr.studio/webs stack)
new cloudflare.Record(`${webDomain}/apex-dns-record`, {
  zoneId: hackercampCzZone.id,
  name: "@",
  type: "A",
  value: "192.0.2.1",
  ttl: 1,
  proxied: true,
});

new cloudflare.Record(`${webDomain}/apex-ipv6-dns-record`, {
  zoneId: hackercampCzZone.id,
  name: "@",
  type: "AAAA",
  value: "100::",
  ttl: 1,
  proxied: true,
});

const wwwRecord = new cloudflare.Record(`${webDomain}/dns-record`, {
  zoneId: hackercampCzZone.id,
  name: "www",
  type: "CNAME",
  value: webPages.domains[0],
  ttl: 1,
  proxied: true,
});

const webPagesDomain = new cloudflare.PagesDomain("web-domain", {
  accountId: account.id,
  domain: wwwRecord.hostname,
  projectName: webPages.name,
});

const donutPages = new cloudflare.PagesProject("donut", {
  accountId: account.id,
  name: "hackercamp-donut",
  productionBranch: "trunk",
  deploymentConfigs: {
    production: {
      compatibilityDate: "2023-09-29",
      environmentVariables: {
        HC_API_HOSTNAME: config.require("api-domain"),
        HC_DONUT_HOSTNAME: config.require("donut-domain"),
        HC_WEB_HOSTNAME: config.require("domain"),
      },
      secrets: {
        HC_JWT_SECRET: config.require("private-key"),
      },
    },
  },
});

const donutRecord = new cloudflare.Record(`${donutDomain}/dns-record`, {
  zoneId: hackercampCzZone.id,
  name: "donut",
  type: "CNAME",
  value: donutPages.domains[0],
  ttl: 1,
  proxied: true,
});

const donutPagesDomain = new cloudflare.PagesDomain("donut-domain", {
  accountId: account.id,
  domain: donutRecord.hostname,
  projectName: donutPages.name,
});

const apiPages = new cloudflare.PagesProject("api", {
  accountId: account.id,
  name: "hackercamp-api",
  productionBranch: "trunk",
  deploymentConfigs: {
    production: {
      compatibilityDate: "2023-09-29",
      environmentVariables: {
        HC_API_HOSTNAME: config.require("api-domain"),
        HC_DONUT_HOSTNAME: config.require("donut-domain"),
        HC_WEB_HOSTNAME: config.require("domain"),
        API_HOST: api.url.apply((x) => new URL("/v1/", x).href),
        FAKTUROID_CLIENT_ID: config.require("fakturoid-client-id"),
      },
      secrets: {
        FAKTUROID_CLIENT_SECRET: config.require("fakturoid-client-secret"),
      }
    },
  },
});

const apiRecord = new cloudflare.Record(`${apiDomain}/dns-record`, {
  zoneId: hackercampCzZone.id,
  name: "api",
  type: "CNAME",
  value: apiPages.domains[0],
  ttl: 1,
  proxied: true,
});

const apiPagesDomain = new cloudflare.PagesDomain("api-domain", {
  accountId: account.id,
  domain: apiRecord.hostname,
  projectName: apiPages.name,
});

new cloudflare.Record(`hckr.camp/apex-dns-record`, {
  zoneId: hckrCampZone.id,
  name: "@",
  type: "A",
  value: "192.0.2.1",
  ttl: 1,
  proxied: true,
});

new cloudflare.Record(`hckr.camp/apex-ipv6-dns-record`, {
  zoneId: hckrCampZone.id,
  name: "@",
  type: "AAAA",
  value: "100::",
  ttl: 1,
  proxied: true,
});

new cloudflare.Record(`hckr.camp/www-dns-record`, {
  zoneId: hckrCampZone.id,
  name: "www",
  type: "A",
  value: "192.0.2.1",
  ttl: 1,
  proxied: true,
});

new cloudflare.Record(`hckr.camp/www-ipv6-dns-record`, {
  zoneId: hckrCampZone.id,
  name: "www",
  type: "AAAA",
  value: "100::",
  ttl: 1,
  proxied: true,
});

new cloudflare.Record(`hckr.camp/donut-dns-record`, {
  zoneId: hckrCampZone.id,
  name: "donut",
  type: "A",
  value: "192.0.2.1",
  ttl: 1,
  proxied: true,
});

new cloudflare.Record(`hckr.camp/donut-ipv6-dns-record`, {
  zoneId: hckrCampZone.id,
  name: "donut",
  type: "AAAA",
  value: "100::",
  ttl: 1,
  proxied: true,
});
