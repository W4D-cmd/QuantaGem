import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";
import { pool } from "@/lib/db";

export async function cleanupExpiredTemporaryFiles(): Promise<{ deletedCount: number; error?: string }> {
  try {
    const result = await pool.query<{ id: number; object_name: string }>(
      `SELECT id, object_name FROM temporary_files WHERE expires_at < now()`
    );

    const expiredFiles = result.rows;

    if (expiredFiles.length === 0) {
      return { deletedCount: 0 };
    }

    const objectNames = expiredFiles.map((f) => f.object_name);

    await minioClient.removeObjects(MINIO_BUCKET_NAME, objectNames);

    const ids = expiredFiles.map((f) => f.id);
    await pool.query(`DELETE FROM temporary_files WHERE id = ANY($1)`, [ids]);

    console.log(`[Cleanup] Deleted ${expiredFiles.length} expired temporary file(s)`);
    return { deletedCount: expiredFiles.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Cleanup] Error cleaning up temporary files:", errorMessage);
    return { deletedCount: 0, error: errorMessage };
  }
}
