import { createCookie } from "@hackercamp/lib/auth.js";

/**
 * @param {EventContext<Env>} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin") ?? request.headers.get("Referer") ?? `https://${env.HC_DONUT_HOSTNAME}/`;

  // For local development, we need to relax Cross site security
  const sameSite = origin.includes("localhost") ? "None" : "Strict";

  return new Response(null, {
    status: 302,
    headers: {
      "Location": origin,
      "Set-Cookie": createCookie("", {
        expiresIn: "1 year ago",
        domain: "hackercamp.cz",
        path: "/",
        sameSite,
        secure: true,
        httpOnly: true
      })
    }
  });
}
