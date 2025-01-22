import { authorize, getToken } from "@hackercamp/lib/auth.js";

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * @param {APIGatewayProxyEvent} event
 * @returns {Promise<void>}
 */
export async function checkAuthorization(event) {
  const token = getToken(event.headers);
  const privateKey = process.env.private_key;
  const isAuthorized = await authorize("admin", token, privateKey);
  if (!isAuthorized) {
    throw new AuthorizationError("Unauthorized");
  }
}
