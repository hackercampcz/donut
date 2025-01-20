const apiV3 = endpoint => `https://app.fakturoid.cz/api/v3/${endpoint}`;
const slug = "hackercampcrew";
const userAgent = "HackerCamp Donut (team@hackercamp.cz)";

export async function getAuthHeader(clientId, clientSecret) {
  const resp = await fetch(apiV3("oauth/token"), {
    method: "POST",
    headers: {
      "user-agent": userAgent,
      accept: "application/json",
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: new URLSearchParams({ "grant_type": "client_credentials" })
  });
  const { access_token, token_type, error } = await resp.json();
  if (!error) return `${token_type} ${access_token}`;
  throw new Error(`FakturoidError: ${error}`);
}

export async function fetchInvoice(authHeader, invoiceId) {
  const resp = await fetch(apiV3(`accounts/${slug}/invoices/${invoiceId}.json`), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authHeader,
      "User-Agent": userAgent
    }
  });
  if (!resp.ok) {
    const { error, error_description } = await resp.json();
    throw new Error(`${error}: ${error_description}`);
  }
  return resp.json();
}
