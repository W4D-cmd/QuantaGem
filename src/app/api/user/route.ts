import { NextRequest, NextResponse } from "next/server";
import { getUserFromSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request.cookies);

  if (!user) {
    const response = NextResponse.json(
      { error: "Unauthorized: Invalid or expired session" },
      { status: 401 },
    );
    response.cookies.delete("session");
    return response;
  }

  return NextResponse.json({ id: user.id, email: user.email });
}
