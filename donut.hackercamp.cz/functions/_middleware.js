import { getToken, validateToken } from "@hackercamp/lib/auth.js";

const openRoutes = new Set(["/program/kalendar"]);
const authorizedOnly = ["/hackers", "/registrace", "/ubytovani", "/program", "/admin"];

/**
 * @param {EventContext<Env>} context
 */
export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (openRoutes.has(url.pathname)) return next();
  if (!authorizedOnly.some((x) => url.pathname.startsWith(x))) return next();

  const token = getToken(request.headers);
  const isValidToken = await validateToken(token, env.HC_JWT_SECRET);
  console.log("Authorization", request.url, Boolean(isValidToken));

  if (isValidToken) return next();

  const query = new URLSearchParams({ state: "not-authenticated", returnUrl: request.url });
  return Response.redirect(`https://${env.HC_DONUT_HOSTNAME}/?${query}`, 307);
}
