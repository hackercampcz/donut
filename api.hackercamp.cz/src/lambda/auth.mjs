import { getToken, validateToken } from "@hackercamp/lib/auth.js";

export async function checkAuthorization(event) {
  const token = getToken(event.headers);
  const pkey = process.env["private_key"];
  console.log({ event: "check-authorization", token, pkey });
  const isAuthorized = await validateToken(token, pkey);
  if (!isAuthorized) throw Error("Unauthorized");
}
