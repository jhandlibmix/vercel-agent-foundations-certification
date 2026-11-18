"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, createAdminToken, isAdminPassword } from "./admin-auth";

const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 day

export async function loginAction(formData: FormData): Promise<void> {
  const password = formData.get("password");
  if (typeof password !== "string" || !isAdminPassword(password)) {
    redirect("/admin/login?error=1");
  }
  const store = await cookies();
  // Keep the password on the server, not in the cookie.
  store.set(ADMIN_COOKIE_NAME, createAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    // The admin chat API needs the login cookie too.
    path: "/",
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  redirect("/admin/login");
}
