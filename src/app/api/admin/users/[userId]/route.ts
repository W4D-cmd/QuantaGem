import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  // Extract adminId from adminCheck (which is the decoded token)
  // requireAdmin returns the decoded payload if successful
  const adminId = (adminCheck as any).id;
  const targetUserId = parseInt(params.userId, 10);

  if (isNaN(targetUserId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  if (adminId === targetUserId) {
    return NextResponse.json({ error: "You cannot delete yourself" }, { status: 400 });
  }

  try {
    // 1. Get all file keys for the user (project files and temporary files)
    const filesQuery = await pool.query(
      `
      SELECT object_name FROM project_files pf 
      JOIN projects p ON pf.project_id = p.id 
      WHERE p.user_id = $1
      UNION
      SELECT object_name FROM temporary_files 
      WHERE user_id = $1
      `,
      [targetUserId]
    );

    const objectNames = filesQuery.rows.map((r: any) => r.object_name);

    // 2. Delete files from MinIO
    if (objectNames.length > 0) {
      try {
        await minioClient.removeObjects(MINIO_BUCKET_NAME, objectNames);
      } catch (minioError) {
        console.error("Failed to delete user files from MinIO:", minioError);
        // We continue anyway to delete the DB record, but we log the error
      }
    }

    // 3. Delete user from database (cascading will handle related records)
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [targetUserId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, userId: targetUserId });
  } catch (error) {
    console.error("Admin user deletion error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
