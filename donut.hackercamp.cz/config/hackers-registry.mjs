import projectPath from "@hckr_/blendid/lib/projectPath.mjs";
import logger from "fancy-log";
import fs from "node:fs";
import DefaultRegistry from "undertaker-registry";

export class HackersRegistry extends DefaultRegistry {
  constructor(config, pathConfig) {
    super();
    this.config = config;
    this.dest = projectPath(pathConfig.src, pathConfig.data.src, "hackers.json");
  }
  init({ task }) {
    async function getSlackProfiles(token) {
      logger.info("Loading Slack profiles…");
      const skip = new Set(["slackbot", "jakub"]);
      const resp = await fetch("https://slack.com/api/users.list", { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      if (!resp.ok) {
        logger.warn("Slack profiles:", data.error);
      }
      return new Map(data.members?.filter((x) => !(x.is_bot || skip.has(x.name)))?.map((x) => [x.id, x.profile]));
    }

    async function getAttendees(year) {
      logger.info(`Loading ${year} attendees…`);
      const resp = await fetch(`https://api.hackercamp.cz/v1/attendees?year=${year}`);
      return resp.json();
    }

    task("prepare-data", async () => {
      const [profiles, items] = await Promise.all([
        getSlackProfiles(this.config.slackToken),
        getAttendees(this.config.year)
      ]);
      const attendees = items.map((x) => [x.slug, profiles.get(x.slackID), x]);
      return fs.promises.writeFile(this.dest, JSON.stringify(attendees, null, 2), { encoding: "utf-8" });
    });
  }
}
