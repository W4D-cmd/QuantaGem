import { Storage } from "@google-cloud/storage";

export const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

if (!GCS_BUCKET_NAME) {
  throw new Error("GCS_BUCKET_NAME is not defined in environment variables.");
}

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
});

const bucket = storage.bucket(GCS_BUCKET_NAME);

let bucketExistsChecked = false;

export async function ensureBucketExists(): Promise<void> {
  if (bucketExistsChecked) {
    return;
  }
  try {
    const [exists] = await bucket.exists();
    if (!exists) {
      await bucket.create();
      console.log(`Bucket ${GCS_BUCKET_NAME} created successfully.`);
    }
    bucketExistsChecked = true;
  } catch (err) {
    console.error(`Error ensuring GCS bucket ${GCS_BUCKET_NAME} exists:`, err);
    throw new Error(`Could not create or verify GCS bucket: ${GCS_BUCKET_NAME}`);
  }
}

export { storage, bucket };
