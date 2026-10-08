export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ listDevices }, { startDevice }, { startDailyHistorySync }] =
    await Promise.all([
      import("@/lib/hik/store"),
      import("@/lib/hik/registry"),
      import("@/lib/hik/daily-history-sync"),
    ]);

  startDailyHistorySync();

  try {
    const devices = await listDevices();
    for (const device of devices) {
      startDevice(device);
    }
    console.info(
      `[attendance] Live collection started for ${devices.length} configured device(s).`,
    );
  } catch (error) {
    console.error(
      `[attendance] Could not start live collection: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
