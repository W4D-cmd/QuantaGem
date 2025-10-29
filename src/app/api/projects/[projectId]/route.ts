import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";

export async function GET(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();
  const { projectId } = params;

  try {
    const projectResult = await pool.query(
      `SELECT id, title, system_prompt AS "systemPrompt", created_at AS "createdAt", updated_at AS "updatedAt"
             FROM projects
             WHERE id = $1 AND user_id = $2`,
      [projectId, userId],
    );

    if (projectResult.rows.length === 0) {
      return NextResponse.json({ error: "Project not found or not owned by user" }, { status: 404 });
    }

    const project = projectResult.rows[0];

    const projectFilesResult = await pool.query(
      `SELECT id, object_name AS "objectName", file_name AS "fileName", mime_type AS "mimeType", size
             FROM project_files
             WHERE project_id = $1 AND user_id = $2
             ORDER BY created_at ASC`,
      [projectId, userId],
    );

    return NextResponse.json({
      ...project,
      files: projectFilesResult.rows,
    });
  } catch (error) {
    console.error(`Error fetching project ${projectId} for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch project", details: errorMessage }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();
  const { projectId } = params;
  const { title, systemPrompt } = (await request.json()) as {
    title?: string;
    systemPrompt?: string;
  };

  const sets: string[] = [];
  const vals: (string | number)[] = [];
  let idx = 1;

  if (title !== undefined) {
    sets.push(`title = $${idx++}`);
    vals.push(title);
  }
  if (systemPrompt !== undefined) {
    sets.push(`system_prompt = $${idx++}`);
    vals.push(systemPrompt);
  }

  if (!sets.length) {
    return NextResponse.json({ error: "No fields provided for update" }, { status: 400 });
  }
  sets.push(`updated_at = now()`);

  const sql = `
        UPDATE projects
        SET ${sets.join(", ")}
        WHERE id = $${idx} AND user_id = $${idx + 1}
    `;
  vals.push(projectId, userId);

  try {
    const result = await pool.query(sql, vals);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Project not found or not owned by user" }, { status: 404 });
    }
    const { rows } = await pool.query(
      `SELECT id, title, system_prompt AS "systemPrompt", created_at AS "createdAt", updated_at AS "updatedAt" FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, userId],
    );
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error(`Error updating project ${projectId} for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to update project", details: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();
  const { projectId } = params;

  try {
    const projectCheck = await pool.query(`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, [
      projectId,
      userId,
    ]);

    if (projectCheck.rowCount === 0) {
      return NextResponse.json({ error: "Project not found or not owned by user" }, { status: 404 });
    }

    const projectFilesResult = await pool.query<{ object_name: string }>(
      `SELECT object_name FROM project_files WHERE project_id = $1`,
      [projectId],
    );

    const objectNamesToDelete: string[] = projectFilesResult.rows.map((row) => row.object_name);

    if (objectNamesToDelete.length > 0) {
      const uniqueObjectNames = Array.from(new Set(objectNamesToDelete));
      console.log(
        `Attempting to delete ${uniqueObjectNames.length} objects from MinIO for project ${projectId} (user ${userId}):`,
        uniqueObjectNames,
      );
      try {
        await minioClient.removeObjects(MINIO_BUCKET_NAME, uniqueObjectNames);
        console.log(
          `Successfully submitted deletion request for ${uniqueObjectNames.length} objects from MinIO for project ${projectId} (user ${userId}).`,
        );
      } catch (minioError) {
        console.error(`Error deleting objects from MinIO for project ${projectId} (user ${userId}):`, minioError);
      }
    }

    const deleteResult = await pool.query(
      `DELETE FROM projects
             WHERE id = $1 AND user_id = $2`,
      [projectId, userId],
    );

    if (deleteResult.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Project not found or not owned by user, nothing deleted.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Project, its chats, and associated files (if any) deleted.",
    });
  } catch (error) {
    console.error(`Error deleting project ${projectId} for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to delete project", details: errorMessage }, { status: 500 });
  }
}
