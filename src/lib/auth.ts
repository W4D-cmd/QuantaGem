import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { NextRequest } from "next/server";

export interface User {
  id: number;
  email: string;
}

interface AuthPayload extends JWTPayload {
  userId: number;
  email: string;
}

function getJwtSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables.");
  }
  return new TextEncoder().encode(secret);
}

export async function generateAuthToken(userId: number, email: string): Promise<string> {
  const payload: AuthPayload = { userId, email };
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecretKey());
}

export async function verifyAuthToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ["HS256"],
    });

    if (typeof payload === "object" && payload !== null && "userId" in payload && "email" in payload) {
      return payload as AuthPayload;
    }
    return null;
  } catch (error) {
    console.log("Token verification failed:", error);
    return null;
  }
}

export async function getUserIdFromRequest(request: NextRequest): Promise<number | null> {
  const authHeader = request.headers.get("Authorization");
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    token = request.cookies.get("__session")?.value;
  }

  if (!token) {
    return null;
  }

  const payload = await verifyAuthToken(token);
  return payload ? payload.userId : null;
}

export async function getUserFromToken(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get("Authorization");
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    token = request.cookies.get("__session")?.value;
  }

  if (!token) {
    return null;
  }

  const payload = await verifyAuthToken(token);
  if (payload) {
    return { id: payload.userId, email: payload.email };
  }
  return null;
}
