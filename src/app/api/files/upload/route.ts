import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { bucket, ensureBucketExists } from "@/lib/gcs";
import { randomUUID } from "crypto";

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

    const gcsObjectName = `${randomUUID()}/${originalFileName}`;
    const gcsFile = bucket.file(gcsObjectName);

    await gcsFile.save(fileBuffer, {
      metadata: {
        contentType: mimeType,
      },
    });

    const gcsUri = `gs://${bucket.name}/${gcsObjectName}`;

    // Für Vertex AI wird der GCS-Dateiname und die URI als Referenz verwendet.
    // Ein explizites "Google File" Objekt wird nicht erstellt.
    return NextResponse.json({
      success: true,
      message: "File uploaded successfully to GCS.",
      fileName: originalFileName,
      mimeType: mimeType,
      size: fileSize,
      googleFileName: gcsObjectName, // Behält Konsistenz, repräsentiert GCS-Objektnamen
      googleFileUri: gcsUri,
    });
  } catch (error) {
    console.error("Error uploading file to GCS:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during file upload.";
    return NextResponse.json({ error: "Failed to upload file", details: errorMessage }, { status: 500 });
  }
}
