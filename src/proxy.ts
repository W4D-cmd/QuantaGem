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
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some((publicPath) => {
    if (publicPath.endsWith("/:path*")) {
      const basePath = publicPath.replace("/:path*", "");
      return pathname.startsWith(basePath);
    }
    return publicPath === pathname;
  });

  if (pathname.startsWith("/_next/") || isPublic) {
    return NextResponse.next();
  }

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
      if (sessionCookie?.value === tokenToVerify) {
        response.cookies.delete("__session");
      }
      return response;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.userId.toString());
    requestHeaders.set("x-user-email", payload.email);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error("Proxy authentication error:", error);
    loginUrl.searchParams.set("error", "internal_error");
    const response = NextResponse.redirect(loginUrl);
    if (sessionCookie?.value === tokenToVerify) {
      response.cookies.delete("__session");
    }
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
