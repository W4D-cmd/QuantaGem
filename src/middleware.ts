import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";

const publicPaths = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/ping",
];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/_next/") || publicPaths.includes(path)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("__session");
  const authTokenFromHeader = request.headers.get("Authorization");

  let tokenToVerify: string | undefined;

  if (authTokenFromHeader && authTokenFromHeader.startsWith("Bearer ")) {
    tokenToVerify = authTokenFromHeader.substring(7);
  } else if (sessionCookie) {
    tokenToVerify = sessionCookie.value;
  }

  if (!tokenToVerify) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const payload = await verifyAuthToken(tokenToVerify);

    if (!payload) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete("__session");
      return res;
    }

    return NextResponse.next();
  } catch (error) {
    console.error(
      "Middleware authentication error during token verification:",
      error,
    );
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "internal_error");
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("__session");
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|favicon.ico).*)"],
};
