import * as Minio from "minio";

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "minio";
const MINIO_PORT = parseInt(process.env.MINIO_PORT || "9000", 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER!;
const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD!;
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === "true";
export const MINIO_BUCKET_NAME =
  process.env.MINIO_DEFAULT_BUCKET || "chat-files";

if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  throw new Error(
    "MinIO access key or secret key is not defined in environment variables.",
  );
}

export const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

export async function ensureBucketExists(
  bucketName: string = MINIO_BUCKET_NAME,
): Promise<void> {
  try {
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName);
      console.log(`Bucket ${bucketName} created successfully.`);
    }
  } catch (err) {
    console.error(`Error ensuring bucket ${bucketName} exists:`, err);
  }
}
