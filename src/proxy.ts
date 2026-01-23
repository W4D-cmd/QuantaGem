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

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://webr.r-wasm.org blob:;
    script-src-elem 'self' 'unsafe-inline' https://webr.r-wasm.org;
    worker-src 'self' blob: https://webr.r-wasm.org;
    connect-src 'self' https://webr.r-wasm.org https://repo.r-wasm.org https://*.r-wasm.org;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    font-src 'self' data:;
    frame-src 'self' blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    upgrade-insecure-requests;
  `;
  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, " ").trim();
  
  const applyCSP = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);
    return res;
  };

  const isPublic = publicPaths.some((publicPath) => {
    if (publicPath.endsWith("/:path*")) {
      const basePath = publicPath.replace("/:path*", "");
      return pathname.startsWith(basePath);
    }
    return publicPath === pathname;
  });

  if (pathname.startsWith("/_next/") || isPublic) {
    return applyCSP(NextResponse.next());
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
    
    requestHeaders.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    response.headers.set("x-user-id", payload.userId.toString());
    response.headers.set("x-user-email", payload.email);
    
    return applyCSP(response);

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
