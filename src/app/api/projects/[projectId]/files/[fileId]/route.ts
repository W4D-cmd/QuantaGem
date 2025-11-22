import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { MINIO_BUCKET_NAME, minioClient } from "@/lib/minio";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; fileId: string }> },
) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader; // oder parseInt(userIdHeader, 10);
  const { projectId, fileId } = await context.params;

  try {
    const projectCheck = await pool.query(
      `SELECT id
             FROM projects
             WHERE id = $1
               AND user_id = $2`,
      [projectId, userId],
    );
    if (projectCheck.rowCount === 0) {
      return NextResponse.json({ error: "Project not found or not owned by user" }, { status: 404 });
    }

    const fileResult = await pool.query(
      `SELECT object_name
             FROM project_files
             WHERE id = $1
               AND project_id = $2
               AND user_id = $3`,
      [fileId, projectId, userId],
    );

    if (fileResult.rows.length === 0) {
      return NextResponse.json({ error: "File not found in project or not owned by user" }, { status: 404 });
    }

    const objectNameToDelete = fileResult.rows[0].object_name;

    try {
      await minioClient.removeObject(MINIO_BUCKET_NAME, objectNameToDelete);
      console.log(
        `Successfully deleted object ${objectNameToDelete} from MinIO for project file ${fileId} (project ${projectId}, user ${userId}).`,
      );
    } catch (minioError) {
      console.error(
        `Error deleting object ${objectNameToDelete} from MinIO for project file ${fileId} (project ${projectId}, user ${userId}):`,
        minioError,
      );
    }

    const deleteResult = await pool.query(
      `DELETE
             FROM project_files
             WHERE id = $1
               AND project_id = $2
               AND user_id = $3`,
      [fileId, projectId, userId],
    );

    if (deleteResult.rowCount === 0) {
      return NextResponse.json({ error: "File not found or not owned by user, nothing deleted" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      message: "Project file and associated object deleted successfully.",
    });
  } catch (error) {
    console.error(`Error deleting project file ${fileId} from project ${projectId} (user ${userId}):`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to delete project file", details: errorMessage }, { status: 500 });
  }
}
