import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { cleanupExpiredTemporaryFiles } from "@/lib/cleanup";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
  }

  const result = await cleanupExpiredTemporaryFiles();

  if (result.error) {
    return NextResponse.json(
      { error: "Failed to clean up temporary files", details: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: result.deletedCount > 0
      ? `Cleaned up ${result.deletedCount} expired temporary file(s)`
      : "No expired temporary files to clean up",
    deletedCount: result.deletedCount,
  });
}
