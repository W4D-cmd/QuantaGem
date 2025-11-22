import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";

// Public paths that do not require authentication.
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

// This function is the middleware that runs on matching requests.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow OPTIONS requests to pass through for CORS preflight checks.
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  // Check if the path is a public one.
  const isPublic = publicPaths.some((publicPath) => {
    if (publicPath.endsWith("/:path*")) {
      const basePath = publicPath.replace("/:path*", "");
      return pathname.startsWith(basePath);
    }
    return publicPath === pathname;
  });

  // Pass through Next.js-specific paths and public paths without authentication.
  if (pathname.startsWith("/_next/") || isPublic) {
    return NextResponse.next();
  }

  // Extract token from header (API clients) or cookie (web client).
  const authTokenFromHeader = request.headers.get("Authorization");
  const sessionCookie = request.cookies.get("__session");

  let tokenToVerify: string | undefined;

  if (authTokenFromHeader?.startsWith("Bearer ")) {
    tokenToVerify = authTokenFromHeader.substring(7);
  } else if (sessionCookie) {
    tokenToVerify = sessionCookie.value;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectedFrom", pathname);

  if (!tokenToVerify) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const payload = await verifyAuthToken(tokenToVerify);

    if (!payload) {
      const response = NextResponse.redirect(loginUrl);
      // Clear the cookie if it was the source of the invalid token.
      if (sessionCookie?.value === tokenToVerify) {
        response.cookies.delete("__session");
      }
      return response;
    }

    // Auth successful. Create a new Headers object to avoid mutating the original.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.userId.toString());
    requestHeaders.set("x-user-email", payload.email);

    // Using `NextResponse.rewrite` to the same URL is a known workaround for a
    // bug in some Next.js versions where `NextResponse.next` with modified headers breaks
    // streaming request bodies (like file uploads). This approach correctly
    // forwards the modified headers without disturbing the body stream.
    return NextResponse.rewrite(request.nextUrl, {
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error("Middleware authentication error:", error);
    loginUrl.searchParams.set("error", "internal_error");
    const response = NextResponse.redirect(loginUrl);
    if (sessionCookie?.value === tokenToVerify) {
      response.cookies.delete("__session");
    }
    return response;
  }
}

// The matcher configuration remains the same.
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
