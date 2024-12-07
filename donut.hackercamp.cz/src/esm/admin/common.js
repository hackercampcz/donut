import { formatMoney } from "@hackercamp/lib/format.mjs";
import { html } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";
import { until } from "lit-html/directives/until.js";
import { setReturnUrl, signOut } from "../lib/profile.js";
import { withAuthHandler } from "../lib/remoting.js";

export const Action = {
  optout: "optout",
  optin: "optin",
  invoiced: "invoiced",
  closeDetail: "closeDetail",
  renderDetail: "renderDetail",
  editEvent: "editEvent",
  deleteEvent: "deleteEvent",
  approveEvent: "approveEvent",
  showModalDialog: "showModalDialog",
  select: "select",
  unselect: "unselect",
  invoiceSelected: "invoiceSelected",
  approveSelectedVolunteers: "approveSelectedVolunteers",
  trashRegistration: "trashRegistration",
  startNfcScan: "startNfcScan",
  addChip: "addChip",
  removeChip: "removeChip"
};

export function dispatchAction(type, payload) {
  postMessage({ type, payload });
}

const dialogRegistry = new Map();

export function registerDialog(name, template) {
  dialogRegistry.set(name, template);
}

export function getDialog(name) {
  return dialogRegistry.get(name);
}

export const View = {
  paid: "paid",
  invoiced: "invoiced",
  confirmed: "confirmed",
  hackers: "hackers",
  waitingList: "waitingList",
  optouts: "optouts",
  search: "search",
  searchAttendees: "searchAttendees",
  attendees: "attendees",
  hackerAttendees: "hackerAttendees",
  staff: "staff",
  staffAttendees: "staffAttendees",
  crewAttendees: "crewAttendees",
  volunteer: "volunteer",
  volunteerAttendees: "volunteerAttendees",
  housing: "housing",
  program: "program",
  programApproval: "programApproval"
};

export const Endpoint = {
  registrations: "registrations",
  attendees: "attendees",
  housing: "housing",
  program: "program"
};

export async function executeCommand(apiHost, endpoint, command, params) {
  const resource = new URL(`admin/${endpoint}`, apiHost).href;
  const resp = await withAuthHandler(
    fetch(resource, {
      method: "POST",
      headers: [["Accept", "application/json"], ["Content-Type", "application/json"]],
      body: JSON.stringify({ command: command, params: params }),
      credentials: "include",
      referrerPolicy: "no-referrer"
    }),
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
  if (!resp.ok) throw new Error(resp.status);
}

export function unauthorized() {
  return html`<p style="padding: 16px">
      Nemáte oprávnění pro tuto sekci. Pokud si myslíte, že je mít máte,
      klikněte na následující tlačítko a potvrďte požadovaná oprávnění:
    </p>
    <div style="padding: 16px">
      <a href="https://slack.com/oauth/v2/authorize?client_id=1990816352820.3334586910531&scope=users:read,users:write,users.profile:read,users:read.email&user_scope=users.profile:read,users.profile:write,users:read&redirect_uri=https%3A%2F%2F${location.host}%2F"
      >
        <img
          alt="Add to Slack"
          height="40"
          width="139"
          src="https://platform.slack-edge.com/img/add_to_slack.png"
          @click="${() => {
    setReturnUrl(location.href);
  }}"
          srcset="
            https://platform.slack-edge.com/img/add_to_slack.png    1x,
            https://platform.slack-edge.com/img/add_to_slack@2x.png 2x
          "></a>
    </div>`;
}

export const ticketName = new Map([
  ["nonprofit", "Táborník z neziskovky"],
  ["hacker", "Hacker"],
  ["hacker-plus", "Hacker filantrop"],
  ["hacker-patron", "Patron Campu"],
  ["volunteer", "Dobrovolník"],
  ["crew", "Crew"],
  ["staff", "Ostatní"]
]);
export const ticketPrice = new Map([[
  2022,
  new Map([["nonprofit", 2500], ["hacker", 5000], ["hacker-plus", 7500], ["hacker-patron", 7500], ["volunteer", 0], [
    "crew",
    0
  ], ["staff", 0]])
], [
  2023,
  new Map([["nonprofit", 3000], ["hacker", 6000], ["hacker-plus", 9000], ["hacker-patron", 9000], ["volunteer", 0], [
    "crew",
    0
  ], ["staff", 0]])
], [
  2024,
  new Map([["nonprofit", 3000], ["hacker", 7000], ["hacker-plus", 12000], ["hacker-patron", 12000], ["volunteer", 0], [
    "crew",
    0
  ], ["staff", 0]])
]]);

export function chip({ text, count, selected, view, year }) {
  return html`
    <span
      class="${
    classMap({
      "mdc-chip": true,
      "mdc-chip--selectable": true,
      "mdc-chip--filter": true,
      "hc-chip": true,
      "hc-chip--selected": selected
    })
  }"
      role="presentation"
    >
      <a
        class="mdc-chip__action mdc-chip__action--primary"
        role="option"
        aria-selected="${selected ? "true" : "false"}"
        tabindex="0"
        href="?${new URLSearchParams({ view, year })}"
      >
        <span
          class="mdc-chip__ripple mdc-chip__ripple--primary"
        ></span>
        <span class="mdc-chip__graphic">
          <span class="mdc-chip__checkmark">
            <svg
              class="mdc-chip__checkmark-svg"
              viewBox="-2 -3 30 30"
            >
              <path
                class="mdc-chip__checkmark-path"
                fill="none"
                stroke="black"
                d="M1.73,12.91 8.1,19.28 22.79,4.59"
              />
            </svg>
          </span>
        </span>
        <span class="mdc-chip__text-label"
          >${text}${until(count?.then((x) => html`<data value="${x}">${x}</data>`, ""))}</span
        >
      </a>
    </span>
  `;
}

export function getTicketPrice({ patronAllowance, year, ticketType, ticketPrice: price }) {
  const allowance = patronAllowance ? parseInt(patronAllowance) : 0;
  return (price ?? ticketPrice.get(year).get(ticketType)) + allowance;
}

export function ticketDetail({ year, ticketType, ticketPrice, patronAllowance }) {
  const price = getTicketPrice({ patronAllowance, year, ticketType, ticketPrice });
  return html`
    <p>
      Lístek: <strong>${ticketName.get(ticketType)}</strong>
      <data value="${price} CZK"><code>${formatMoney(price)} Kč</code></data>
    </p>
  `;
}

export const lineupText = new Map([
  ["liorg", "Organizační"],
  ["limain", "Mainframe"],
  ["libase", "Basecamp"],
  ["liback", "Backend"],
  ["lipeep", "Peopleware"],
  ["liwood", "WoodStack"],
  ["lijungle", "Jungle Release"],
  ["liother", "Doprovodné aktivity"]
]);

export function lineup(x) {
  return html`<code>${lineupText.get(x)}</code>`;
}

export function paginationNavigation({ page, pages, count, total, params }) {
  const pageSize = 20;
  const offset = page * pageSize;
  const first = offset + 1;
  const last = offset + count;

  function search(p) {
    const qs = new URLSearchParams(params);
    for (const [k, v] of Object.entries(p)) {
      qs.set(k, v);
    }
    return `?${qs}`;
  }

  return html`
    <div class="hc-pagination">
      <data class="hc-pagination__total" value="${total}"
        >${first}-${last} ze ${total}</data
      >
      <md-icon-button
        title="První strana"
        href="${page <= 0 ? "" : search({ page: 0 })}"
        ?disabled="${page <= 0}"
      >
        <md-icon>first_page</md-icon>
      </md-icon-button>
      <md-icon-button
        title="Předchozí strana"
        href="${page <= 0 ? "" : search({ page: Math.max(page - 1, 0) })}"
        ?disabled="${page <= 0}"
      >
        <md-icon>chevron_left</md-icon>
      </md-icon-button>
      <md-icon-button
        title="Další strana"
        href="${page >= pages - 1 ? "" : search({ page: Math.min(page + 1, pages - 1) })}"
        ?disabled="${page >= pages - 1}"
      >
        <md-icon>chevron_right</md-icon>
      </md-icon-button>
      <md-icon-button
        title="Poslední strana"
        href="${page >= pages - 1 ? "" : search({ page: pages - 1 })}"
        ?disabled="${page >= pages - 1}"
      >
        <md-icon>last_page</md-icon>
      </md-icon-button>
    </div>
  `;
}

export function renderDetail(detail) {
  return (e) => {
    e.preventDefault();
    dispatchAction(Action.renderDetail, { detail });
  };
}

export function closeDetail() {
  return (e) => {
    e.preventDefault();
    dispatchAction(Action.closeDetail);
  };
}

export function renderModalDialog(name, { preDispatch } = {}) {
  return (e) => {
    e.preventDefault();
    if (preDispatch) preDispatch();
    dispatchAction(Action.showModalDialog, { name });
  };
}
