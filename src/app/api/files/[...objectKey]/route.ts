import { NextRequest, NextResponse } from "next/server";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";
import { getUserFromToken } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }

  const params = context.params as { objectKey: string[] };

  if (!params || !params.objectKey) {
    console.error("Invalid params in GET /api/files:", params);
    return NextResponse.json({ error: "Internal server error: Invalid route parameters" }, { status: 500 });
  }
  const objectPathParams = params.objectKey;

  if (!Array.isArray(objectPathParams)) {
    console.error("objectKey is not an array:", objectPathParams);
    return NextResponse.json({ error: "Internal server error: Invalid objectKey format" }, { status: 500 });
  }

  const objectPath = objectPathParams.join("/");

  if (!objectPath && objectPathParams.length > 0 && objectPathParams[0] !== "") {
  } else if (!objectPath && (objectPathParams.length === 0 || objectPathParams[0] === "")) {
    return NextResponse.json({ error: "File path is missing" }, { status: 400 });
  }

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
