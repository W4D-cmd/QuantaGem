import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";

const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/ping",
  "/highlightjs-themes/:path*",
];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  if (
    path.startsWith("/_next/") ||
    publicPaths.some((publicPath) => {
      if (publicPath.endsWith("/:path*")) {
        const basePath = publicPath.replace("/:path*", "");
        return path.startsWith(basePath);
      }
      return publicPath === path;
    })
  ) {
    return NextResponse.next();
  }

  const authTokenFromHeader = request.headers.get("Authorization");
  const sessionCookie = request.cookies.get("__session");

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
      if (sessionCookie && tokenToVerify === sessionCookie.value) {
        res.cookies.delete("__session");
      }
      return res;
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Middleware authentication error during token verification:", error);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "internal_error");
    const res = NextResponse.redirect(loginUrl);
    if (sessionCookie && tokenToVerify === sessionCookie.value) {
      res.cookies.delete("__session");
    }
    return res;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/files/upload (file upload route)
     * - api/projects/.../files (project file upload route)
     * - api/stt/transcribe (audio file upload route)
     */
    "/((?!api/files/upload|api/projects/.*/files|api/stt/transcribe|_next/static|_next/image|favicon.ico).*)",
  ],
};
