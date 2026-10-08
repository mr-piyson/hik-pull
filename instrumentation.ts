export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startAttendanceWorker } = await import("./src/workers/attendance");

  try {
    // The worker is always running; Settings enable/disable its jobs through
    // the database, so nothing here needs restarting when an operator saves.
    startAttendanceWorker();
  } catch (error) {
    console.error(
      `[startup] Could not start the attendance worker: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
