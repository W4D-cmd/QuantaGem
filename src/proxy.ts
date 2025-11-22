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
  const requestHeaders = new Headers(request.headers);

  // Allow OPTIONS requests to pass through for CORS preflight checks.
  if (request.method === "OPTIONS") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Check if the path is a public one that doesn't require authentication.
  const isPublic = publicPaths.some((publicPath) => {
    if (publicPath.endsWith("/:path*")) {
      const basePath = publicPath.replace("/:path*", "");
      return path.startsWith(basePath);
    }
    return publicPath === path;
  });

  if (path.startsWith("/_next/") || isPublic) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Extract token from either header (for mobile/API clients) or cookie (for web client).
  const authTokenFromHeader = request.headers.get("Authorization");
  const sessionCookie = request.cookies.get("__session");

  let tokenToVerify: string | undefined;

  if (authTokenFromHeader && authTokenFromHeader.startsWith("Bearer ")) {
    tokenToVerify = authTokenFromHeader.substring(7);
  } else if (sessionCookie) {
    tokenToVerify = sessionCookie.value;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);

  // If no token is found, redirect to login.
  if (!tokenToVerify) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const payload = await verifyAuthToken(tokenToVerify);

    // If token is invalid or expired, redirect to login and clear cookie if present.
    if (!payload) {
      const res = NextResponse.redirect(loginUrl);
      if (sessionCookie && tokenToVerify === sessionCookie.value) {
        res.cookies.delete("__session");
      }
      return res;
    }

    // Auth successful: Decorate the request with user info and pass it on.
    requestHeaders.set("x-user-id", payload.userId.toString());
    requestHeaders.set("x-user-email", payload.email);

    // This is the crucial fix: return NextResponse.next() with a cloned request object.
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error("Middleware authentication error during token verification:", error);
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
     * This ensures the middleware runs on all pages and API routes, except for static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
