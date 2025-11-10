import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { bucket, ensureBucketExists } from "@/lib/gcs";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();
  const { projectId } = await context.params;

  try {
    const projectCheck = await pool.query(`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, [
      projectId,
      userId,
    ]);
    if (projectCheck.rowCount === 0) {
      return NextResponse.json({ error: "Project not found or not owned by user" }, { status: 404 });
    }

    const { rows } = await pool.query(
      `SELECT id, object_name AS "objectName", file_name AS "fileName", mime_type AS "mimeType", size,
         google_file_name AS "googleFileName", google_file_uri AS "googleFileUri"
       FROM project_files
       WHERE project_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [projectId, userId],
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error(`Error fetching project files for project ${projectId} (user ${userId}):`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch project files", details: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();
  const { projectId } = await context.params;

  try {
    const projectCheck = await pool.query(`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, [
      projectId,
      userId,
    ]);
    if (projectCheck.rowCount === 0) {
      return NextResponse.json({ error: "Project not found or not owned by user" }, { status: 404 });
    }

    await ensureBucketExists();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File not provided" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const originalFileName = file.name;
    const mimeType = file.type;
    const fileSize = file.size;

    const gcsObjectName = `${randomUUID()}/${originalFileName}`;
    const gcsFile = bucket.file(gcsObjectName);

    await gcsFile.save(fileBuffer, { metadata: { contentType: mimeType } });
    const gcsUri = `gs://${bucket.name}/${gcsObjectName}`;

    const { rows } = await pool.query(
      `INSERT INTO project_files (project_id, user_id, object_name, file_name, mime_type, size, google_file_name, google_file_uri)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, object_name AS "objectName", file_name AS "fileName", mime_type AS "mimeType", size,
                 google_file_name AS "googleFileName", google_file_uri AS "googleFileUri"`,
      [projectId, userId, gcsObjectName, originalFileName, mimeType, fileSize, gcsObjectName, gcsUri],
    );

    return NextResponse.json({
      success: true,
      message: "File uploaded and associated with project successfully",
      ...rows[0],
    });
  } catch (error) {
    console.error(`Error uploading project file to project ${projectId} (user ${userId}):`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during file upload.";
    return NextResponse.json({ error: "Failed to upload project file", details: errorMessage }, { status: 500 });
  }
}
