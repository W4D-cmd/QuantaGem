import { NextRequest, NextResponse } from "next/server";
import { minioClient, MINIO_BUCKET_NAME, ensureBucketExists } from "@/lib/minio";
import { randomUUID } from "crypto";
import { getUserFromToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }

  try {
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

    const fileExtension = originalFileName.split(".").pop() || "";
    const baseName = originalFileName.substring(0, originalFileName.lastIndexOf(".")).replace(/[^a-zA-Z0-9_.-]/g, "_");

    const objectName = `${randomUUID()}_${baseName}.${fileExtension}`;

    await minioClient.putObject(MINIO_BUCKET_NAME, objectName, fileBuffer, fileSize, { "Content-Type": mimeType });

    return NextResponse.json({
      type: "file",
      success: true,
      message: "File uploaded successfully",
      fileName: originalFileName,
      mimeType: mimeType,
      objectName: objectName,
      size: fileSize,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during file upload.";
    return NextResponse.json({ error: "Failed to upload file", details: errorMessage }, { status: 500 });
  }
}
