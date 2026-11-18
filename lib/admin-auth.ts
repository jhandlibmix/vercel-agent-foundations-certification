/**
 * Shared helpers for the demo-grade admin gate.
 *
 * Imported by `proxy.ts` and the login/logout server actions.
 * Keep the password on the server. Use a signed cookie for admin access instead.
 * This is not a production auth system.
 */
import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "admin_auth";

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is not configured.");
  return password;
}

export function isAdminPassword(password: string): boolean {
  return password === getAdminPassword();
}

function signToken(nonce: string): string {
  return createHmac("sha256", getAdminPassword()).update(nonce).digest("hex");
}

export function createAdminToken(): string {
  const nonce = randomBytes(32).toString("hex");
  return `${nonce}.${signToken(nonce)}`;
}

export function isAdminToken(token: string | undefined): boolean {
  if (!token || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)) return false;
  if (!process.env.ADMIN_PASSWORD) return false;
  const [nonce, signature] = token.split(".");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(signToken(nonce)));
}

export async function isAdminAuthenticated(): Promise<boolean> {
  return isAdminToken((await cookies()).get(ADMIN_COOKIE_NAME)?.value);
}
