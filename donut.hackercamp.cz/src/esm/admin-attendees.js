import { sortBy } from "@hackercamp/lib/array.js";
import { formatDateTime, formatMoney } from "@hackercamp/lib/format.js";
import { html } from "lit-html";
import { until } from "lit-html/directives/until.js";
import { when } from "lit-html/directives/when.js";
import {
  Action,
  chip,
  closeDetail,
  dispatchAction,
  Endpoint,
  executeCommand,
  lineup,
  paginationNavigation,
  registerDialog,
  renderDetail,
  renderModalDialog,
  ticketDetail,
  ticketName,
  unauthorized,
  View
} from "./admin/common.js";
import { housing, ticketBadge, travel } from "./lib/attendee.js";
import "./components/phone-button.js";
import "./components/mail-button.js";
import { map } from "lit-html/directives/map.js";
import { getChipID } from "./lib/nfctron.js";
import { getContact } from "./lib/profile";

/**
 * @param {Object} attendee
 * @param {string} apiHost
 * @returns {Promise<void>}
 */
export function edit(attendee, apiHost) {
  const contact = getContact();
  return executeCommand(apiHost, Endpoint.attendees, "edit", { ...attendee, editedBy: contact?.email }).then(() =>
    location.reload()
  );
}

/**
 * @param {Object} attendee
 * @param {string} apiHost
 * @returns {Promise<void>}
 */
export function add(attendee, apiHost) {
  return executeCommand(apiHost, Endpoint.attendees, "add", attendee).then(() => location.reload());
}

function selectRow(e) {
  e.stopPropagation();
  const key = e.target.value;
  if (!e.target.checked) {
    dispatchAction(Action.select, { keys: [key] });
  } else {
    dispatchAction(Action.unselect, { key });
  }
}

export function attendeesChips(
  view,
  year,
  { attendees, crewAttendees, staffAttendees, volunteerAttendees, hackerAttendees },
  params
) {
  return html`<search style="display: flex; gap: 8px">
      ${
    when(view === View.searchAttendees, () =>
      html`
          <form style="flex-grow: 1">
            <input type="hidden" name="view" value="${View.searchAttendees}">
            <input type="hidden" name="year" value="${year}">
            <md-outlined-text-field
              name="query"
              style="--md-outlined-field-bottom-space: 4px; --md-outlined-field-top-space: 4px; width: 100%; max-width: 480px"
              placeholder="Hledat jméno, e-mail, firmu&hellip;"
              value="${params.get("query")}"
              @change="${(e) => e.target.form.submit()}"
            >
              <md-icon-button slot="leadingicon" type="submit" title="Hledat">
                <md-icon>search</md-icon>
              </md-icon-button>
              <md-icon-button
                slot="trailingicon"
                href="/admin/?${new URLSearchParams({ view: View.attendees, year })}"
                title="Zavřít hledání"
              >
                <md-icon>close</md-icon>
              </md-icon-button>
            </md-outlined-text-field>
          </form>
        `, () =>
      html`
          <div>
            <md-icon-button
              href="/admin/?${new URLSearchParams({ view: View.searchAttendees, year })}"
            >
              <md-icon>search</md-icon>
            </md-icon-button>
          </div>
          <div
            class="mdc-evolution-chip-set"
            role="grid"
            id="filters"
            aria-orientation="horizontal"
            aria-multiselectable="false"
          >
            <span class="mdc-evolution-chip-set__chips" role="presentation">
              ${
        chip({ text: "Všichni", count: attendees, selected: view === View.attendees, view: View.attendees, year })
      }
              ${
        chip({
          text: "Hackeři",
          count: hackerAttendees,
          selected: view === View.hackerAttendees,
          view: View.hackerAttendees,
          year
        })
      }
              ${
        chip({
          text: "Dobrovolníci",
          count: volunteerAttendees,
          selected: view === View.volunteerAttendees,
          view: View.volunteerAttendees,
          year
        })
      }
              ${
        chip({
          text: "Ostatní",
          count: staffAttendees,
          selected: view === View.staffAttendees,
          view: View.staffAttendees,
          year
        })
      }
              ${
        chip({
          text: "Crew",
          count: crewAttendees,
          selected: view === View.crewAttendees,
          view: View.crewAttendees,
          year
        })
      }
            </span>
          </div>
          <div>
            <md-icon-button
              title="Zkopírovat statistiky"
              @click="${
        copyToClipboard([attendees, hackerAttendees, volunteerAttendees, staffAttendees, crewAttendees])
      }">
              <md-icon>content_copy</md-icon></md-icon-button
            ><md-icon-button
              href="https://api.hackercamp.cz/v1/admin/attendees?${new URLSearchParams({
        year,
        type: view,
        format: "csv",
        pageSize: 500
      })}"
              title="Stáhnout CSV"
              aria-label="Stáhnout CSV"
            >
              <md-icon>download</md-icon></md-icon-button
            ><md-icon-button
              title="Přidat účastníka"
              @click="${renderModalDialog("add-attendee-modal")}"
            >
              <md-icon>person_add</md-icon></md-icon-button
            >
          </div>
        `)
  }
    </search>
  `;
}

function copyToClipboard(counts) {
  return async () => {
    const [all, hacker, volunteer, staff, crew] = await Promise.all(counts);
    const rich = new Blob([`<ul>
          <li>Všichni: <b>${all}</b>
          <li>Hackeři: <b>${hacker}</b>
          <li>Dobrovolníci: <b>${volunteer}</b>
          <li>Ostatní: <b>${staff}</b>
          <li>Crew: <b>${crew}</b>
        </ul>`], { type: "text/html" });
    const plain = new Blob([
      `* Všichni: ${all}\n* Hackeři: ${hacker}\n* Dobrovolnící: ${volunteer}\n* Ostatní: ${staff}\n* Dobrovolníci: ${crew}`
    ], { type: "text/plain" });
    await navigator.clipboard.write([new ClipboardItem({ "text/html": rich, "text/plain": plain })]);
    globalThis.showSnackbar("Statistiky zkopírovány do schránky");
  };
}

export function attendeesTableTemplate(data, { page, pages, total, params, selection }) {
  return html`
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Jméno</th>
          <th>Společnost</th>
          <th>Typ lístku</th>
          <th>Zaplaceno</th>
          <th>NFCtron</th>
          <th>Akce</th>
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td colspan="5">
            ${paginationNavigation({ page, pages, total, count: data.length, params })}
          </td>
        </tr>
      </tfoot>
      <tbody>
        ${
    data.map((row) =>
      html`
            <tr @click="${renderDetail(row)}">
              <td>
                <md-checkbox
                  aria-label="vybrat"
                  value="${row.slackID}"
                  @click="${selectRow}"
                  touch-target="wrapper"
                  ?checked="${selection.has(row.slackID)}"
                ></md-checkbox>
              </td>
              <td>${row.name}</td>
              <td>${row.company}</td>
              <td>${ticketName.get(row.ticketType)}</td>
              <td>${row.paid ? formatDateTime(new Date(row.paid)) : ""}</td>
              <td>
                ${
        row.nfcTronData?.map(({ chipID }) => chipID).filter(Boolean).join(", ") || html`<em><small>nene</small></em>`
      }
              </td>
              <td>
                <hc-mail-button email="${row.email}"></hc-mail-button
                ><hc-phone-button phone="${row.phone}"></hc-phone-button>
              </td>
            </tr>
          `
    )
  }
      </tbody>
    </table>
  `;
}

export function attendeeDetailTemplate({ detail, isNFCSupported }) {
  if (!detail) return null;
  return html`
    <div
      class="hc-card hc-master-detail__detail"
      data-slack-id="${detail.slackID}"
    >
      <div style="display: flex; align-items: center; gap: 12px;">
        <md-icon-button
          aria-label="Zavřít detail"
          title="Zavřít detail"
          @click="${closeDetail()}"
        >
          <md-icon>arrow_back</md-icon>
        </md-icon-button>
        <h2 style="margin: 0">${detail.name}</h2>
        ${ticketBadge.get(detail.ticketType)}
      </div>
      <p>${detail.company}</p>
      <div class="hc-detail__tools">
        <hc-mail-button email="${detail.email}"></hc-mail-button
        ><md-icon-button
          title="Upravit účastníka"
          @click="${renderModalDialog("edit-attendee-modal")}"
        >
          <md-icon>edit</md-icon> </md-icon-button
        ><md-icon-button
          title="Check In"
          @click="${
    renderModalDialog("check-in-modal", {
      preDispatch() {
        console.log("Check In", { isNFCSupported });
        if (isNFCSupported) {
          startChipScan();
        }
      }
    })
  }"
        >
          <md-icon>where_to_vote</md-icon> </md-icon-button
        ><md-icon-button
          title="Check Out"
          @click="${renderModalDialog("check-out-modal")}"
        >
          <md-icon>location_off</md-icon>
        </md-icon-button>
      </div>
      ${ticketDetail(detail)}
      <p>
        Ubytování:
        <strong>${housing.get(detail.housing) ?? "Ještě si nevybral"}</strong>
        ${when(detail.housingPlacement, () => html` - <em>${detail.housingPlacement}</em>`)}
      </p>
      <p>
        Doprava:
        <strong>${travel.get(detail.travel) ?? "Ještě si nevybral"}</strong>
      </p>
      <p>Slack ID: <code>${detail.slackID}</code></p>
      <p>
        NFCtron ID(s):
        ${when(!detail.nfcTronData?.length, () => html`<em>nemá</em>`)}
      </p>
      ${
    when(detail.nfcTronData?.length, () =>
      html`
          <ul>
            ${
        map(detail.nfcTronData.filter(({ chipID }) => chipID), ({ chipID, spent, totalSpent, sn }) =>
          html`
                <li data-chip-sn="${sn}" data-chip-id="${chipID}">
                  <a
                    title="Online účet"
                    href="https://pass.nfctron.com/receipt/v2/${chipID}/"
                  >
                    ${chipID}
                  </a>
                  -
                  <data value="${spent ?? totalSpent}"
                    >${formatMoney(spent ?? totalSpent)}</data
                  >
                  ${when(detail.checkOutPaid, () => html` <strong>zaplaceno</strong>`)}
                </li>
              `)
      }
          </ul>
        `)
  }
      ${when(detail.note, () => html`<p>${detail.note}</p>`)}
      ${
    when(detail.checkIn, () =>
      html`<p>
            Check in:
            <time datetime="${detail.checkIn}"
              >${formatDateTime(new Date(detail.checkIn))}</time
            >
            provedl/a <strong>${detail.checkInBy}</strong>
          </p>`)
  }
      ${when(detail.checkInNote, () => html`<p>${detail.checkInNote}</p>`)}
      ${
    when(detail.checkout, () =>
      html`<p>
            Check out:
            <time datetime="${detail.checkout}"
              >${formatDateTime(new Date(detail.checkout))}</time
            >
            provedl/a <strong>${detail.checkOutBy}</strong>
          </p>`)
  }
      ${
    when(detail.checkOutTotal, () =>
      html`<p>
            Zaplaceno při odchodu:
            <data value="${detail.checkOutTotal}"
              >${formatMoney(parseInt(detail.checkOutTotal))}</data
            >
          </p>`)
  }
      ${when(detail.checkOutNote, () => html`<p>${detail.checkOutNote}</p>`)}
      ${
    when(detail.edited, () =>
      html`
          <p>
            Naposledy editováno
            <time datetime="${detail.edited}"
              >${formatDateTime(new Date(detail.edited))}</time
            >
            administrátorem
            <strong>${detail.editedBy}</strong>
          </p>
        `)
  }
      ${
    when(detail.events?.length, () =>
      html`
        <h3>Program</h3>
          ${
        detail.events?.map((event) =>
          html`
              <div style="border: 1px solid var(--hc-text-color); padding: 8px 16px">
                <h4>${event.title}</h4>
                <p>
                  <code>${lineup(event.lineup)}</code>
                  ${when(event.topic, () => html`<code>${event.topic}</code>`)}
                  ${
            when(
              event.startAt,
              () => html`- <time datetime="${event.startAt}">${formatDateTime(new Date(event.startAt))}</time>`
            )
          }
                </p>
                ${
            when(event.description, () => html`<p>${event.description}</p>`)
          }
              </div>
            `
        )
      }
        `)
  }
    </div>
  `;
}

registerDialog("edit-attendee-modal", editAttendeeModalDialog);

function editAttendeeModalDialog({ detail, apiHost }) {
  const onSubmit = async (e) => {
    const form = new FormData(e.target);
    await edit(Object.fromEntries(form), apiHost);
  };
  return html`
    <form method="dialog" @submit="${onSubmit}">
      <input type="hidden" name="year" value="${detail.year}">
      <input type="hidden" name="slackID" value="${detail.slackID}">
      <div class="field">
        <label for="name">Jméno</label>
        <input id="name" name="name" value="${detail.name}" required>
      </div>
      <div class="field">
        <label for="email">E-mail</label>
        <input
          id="email"
          name="email"
          value="${detail.email}"
          type="email"
          required
       >
      </div>
      <div class="field">
        <label for="ticketType">Typ lístku</label>
        <input id="ticketType" name="ticketType" value="${detail.ticketType}">
      </div>
      <div class="field">
        <label for="company">Společnost</label>
        <input id="company" name="company" value="${detail.company}">
      </div>
      <div class="field">
        <label for="housingPlacement">Ubytování</label>
        <input id="housingPlacement" name="housingPlacement" value="${detail.housingPlacement}">
      </div>
      <div class="field">
        <label for="note">Poznámka</label>
        <input id="note" name="note" value="${detail.note}">
      </div>
      <button type="submit" class="hc-button">Odeslat to</button>
    </form>
  `;
}

registerDialog("add-attendee-modal", addAttendeeModalDialog);

function addAttendeeModalDialog({ year, apiHost }) {
  const onSubmit = async (e) => {
    const form = new FormData(e.target);
    await add(Object.fromEntries(form.entries()), apiHost);
  };
  return html`
    <form method="dialog" @submit="${onSubmit}">
      <input type="hidden" name="year" value="${year}">
      <div class="field">
        <label for="slackID">Slack ID</label>
        <input id="slackID" name="slackID">
      </div>
      <div class="field">
        <label for="name">Jméno</label>
        <input id="name" name="name" required>
      </div>
      <div class="field">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" required>
      </div>
      <div class="field">
        <label for="ticketType">Lístek</label>
        <input id="ticketType" name="ticketType" required value="staff">
      </div>
      <div class="field">
        <label for="company">Společnost</label>
        <input id="company" name="company">
      </div>
      <div class="field">
        <label for="note">Poznámka</label>
        <input id="note" name="note">
      </div>

      <h3>Fakturace</h3>
      <fieldset id="I-will-pay">
        <legend>Zaplatí sám</legend>
        <div class="field">
          <label for="invoice-name"> Jméno / název společnosti </label>
          <input id="invoice-name" name="invName" type="text">
        </div>
        <div class="field">
          <label for="invoice-address"> Adresa (Ulice č.p., PSČ, Město) </label>
          <input id="invoice-address" name="invAddress" type="text">
        </div>
        <div class="group">
          <div class="field">
            <label for="invoice-regno"> IČO </label>
            <input id="invoice-regno" name="invRegNo" type="text">
          </div>
          <div class="field">
            <label for="invoice-vatno"> DIČ </label>
            <input id="invoice-vatno" name="invVatNo" type="text">
          </div>
        </div>
        <div class="field">
          <label for="invoice-text"> Text na faktuře </label>
          <input id="invoice-text" name="invText" type="text">
        </div>
        <div class="field">
          <label for="invoice-email"> Kontakt pro fakturaci </label>
          <input
            id="invoice-email"
            name="invEmail"
            type="email"
            autocomplete="email"
         >
        </div>
      </fieldset>

      <fieldset id="someone-else-will-pay">
        <legend>Zaplatí za něj někdo jiný</legend>
        <div class="group">
          <div class="field">
            <label for="invoice-recipient-firstname"> Jméno </label>
            <input
              id="invoice-recipient-firstname"
              name="invRecipientFirstname"
              type="text"
           >
          </div>
          <div class="field">
            <label for="invoice-recipient-lastname"> Příjmení </label>
            <input
              id="invoice-recipient-lastname"
              name="invRecipientLastname"
              type="text"
           >
          </div>
        </div>
        <div class="group">
          <div class="field">
            <label for="invoice-recipient-email"> E-mail </label>
            <input
              id="invoice-recipient-email"
              name="invRecipientEmail"
              type="email"
           >
          </div>
          <div class="field">
            <label for="invoice-recipient-phone"> Telefon </label>
            <input
              id="invoice-recipient-phone"
              name="invRecipientPhone"
              type="tel"
           >
          </div>
        </div>
      </fieldset>

      <button type="submit" class="hc-button">Odeslat to</button>
    </form>
  `;
}

function startChipScan() {
  return dispatchAction(Action.startNfcScan);
}

function removeChip(sn) {
  return (e) => {
    e.preventDefault();
    dispatchAction(Action.removeChip, { sn });
    globalThis.showSnackbar("Chip odebrán");
  };
}

registerDialog("check-in-modal", checkInModalDialog);

function checkInModalDialog({ apiHost, year, detail, contact, nfcTronData, isNFCSupported }) {
  const onSubmit = async (e) => {
    const formData = new FormData(e.target);
    const data = {
      admin: contact.email,
      year: formData.get("year"),
      slackID: formData.get("slackID"),
      note: formData.get("note"),
      nfcTronData: Array.from(nfcTronData).filter(Boolean).map((sn) => ({ sn, chipID: getChipID(sn) }))
    };
    try {
      const result = executeCommand(apiHost, Endpoint.attendees, "checkIn", data);
      globalThis.showSnackbar("Check-in uložen");
      return result;
    } catch (err) {
      globalThis.showPersistentSnackbar("Check-in neuložen");
    }
  };
  const onChange = (e) => {
    const sn = e.target.value.trim().toLowerCase();
    if (sn.length > 0) dispatchAction(Action.addChip, { sn });
  };
  return html`
    <form method="dialog" @submit="${onSubmit}">
      <input type="hidden" name="year" value="${year}">
      <input type="hidden" name="slackID" value="${detail.slackID}">
      <h2>Check-in</h2>
      <fieldset>
        <legend>NCF Tron</legend>
        ${
    when(!isNFCSupported, () =>
      html`<p>
              Pro scanování chipů použij Chrome na mobilním telefonu se systémem
              Android.
            </p>`, () =>
      html`<p>
              Přilož čip pro načtení. Případně opiš druhý řádek na rubu čipu
              ručně.
            </p>`)
  }
        ${
    map(nfcTronData, (sn, i) => {
      const chipID = getChipID(sn);
      return html`
            <div class="field">
              <label for="nfc-tron-sn-${i}">S/N #${i + 1}</label>
              <md-outlined-text-field
                id="nfc-tron-sn-${i}"
                name="nfcTronSN${i}"
                value="${sn}"
                @change="${onChange}"
              >
                ${
        when(sn === "", () => html`<md-icon slot="trailingicon">nfc</md-icon>`, () =>
          html`
                    <md-icon-button
                      slot="trailingicon"
                      type="button"
                      title="Odebrat"
                      @click="${removeChip(sn)}"
                    >
                      <md-icon>remove</md-icon>
                    </md-icon-button>
                  `)
      }
              </md-outlined-text-field>
              <div>
                <strong>ID čipu:</strong>
                ${
        when(chipID, () => html`<code><data value="${chipID}">${chipID}</data></code>`, () =>
          html`<code>neznámý čip</code>`)
      }
              </div>
            </div>
          `;
    })
  }
      </fieldset>
      <fieldset>
        <legend>Další</legend>
        <div class="field">
          <label for="note">Poznámka</label>
          <textarea id="note" name="note"></textarea>
        </div>
      </fieldset>
      <button type="submit" class="hc-button">Odeslat to</button>
    </form>
  `;
}

registerDialog("check-out-modal", checkOutModalDialog);

function checkOutModalDialog({ apiHost, year, detail, contact }) {
  const onSubmit = async (e) => {
    const formData = new FormData(e.target);
    const data = {
      admin: contact.email,
      year: formData.get("year"),
      slackID: formData.get("slackID"),
      note: formData.get("note"),
      paid: formData.get("checkOutPaid"),
      amount: formData.get("checkOutTotal")
    };
    try {
      const result = executeCommand(apiHost, Endpoint.attendees, "checkOut", data);
      globalThis.showSnackbar("Check-out uložen");
      return result;
    } catch (err) {
      globalThis.showPersistentSnackbar("Check-out neuložen");
    }
  };
  return html`
    <form method="dialog" @submit="${onSubmit}">
      <input type="hidden" name="year" value="${year}">
      <input type="hidden" name="slackID" value="${detail.slackID}">
      <h2>Check out</h2>
      <fieldset>
        <legend>Vyúčtování</legend>
        <p>
          Účastník by měl za sebe zaplatit, nebo by měl být vyúčtován hromadně.
          V případě, že platba probhla, tak to odškrtněte a zadejte i částku.
        </p>
        <div class="field">
          <label for="paid"><input
              type="checkbox"
              id="paid"
              name="checkOutPaid"
              value="true">
            Zaplaceno</label>
        </div>
        <div class="field">
          <label for="total">Částka</label>
          <md-outlined-text-field
            id="total"
            name="checkOutTotal"
            value="${detail.nfcTronData?.map((x) => x.spent ?? 0)?.reduce((a, b) => a + b, 0) ?? 0}"
          ></md-outlined-text-field>
        </div>
      </fieldset>
      <fieldset>
        <legend>Další</legend>
        <div class="field">
          <label for="note">Poznámka</label>
          <textarea id="note" name="note"></textarea>
        </div>
      </fieldset>
      <button type="submit" class="hc-button">Odeslat to</button>
    </form>
  `;
}

export function attendeesTemplate(state) {
  const { data, selectedView, detail, year, page, params, selection, isNFCSupported } = state;
  return html`
    <div class="mdc-layout-grid__cell mdc-layout-grid__cell--span-12">
      ${
    attendeesChips(selectedView, year, {
      [View.attendees]: data?.then((data) => data.counts.all),
      [View.hackerAttendees]: data?.then((data) => data.counts.hacker),
      [View.volunteerAttendees]: data?.then((data) => data.counts.volunteer),
      [View.staffAttendees]: data?.then((data) => data.counts.staff),
      [View.crewAttendees]: data?.then((data) => data.counts.crew)
    }, params)
  }
    </div>
    <div
      class="hc-master-detail mdc-layout-grid__cell mdc-layout-grid__cell--span-12"
    >
      <div class="hc-card hc-master-detail__list">
        ${
    until(
      data?.then((data) => {
        return attendeesTableTemplate(sortBy("paid", data.items), {
          page,
          pages: data.pages,
          total: data.total,
          params,
          selection
        });
      })?.catch((data) => {
        if (data.unauthorized) return unauthorized();
      }),
      html`
            <div class="mdc-layout-grid__cell mdc-layout-grid__cell--span-12">
              <p style="padding: 16px">Načítám data&hellip;</p>
            </div>
          `
    )
  }
      </div>
      ${when(detail, () => attendeeDetailTemplate({ detail, isNFCSupported }))}
    </div>
  `;
}
