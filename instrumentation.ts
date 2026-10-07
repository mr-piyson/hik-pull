export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startDailyHistorySync } = await import(
    "./src/lib/hik/daily-history-sync"
  );
  startDailyHistorySync();
}
