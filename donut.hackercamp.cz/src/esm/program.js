import { formatLongDayName, formatShortDayName, formatTime } from "@hackercamp/lib/format.js";
import { defAtom } from "@thi.ng/atom";
import structuredClone from "@ungap/structured-clone";
import { html } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";
import { when } from "lit-html/directives/when.js";
import { renderEventForm } from "./event-form.js";
import { throttle } from "./lib/function.js";
import { instatializeDates } from "./lib/object.js";
import { getSlackProfile, setReturnUrl, signOut } from "./lib/profile.js";
import { withAuthHandler } from "./lib/remoting.js";
import { initRenderLoop } from "./lib/renderer.js";
import * as rollbar from "./lib/rollbar.js";
import { schedule } from "./lib/schedule.js";
import { isISODateTime } from "./lib/validation.js";
import { showModalDialog } from "./modal-dialog.js";

/** @typedef {import("@thi.ng/atom").IAtom} IAtom */
/** @typedef {import("@thi.ng/atom").Path} Path */
/** @typedef {import("@thi.ng/atom").SwapFn} SwapFn */

const SLOT_MINUTES = 15;
const DAY_START_HOUR = 8;

const state = defAtom({
  view: renderProgram,
  campStartAt: new Date(),
  visibleDate: new Date(),
  onLineupsScroll() {},
  campEndAt: new Date(),
  lineups: [],
  events: [],
  profile: {},
  year: 0,
  featureToggles: {}
});

/**
 * @param {SwapFn<T, T>} fn
 * @param {IAtom<T>} [atom]
 */
const transact = (fn, atom = state) => atom.swap(fn);
/**
 * @param {Path} path
 * @param {SwapFn<T, T>} fn
 * @param {IAtom<T>} [atom]
 */
const swapIn = (path, fn, atom = state) => atom.swapInUnsafe(path, fn);

if (globalThis.__DEVELOPMENT__) {
  // export for dev experience
  globalThis.transact = transact;
  globalThis.swapIn = swapIn;
  globalThis.getState = () => state.deref();
}

function makeTimeline(startAt, endAt, minutes = SLOT_MINUTES) {
  const times = [];
  const diff = endAt.getTime() - startAt.getTime();
  const perMinutes = minutes * 60 * 1000;
  const steps = Math.floor(diff / perMinutes);
  for (let i = 0; i < steps; i++) {
    const time = new Date(startAt.getTime() + perMinutes * i);
    times.push(time);
  }
  return times;
}

function makeTick(time) {
  if (time.getMinutes() === 0) {
    return `${time.getHours()}h`;
  } else {
    return `${time.getMinutes()}m`;
  }
}

function makeDayline(startAt, endAt) {
  const dayStart = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate(), DAY_START_HOUR);
  const dayEnd = new Date(endAt.getFullYear(), endAt.getMonth(), endAt.getDate() + 1, DAY_START_HOUR);
  const days = makeTimeline(dayStart, dayEnd, 24 * 60);
  return days;
}

function getSlotNumber(startAt, time, minutes = SLOT_MINUTES) {
  if (!startAt || !time) {
    return 0;
  }

  const diff = time.getTime() - startAt.getTime();
  const perMinutes = minutes * 60 * 1000;
  const steps = diff / perMinutes;
  return steps;
}

function formatEventTimeInfo(event) {
  return html`Začíná v
    <strong
      >${formatLongDayName(event.startAt)} ${formatTime(event.startAt)}</strong
    >
    a končí v
    <strong>${formatTime(event.endAt)}</strong>.`;
}

function getSlotWidth(scrollElement) {
  const slot = scrollElement.querySelector(".lineup__slot");
  return slot.offsetWidth;
}

function scrollToDate(scrollElement, date) {
  const { campStartAt } = state.deref();
  const diff = date - campStartAt;
  if (diff < 0) return;
  const time = diff / 1000 / 60 / SLOT_MINUTES;
  scrollElement.scrollLeft = time * getSlotWidth(scrollElement);
}

function handleLineupsScroll(event) {
  const scrollElement = document.getElementById("lineups");
  const { campStartAt } = state.deref();
  const visibleDate = new Date(campStartAt.getTime());
  const minutesScrolledOut = (event.target.scrollLeft / getSlotWidth(scrollElement)) * SLOT_MINUTES;

  visibleDate.setMinutes(campStartAt.getMinutes() + minutesScrolledOut);
  location.hash = `#${visibleDate.toISOString()}`;

  swapIn("visibleDate", () => visibleDate);
}

function eventTemplate(
  { lineup, event, topicEvents, eventStartAtSlot, eventDurationInSlots, renderAndShowAddEventForm }
) {
  const durationInSlots = eventDurationInSlots(event);
  return html`
    ${
    when(!event.topic, () =>
      html`<div
          class="${
        classMap({
          lineup__event: true,
          "lineup__event--narrow": durationInSlots === 1 && event.title?.length > 3,
          [`lineup__event--${event.type}`]: event.type
        })
      }"
          data-lineup=${lineup.id}
          id=${event.id || event._id}
          style=${`
        --slot-start: ${eventStartAtSlot(event)};
        --slot-duration: ${durationInSlots};
        --slot-top-offset: ${event._top ?? "calc(var(--spacing) / 4)"};
      `}
          @click=${() => showModalDialog(`event-detail-${event.id || event._id}`)}
        >
          <p
            style="${`
          font-weight: ${event.level > 100 ? "bold" : "normal"};
          font-size: ${event.level || 100}%;
          margin: 0;
          line-height: 1.1;
        `}"
          >
            ${event.title}
          </p>
          <div class="people-list">
            ${
        event.people?.map((speaker) =>
          html`
                <figure class="speaker speaker--photo">
                  <img
                    alt="${speaker.name}"
                    src="${speaker.image}"
                    width="32"
                    height="32"
                  />
                </figure>
              `
        )
      }
            ${
        when(event.type === "topic" && event.people?.length, () =>
          html` <figure class="speaker speaker--add">+</figure> `)
      }
          </div>
        </div>`)
  }
    <dialog class="event__detail" id="event-detail-${event.id || event._id}">
      <h1>${event.title}</h1>
      ${
    when(!event.topic, () =>
      html`
          <p>
            ${formatEventTimeInfo(event)}
            <code>${lineup.name}</code><br />
          </p>
        `)
  }
      ${
    when(event.type !== "topic", () =>
      html`
          <div class="people-list">
            ${
        event.people?.map((speaker) =>
          html` <figure class="speaker speaker--full">
                  <img
                    alt="${speaker.name}"
                    src="${speaker.image}"
                    width="32"
                    height="32"
                  />
                  <a href=${`/hackers/${speaker.slug}`}>${speaker.name}</a>
                  ${when(speaker.company, () => html`z ${speaker.company}`)}
                </figure>`
        )
      }
          </div>
        `)
  }

      <p>${event.description}</p>
      ${when(event.place, () => html`<p><strong>Kde to bude:</strong> ${event.place}</p>`)}

      <div class="people-list">
        ${
    (topicEvents || []).map(({ id, _id, title, people = [] }) =>
      html`
            <figure class="speaker speaker--full">
              ${people.map(({ name, image }) => html`<img width="32" height="32" alt=${name} src=${image} />`)}
              <a
                href="#"
                @click=${(e) => {
        e.preventDefault();

        showModalDialog(`event-detail-${id || _id}`);
      }}
                >${title}</a
              >
            </figure>
          `
    )
  }
      </div>
      ${
    when(event.type === "topic", () =>
      html`
          <a
            class="hc-link hc-link--decorated"
            style="margin: calc(var(--spacing) / 2) 0; padding: calc(var(--spacing) / 4);"
            @click=${(e) => {
        e.preventDefault();
        renderAndShowAddEventForm(lineup.id, { selectedTopic: event.id || event._id });
      }}
          >
            Zapojit se
          </a>
          <hr />
        `)
  }
      <button name="close">Zavřít</button>
    </dialog>
  `;
}

function lineUpEvents(lineup, events) {
  return events.filter((event) => event.lineup === lineup.id);
}

function topicEvents({ id }, events) {
  return events.filter(({ topic }) => topic && topic === id);
}

/**
 * TODO: split me?
 * @param {any} state
 */
function renderProgram({ lineups, campStartAt, campEndAt, events, visibleDate, onLineupsScroll, apiHost, profile }) {
  const eventStartAtSlot = (event) => getSlotNumber(campStartAt, event.startAt);
  const eventDurationInSlots = (event) =>
    getSlotNumber(campStartAt, event.endAt) - getSlotNumber(campStartAt, event.startAt);

  const renderAndShowAddEventForm = (lineupId, { preferredTime, selectedTopic = null } = {}) => {
    renderEventForm(document.getElementById("add-event-form"), {
      apiHost,
      profile,
      lineupId,
      campStartAt,
      campEndAt,
      preferredTime,
      events,
      selectedTopic
    });
    // mby close previous modal here
    showModalDialog("add-event");
  };

  return html`
    <style>
      body {
        overflow-anchor: none;
      }

      /**
       * top level container
       */
      .program {
        --spacing: var(--mdc-layout-grid-margin-phone, 16px);
        --info-width: calc(100vw * 2 / 3);
        --slot-width: calc(100vw / 2.5 / 4);
        --tick-color: #eee;
        --tick-highlight-color: #aaa;
      }

      @media screen and (min-width: 480px) and (max-width: 839px) {
        .program {
          --spacing: var(--mdc-layout-grid-margin-tablet, 16px);
        }
      }

      @media screen and (min-width: 840px) {
        .program {
          --spacing: var(--mdc-layout-grid-margin-desktop, 24px);
        }
      }

      @media (prefers-color-scheme: dark) {
        .program {
          --tick-color: #666;
          --tick-highlight-color: #888;
        }
      }

      .program__header {
        box-sizing: border-box;
        padding: var(--spacing);
        margin-bottom: var(--spacing);
      }

      .program__lineups {
        max-width: 100vw;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-behavior: smooth;
        font-size: 16px;
      }

      @media (min-width: 600px) {
        .program {
          --info-width: calc(100vw / 3);
          --slot-width: calc(100vw / 6 / 3);
        }
      }

      @media (min-width: 900px) {
        .program {
          --info-width: calc(100vw / 4);
          --slot-width: calc(100vw / 6 / 4);
        }
      }

      @media (min-width: 1600px) {
        .program {
          --info-width: calc(100vw / 5);
          --slot-width: calc(100vw / 6 / 6);
        }
      }

      /**
       * Horizontal sticky pagination by days
       */
      .program__dayline {
        position: sticky;
        top: 0;
        z-index: 4;
      }

      .dayline {
        padding: calc(var(--spacing) / 2);
        display: flex;
        align-items: center;
        justify-content: center;

        top: 0;
        left: 0;
        right: 0;
        background-color: var(--hc-background-color);
        background-image: var(--hc-background-image, none);
        z-index: 4;
        border-bottom: 1px solid var(--tick-color);
      }

      a.dayline__tick {
        flex: 1;
        text-decoration: none;
        color: var(--hc-text-color);
        text-align: center;
      }

      a.dayline__tick:hover {
        text-decoration: underline;
      }

      a.dayline__tick.dayline__tick--visible {
        font-weight: bold;
        font-size: 120%;
      }

      /**
       * Horizontal lines of stable program
       */
      .lineup {
        display: flex;
      }

      .lineup__info {
        min-width: var(--info-width);
        background-color: var(--hc-background-color);
        box-sizing: border-box;
        padding: calc(var(--spacing) / 2);
        border-top: 1px solid var(--tick-color);
        border-right: 1px solid var(--tick-highlight-color);
        z-index: 3;
        display: flex;
        flex-direction: column;
        cursor: pointer;
      }

      @media (min-width: 1200px) {
        .lineup__info {
          padding: calc(var(--spacing));
        }
      }

      .lineup__sticky {
        position: absolute;
        margin: calc(var(--spacing) / 2);
        z-index: 2;
        font-size: 12px;
        left: 0;
        text-decoration: none;
        background: var(--hc-background-image);
        padding: 8px;
      }

      .lineup__timeline {
        display: flex;
        align-items: center;
        padding-right: var(--slot-width);
      }

      .lineup__slot {
        display: block;
        text-decoration: none;
        width: var(--slot-width);
        height: 100%;
        box-sizing: border-box;
        border-top: 1px solid var(--tick-color);
        border-right: 1px solid var(--tick-color);
        position: relative;
      }

      .lineup__slot:nth-child(4n) {
        border-right: 1px solid var(--tick-highlight-color);
      }

      .lineup:nth-child(2n) .lineup__slot:before {
        content: attr(data-day);
        display: block;
        position: absolute;
        width: 100%;
        text-align: center;
        line-height: 1.4;
        top: 0;
        font-size: 12px;
        color: var(--tick-color);
      }

      .lineup__slot[data-tick$="h"]:after {
        color: var(--tick-highlight-color) !important;
      }

      .lineup:nth-child(2n + 1) .lineup__slot:after {
        content: attr(data-tick);
        display: block;
        position: absolute;
        width: 100%;
        text-align: center;
        line-height: 1.4;
        bottom: 0;
        font-size: 12px;
        color: var(--tick-color);
      }

      .lineup__slot[data-tick$="h"]:after {
        color: var(--tick-highlight-color) !important;
      }

      .lineup:last-child .lineup__info,
      .lineup:last-child .lineup__slot {
        border-bottom: 1px solid var(--tick-color);
      }

      .lineup__eventsline {
        position: relative;
        width: 0;
        padding: var(--spacing) 0;
      }

      .lineup__event {
        position: absolute;
        z-index: 1;
        background-color: var(--hc-background-color);
        box-sizing: border-box;
        padding: calc(var(--spacing) / 2);
        cursor: pointer;
        overflow: hidden;
        border: 1px solid var(--tick-highlight-color);
        transition: all 0.2s ease-in-out;
        font-size: 14px;
        left: calc(var(--slot-start) * var(--slot-width) + 4px);
        width: calc(var(--slot-duration) * var(--slot-width) - 8px);
        top: var(--slot-top-offset);
      }

      .lineup__event.lineup__event--org {
        top: 2px;
        height: calc(100% - 2px);
        display: flex;
        align-items: center;
        justify-content: center;
        border-color: var(--hc-background-color);
        pointer-events: fill;
        opacity: 0.8;
      }

      .lineup__event.lineup__event--topic {
        height: calc(100% - 8px);
      }

      .lineup__event.lineup__event--topic p {
        margin-bottom: calc(var(--spacing) / 4);
      }

      .lineup__event.lineup__event--narrow {
        writing-mode: vertical-lr;
        font-size: 80%;
        padding: 4px;
      }

      .lineup__event.lineup__event--narrow p {
        line-height: 1;
      }

      @media (min-width: 800px) {
        .lineup__event.lineup__event--narrow {
          font-size: 100%;
        }
      }

      @media (min-width: 1024px) {
        .lineup__event.lineup__event--narrow {
          font-size: 110%;
        }
      }

      .lineup__event p,
      .lineup__info pre {
        margin: 0;
        line-height: 1.2;
      }

      .lineup__info pre {
        line-height: 1.5;
        line-break: auto;
        word-break: break-word;
        white-space: break-spaces;
      }

      @media (min-width: 400px) {
        .lineup__event,
        .lineup__info {
          font-size: 14px;
        }
      }

      @media (min-width: 800px) {
        .lineup__event,
        .lineup__info {
          font-size: 16px;
        }
      }

      @media (min-width: 1600px) {
        .lineup__event,
        .lineup__info {
          font-size: 18px;
        }
      }

      :where(.lineup__detail, .event__detail) h1 {
        margin: calc(var(--spacing) / 2) 0 var(--spacing) 0;
        font-size: 2rem;
        line-height: 1.2;
      }

      .program__beside {
        box-sizing: border-box;
        padding: calc(var(--spacing));
      }

      ul {
        margin: var(--spacing) 0;
        padding: 0;
      }

      .lineup:first-child {
        font-style: italic;
      }

      .lineup:first-child .lineup__event {
        border: 1px solid var(--tick-color);
        background-color: var(--hc-background-color);
        background-image: var(--hc-background-image, none);
      }

      .lineup:first-child .lineup__slot {
        pointer-events: none;
      }

      .people-list {
      }

      .people-list:after {
        content: "";
        display: block;
        clear: both;
      }

      figure.speaker {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: calc(var(--spacing) / 4);
        float: left;
        margin: calc(var(--spacing) / 4) calc(var(--spacing) / 4) 0 0;
      }

      figure.speaker img {
        border-radius: 50%;
        min-width: 32px;
        height: 32px;
        margin: 0;
        overflow: hidden;
        background-image: var(--hc-gradient-btn);
        background-size: 200% 100%;
        padding: 2px;
        color: var(--hc-background-color);
      }

      figure.speaker.speaker--add {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 200%;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        overflow: hidden;
        background-image: var(--hc-gradient-btn);
        background-size: 200% 100%;
        padding: 2px;
        color: var(--hc-background-color);
      }

      figure.speaker.speaker--full {
        width: auto;
        margin: calc(var(--spacing) / 2) var(--spacing) calc(var(--spacing) / 2) 0;
      }
    </style>
    <div class="program">
      <div class="program__header">
        <h1>Program</h1>
        <p>
          Hacker Camp bude jen takový, jaký si ho uděláme. Tady najdeš program a
          aktivity, co už táborníci zapsali. Další aktivty přibývají a některé
          mohou hackeři jen nahlásit na začátku každého bloku před Mainframe.
          Zkrátka: Program se může a bude měnit za chodu :) Takže se těš a
          sleduj co se děje online i offline.
        </p>

        <a
          class="hc-link hc-link--decorated"
          style="font-size: 120%;"
          @click=${(e) => {
    e.preventDefault();
    renderAndShowAddEventForm();
  }}
        >
          Zapoj se do programu
        </a>
      </div>
      <div class="program__dayline">
        <div class="dayline">
          ${
    makeDayline(campStartAt, campEndAt).map((day) =>
      html`
              <a
                class=${
        classMap({ dayline__tick: true, "dayline__tick--visible": visibleDate.getDate() === day.getDate() })
      }
                href="#${day.toISOString()}"
                @click=${() => {
        const scrollElement = document.getElementById("lineups");
        const date = new Date(day);
        date.setHours(DAY_START_HOUR);
        scrollToDate(scrollElement, date);
      }}
              >
                ${formatLongDayName(day)}
              </a>
            `
    )
  }
        </div>
      </div>
      <div class="program__lineups" id="lineups" @scroll=${onLineupsScroll}>
        ${
    lineups.map((lineup) =>
      html`
            <div class="lineup">
              <div
                class="lineup__info"
                data-name=${lineup.name}
                @click=${() => {
        showModalDialog(`lineup-detail-${lineup.id}`);
      }}
              >
                <h2>${lineup.name}</h2>
                <pre>${lineup.description}</pre>
              </div>
              <a
                class="lineup__sticky"
                @click=${(e) => {
        e.preventDefault();
        showModalDialog(`lineup-detail-${lineup.id}`);
      }}
                >${lineup.name}</a
              >
              <dialog class="lineup__detail" id="lineup-detail-${lineup.id}">
                <h1>${lineup.name}</h1>
                <p>${lineup.description}</p>
                <p>${lineup.detail}</p>
                ${
        when(lineup.id !== "liorg", () =>
          html`<a
                      class="hc-link hc-link--decorated"
                      style="padding: calc(var(--spacing) / 4);"
                      @click=${(e) => {
            e.preventDefault();
            renderAndShowAddEventForm(lineup.id);
          }}
                    >
                      Zapoj se do programu
                    </a> `)
      }
                <hr />
                <button name="close">Zavřít</button>
              </dialog>
              <div class="lineup__eventsline">
                ${
        lineUpEvents(lineup, events).map((event) =>
          eventTemplate({
            lineup,
            event,
            topicEvents: topicEvents(event, events),
            eventStartAtSlot,
            eventDurationInSlots,
            renderAndShowAddEventForm
          })
        )
      }
              </div>
              <div class="lineup__timeline">
                ${
        makeTimeline(campStartAt, campEndAt, 15).map((time) =>
          html`
                    <a
                      class="lineup__slot"
                      ${/*href="#${lineup.id}-${time.toISOString()}"*/ ""}
                      data-tick=${makeTick(time)}
                      data-day=${formatShortDayName(time)}
                      @click=${(e) => {
            e.preventDefault();
            // timezone hotfix
            time.setHours(time.getHours() + 2);
            renderAndShowAddEventForm(lineup.id, { preferredTime: time });
          }}
                    >
                      &nbsp;
                    </a>
                  `
        )
      }
              </div>
            </div>
          `
    )
  }
      </div>
      <div class="program__beside">
        <h2>Další program</h2>
        <p>
          Nejen přednáškami, workshopy, hudbou a sportem živ je hacker. Na campu
          se toho děje mnohem víc. Můžeš si vyzkoušet zajímavé hry -> živé,
          deskovky, karty, playstationy. Pár z vás nabízí one-one povídání,
          kvízi, sekání dřeva a spoustu dalšího. Tady najdete vše pohromadě.
        </p>
        <a
          class="hc-link hc-link--decorated"
          style="padding: calc(var(--spacing) / 4)"
          @click=${(e) => {
    e.preventDefault();
    renderAndShowAddEventForm("liother");
  }}
        >
          Zapoj se do programu
        </a>
      </div>
      <dialog id="add-event">
        <div id="add-event-form"></div>
        <hr/>
        <button name="close" type="reset">Zavřít</button>
      </dialog>
    </div>
  `;
}

async function fetchLineups(apiHost) {
  const { year } = state.deref();
  const params = new URLSearchParams({ year });
  // TODO: move to DB/API
  const url = `/program/lineups.json?${params}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" });

  return resp.json();
}

async function fetchEvents(apiHost) {
  const { year } = state.deref();
  const params = new URLSearchParams({ year });
  const endpoint = new URL(`program/?${params}`, apiHost).href;
  const resp = await withAuthHandler(
    fetch(endpoint, { headers: { Accept: "application/json" }, credentials: "include" }),
    {
      onUnauthenticated() {
        setReturnUrl(location.href);
        return new Promise((resolve, reject) => {
          signOut((path) => new URL(path, apiHost).href);
          reject({ unauthenticated: true });
        });
      }
    }
  );
  return resp.json();
}

function joinTopicPeople(events) {
  const output = structuredClone(events);
  for (const event of output) {
    if (event.type === "topic") {
      event.people = [...(event.people || []), ...topicEvents(event, events).flatMap(({ people }) => people)];
    }
  }
  return output;
}

/**
 * @param {HTMLElement} rootElement
 * @param env
 * @returns {Promise<void>}
 */
export async function main({ rootElement, env }) {
  rollbar.init(env);
  const shadow = rootElement.attachShadow({ mode: "closed" });
  initRenderLoop(state, shadow);

  transact((x) =>
    Object.assign(x, {
      year: env.year,
      apiHost: env["api-host"],
      profile: getSlackProfile(),
      featureToggles: { fullProgram: env["feature-toggle/full-program"] }
    }, schedule.get(env.year))
  );

  const { campStartAt: startAt, campEndAt: endAt } = state.deref();
  const ticks = (endAt - startAt) / 1000 / 60 / 15;
  swapIn("slots", () => Array.from({ length: ticks }));

  try {
    const lineups = await fetchLineups(env["api-host"]);
    swapIn("lineups", () => instatializeDates(lineups));
  } catch (o_O) {
    rollbar.error(o_O);
    snackbar.labelText = "Chyba při načítání lineupů";
    snackbar.show();
  }

  try {
    const events = await fetchEvents(env["api-host"]);
    swapIn("events", () => joinTopicPeople(instatializeDates(events)));
  } catch (o_O) {
    rollbar.error(o_O);
    snackbar.labelText = "Chyba při načítání eventů";
    snackbar.show();
  }

  // Manual and auto scroll trought the program features
  swapIn("onLineupsScroll", () => throttle(handleLineupsScroll));

  requestAnimationFrame(() => {
    const param = location.hash.substring(1);

    const scrollElement = document.getElementById("lineups");
    if (isISODateTime(param)) {
      scrollToDate(scrollElement, new Date(param));
    } else {
      scrollToDate(scrollElement, new Date());
    }
  });
}
