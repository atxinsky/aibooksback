import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const HASH_PREFIX = "scrypt:v1";

export function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${HASH_PREFIX}:${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string) {
  const [prefix, version, salt, key] = stored.split(":");
  if (`${prefix}:${version}` !== HASH_PREFIX || !salt || !key) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

