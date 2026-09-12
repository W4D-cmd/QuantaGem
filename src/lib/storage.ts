import * as Minio from "minio";

const S3_ENDPOINT = process.env.S3_ENDPOINT || "seaweedfs";
const S3_PORT = parseInt(process.env.S3_PORT || "8333", 10);
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY!;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY!;
const S3_USE_SSL = process.env.S3_USE_SSL === "true";
export const S3_BUCKET_NAME = process.env.S3_BUCKET || "chat-files";

if (!S3_ACCESS_KEY || !S3_SECRET_KEY) {
  throw new Error("S3 access key or secret key is not defined in environment variables.");
}

export const storageClient = new Minio.Client({
  endPoint: S3_ENDPOINT,
  port: S3_PORT,
  useSSL: S3_USE_SSL,
  pathStyle: true,
  accessKey: S3_ACCESS_KEY,
  secretKey: S3_SECRET_KEY,
});

export async function ensureBucketExists(bucketName: string = S3_BUCKET_NAME): Promise<void> {
  try {
    const bucketExists = await storageClient.bucketExists(bucketName);
    if (!bucketExists) {
      await storageClient.makeBucket(bucketName);
      console.log(`Bucket ${bucketName} created successfully.`);
    }
  } catch (err) {
    console.error(`Error ensuring bucket ${bucketName} exists:`, err);
  }
}

export interface MigratedFile {
  oldObjectName: string;
  newObjectName: string;
}

export async function migrateTemporaryFile(objectName: string): Promise<string> {
  if (!objectName.startsWith("temporary/")) {
    return objectName;
  }

  const newObjectName = objectName.replace(/^temporary\//, "");

  const conds = new Minio.CopyConditions();
  await storageClient.copyObject(
    S3_BUCKET_NAME,
    newObjectName,
    `/${S3_BUCKET_NAME}/${objectName}`,
    conds
  );

  await storageClient.removeObject(S3_BUCKET_NAME, objectName);

  return newObjectName;
}

export async function migrateTemporaryFiles(objectNames: string[]): Promise<MigratedFile[]> {
  const migrated: MigratedFile[] = [];

  for (const objectName of objectNames) {
    if (objectName.startsWith("temporary/")) {
      const newObjectName = await migrateTemporaryFile(objectName);
      migrated.push({ oldObjectName: objectName, newObjectName });
    }
  }

  return migrated;
}
