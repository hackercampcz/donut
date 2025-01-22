import { parse, serialize } from "cookie";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

/** @typedef {import("cookie").SerializeOptions} SerializeOptions */

const COOKIE_NAME = "hc-id";
const options = {
  issuer: "https://api.hackercamp.cz/",
  audience: "https://donut.hackercamp.cz/",
  expiresIn: "14 days"
};

async function verify(secret, token) {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, {
    issuer: options.issuer,
    audience: options.audience,
  });
  return payload;
}

export async function authorize(role, token, secret) {
  const payload = await verify(secret, token);
  switch (role) {
    case "admin":
      return payload["https://hackercamp.cz/is_admin"];
    default:
      return false;
  }
}

export async function validateToken(token, secret) {
  if (token == null) return false;
  try {
    return await verify(secret, token);
  } catch (err) {
    console.error(err);
    return null;
  }
}

export function getCookies(headers) {
  if (headers?.Cookie) {
    // API Gateway Proxy request
    return parse(headers.Cookie);
  }
  if (headers?.cookie) {
    // Cloudfront request
    return headers.cookie.reduce(
      (reduced, header) => Object.assign(reduced, parse(header.value)),
      {},
    );
  }
  if (headers?.get) {
    // Cloudinary request
    const cookie = headers.get("cookie");
    if (cookie) return parse(cookie);
  }
  return null;
}

function getAuthorization(headers) {
  return (
    headers.authorization?.[0]?.value
    ?? headers.Authorization
    ?? (typeof headers.get === "function"
      ? headers.get("authorization")
      : null)
  );
}

export function getToken(headers) {
  const cookies = getCookies(headers);
  if (cookies?.["hc-id"]) return cookies["hc-id"];

  const authorization = getAuthorization(headers);
  if (!authorization?.startsWith("Bearer ")) return null;
  const [, token] = authorization.split("Bearer ");
  return token;
}

/**
 * @param {string} idToken
 * @param {SerializeOptions} options
 * @return {string}
 */
export function createCookie(idToken, options) {
  return serialize(COOKIE_NAME, idToken, options);
}

export function signJWT(payload, privateKey) {
  const secret = new TextEncoder().encode(privateKey);
  const jwt = new SignJWT(payload)
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setIssuer(options.issuer)
  .setAudience(options.audience)
  .setExpirationTime(options.expiresIn);
  return jwt.sign(secret);
}
