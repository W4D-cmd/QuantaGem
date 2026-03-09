import { NextRequest, NextResponse } from "next/server";
import { minioClient, MINIO_BUCKET_NAME, ensureBucketExists } from "@/lib/minio";
import { randomUUID } from "crypto";
import { getUserFromToken } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
  }
  const userId = user.id.toString();

  try {
    await ensureBucketExists();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const isTemporary = formData.get("isTemporary") === "true";

    if (!file) {
      return NextResponse.json({ error: "File not provided" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const originalFileName = file.name;
    const mimeType = file.type;
    const fileSize = file.size;

    const fileExtension = originalFileName.split(".").pop() || "";
    const baseName = originalFileName.substring(0, originalFileName.lastIndexOf(".")).replace(/[^a-zA-Z0-9_.-]/g, "_");

    const uuid = randomUUID();
    const objectName = isTemporary
      ? `temporary/${uuid}_${baseName}.${fileExtension}`
      : `${uuid}_${baseName}.${fileExtension}`;

    await minioClient.putObject(MINIO_BUCKET_NAME, objectName, fileBuffer, fileSize, { "Content-Type": mimeType });

    if (isTemporary) {
      await pool.query(
        `INSERT INTO temporary_files (user_id, object_name, file_name, mime_type, size, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '24 hours')`,
        [userId, objectName, originalFileName, mimeType, fileSize]
      );
    }

    return NextResponse.json({
      type: "file",
      success: true,
      message: "File uploaded successfully",
      fileName: originalFileName,
      mimeType: mimeType,
      objectName: objectName,
      size: fileSize,
      isTemporary: isTemporary,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during file upload.";
    return NextResponse.json({ error: "Failed to upload file", details: errorMessage }, { status: 500 });
  }
}
