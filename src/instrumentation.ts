export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Starting temporary files cleanup cron job...");

    const cron = (await import("node-cron")).default;
    const { cleanupExpiredTemporaryFiles } = await import("@/lib/cleanup");

    cron.schedule("0 */6 * * *", async () => {
      console.log("[Cron] Running temporary files cleanup...");
      await cleanupExpiredTemporaryFiles();
    });

    console.log("[Instrumentation] Cleanup cron job scheduled (every 6 hours)");
  }
}
