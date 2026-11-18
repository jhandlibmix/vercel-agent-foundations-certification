import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, isAdminToken } from "@/lib/admin-auth";

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  // Check the login token without putting the password in the cookie.
  if (isAdminToken(cookie)) {
    return NextResponse.next();
  }

  // The admin chat needs an auth error, not a login page.
  if (pathname.startsWith("/api/admin/")) {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

// Keep the admin chat API behind the same login as the page.
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
