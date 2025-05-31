import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Invalid or expired session" }, { status: 401 });
  }

  return NextResponse.json({ id: user.id, email: user.email });
}
