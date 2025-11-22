import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader; // oder parseInt(userIdHeader, 10);
  const userEmail = request.headers.get("x-user-email");

  return NextResponse.json({ id: userId, email: userEmail });
}
