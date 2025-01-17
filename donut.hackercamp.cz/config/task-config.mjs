import { texyTypography } from "@hckr_/blendid/lib/texy.mjs";
import projectPath from "@hckr_/blendid/lib/projectPath.mjs";
import gulpMode from "gulp-mode";
import fs from "node:fs";
import path from "node:path";
import OpenProps from "open-props";
import jitProps from "postcss-jit-props";
import data from "../src/data/global.mjs";
import { HackersRegistry } from "./hackers-registry.mjs";
import pathConfig from "./path-config.mjs";
import { WorkboxBuildRegistry } from "./workboxbuild.mjs";

/** @typedef {import("@types/nunjucks").Environment} Environment */

const mode = gulpMode();

function assetPath(destPath, key) {
  const revManifest = path.join(destPath, "rev-manifest.json");
  if (fs.existsSync(revManifest)) {
    const manifest = JSON.parse(fs.readFileSync(revManifest).toString());
    return path.join(destPath, manifest[key]);
  }
  return path.join(destPath, key);
}

/**
 * @param {Date|null} x
 * @returns {string|null}
 */
const formatDateTime = (x, locale) =>
  x?.toLocaleString(locale, { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
  ?? null;

export default {
  images: true,
  cloudflare: true,
  cloudinary: true,
  fonts: true,
  svgSprite: true,
  static: true,
  esbuild: true,

  stylesheets: { postcss: { plugins: [jitProps(OpenProps)] } },

  html: {
    data: {
      collections: [
        "build",
        "images",
        "hackers",
        "housing_index",
        "housing_types",
        "housing_variants",
        "housing_reservations"
      ],
    },
    markedExtensions: [texyTypography("cs")],
    nunjucksRender: {
      filters: {
        formatDateTime(s, locale = "cs-CZ") {
          const date = new Date(s);
          return formatDateTime(date, locale);
        },
        price(x, currency, locale = "cs-CZ") {
          return new Intl.NumberFormat(locale, {
            style: currency ? "currency" : undefined,
            currency,
            maximumFractionDigits: 0
          }).format(x).replace(/\u00A0/, "\u202F");
        }
      }
    }
  },

  generate: {
    html: [{ collection: "hackers", template: "shared/hacker.njk", route: (x) => `hackers/${x[0]}/index.html` }]
  },

  vite: { browser: "google chrome canary", browserArgs: "--ignore-certificate-errors --allow-insecure-localhost" },

  production: { rev: true },

  registries: [
    new HackersRegistry({ slackToken: process.env["SLACK_TOKEN"], year: data.year }, pathConfig),
    new WorkboxBuildRegistry({
      swSrc: () => assetPath(projectPath(pathConfig.dest), "assets/esm/sw.js"),
      swDest: projectPath(pathConfig.dest, "assets/esm/sw.js"),
      globDirectory: pathConfig.dest,
      globPatterns: ["**/*.html", "assets/**/*.{js,mjs,css}"],
      globIgnores: [
        "hackers/**/*.html",
        "admin/**/*.html",
        "ubytovani/**/*.html",
        "program/**/*.html",
        "registrace/**/*.html"
      ]
    }, pathConfig)
  ],

  additionalTasks: {
    development: { prebuild: ["prepare-data"], postbuild: ["workboxBuild"] },
    production: { prebuild: ["prepare-data"], postbuild: ["workboxBuild"] }
  }
};
