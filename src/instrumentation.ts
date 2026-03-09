import cron from "node-cron";
import { cleanupExpiredTemporaryFiles } from "@/lib/cleanup";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Starting temporary files cleanup cron job...");

    // Run every 6 hours: 0 */6 * * *
    // For testing, run every minute: * * * * *
    cron.schedule("0 */6 * * *", async () => {
      console.log("[Cron] Running temporary files cleanup...");
      await cleanupExpiredTemporaryFiles();
    });

    console.log("[Instrumentation] Cleanup cron job scheduled (every 6 hours)");
  }
}
