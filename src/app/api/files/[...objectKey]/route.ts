import { NextRequest, NextResponse } from "next/server";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";

export async function GET(request: NextRequest, context: { params: Promise<{ objectKey: string[] }> }) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader; // oder parseInt(userIdHeader, 10);

  const { objectKey } = await context.params;

  if (!objectKey || !Array.isArray(objectKey) || objectKey.length === 0) {
    console.error("Invalid objectKey in GET /api/files:", objectKey);
    return NextResponse.json({ error: "File path is missing or invalid" }, { status: 400 });
  }

  const objectPath = objectKey.join("/");

  try {
    const stat = await minioClient.statObject(MINIO_BUCKET_NAME, objectPath);
    const stream = await minioClient.getObject(MINIO_BUCKET_NAME, objectPath);

    const webReadableStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    const headers = new Headers();
    headers.set("Content-Type", stat.metaData?.["content-type"] || "application/octet-stream");
    headers.set("Content-Length", stat.size.toString());

    return new NextResponse(webReadableStream, {
      status: 200,
      headers: headers,
    });
  } catch (error: unknown) {
    console.error(`Error fetching file ${objectPath} from MinIO:`, error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      ((error as { code: string }).code === "NoSuchKey" || (error as { code: string }).code === "NotFound")
    ) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "httpStatusCode" in error &&
      (error as { httpStatusCode: number }).httpStatusCode === 404
    ) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to retrieve file" }, { status: 500 });
  }
}
