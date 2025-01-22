import { sortBy } from "@hackercamp/lib/array.js";
import { html } from "lit-html";
import { until } from "lit-html/directives/until.js";
import { ticketName, unauthorized } from "./admin/common.js";
import { housing } from "./lib/attendee.js";
import "./components/phone-button.js";
import "./components/mail-button.js";

function housingTable(data) {
  return html`
    <table style="width: 100%">
      <thead>
        <tr>
          <th>Jméno</th>
          <th>Společnost</th>
          <th>Typ lístku</th>
          <th>Ubytování</th>
          <th>Umístění</th>
          <th>Délka pobytu</th>
          <th>Akce</th>
        </tr>
      </thead>
      <tbody>
        ${
    data.map((row) =>
      html`
            <tr>
              <td>${row.name}</td>
              <td>${row.company}</td>
              <td>${ticketName.get(row.ticketType)}</td>
              <td>${housing.get(row.housing) ?? "Ještě si nevybral"}</td>
              <td>${row.housingPlacement}</td>
              <td>${row.days}</td>
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

export function housingTemplate(state) {
  const { data } = state;
  return html`
    <div class="mdc-layout-grid__cell mdc-layout-grid__cell--span-12">
      <div class="hc-card">
        ${
    until(
      data?.then((data) => {
        return housingTable(sortBy("housing", data));
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
    </div>
  `;
}
