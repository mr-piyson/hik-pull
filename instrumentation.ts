export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [
    { listDevices },
    { startDevice },
    { configureDailyHistorySync },
    { getAppSettings },
  ] = await Promise.all([
    import("./src/lib/hik/store"),
    import("./src/lib/hik/registry"),
    import("./src/lib/hik/daily-history-sync"),
    import("./src/lib/hik/settings-store"),
  ]);

  try {
    await configureDailyHistorySync();
    const [devices, settings] = await Promise.all([
      listDevices(),
      getAppSettings(),
    ]);
    if (settings.autoStartLiveStreams) {
      for (const device of devices) {
        startDevice(device);
      }
      console.info(
        `[attendance] Live collection auto-started for ${devices.length} configured device(s).`,
      );
    } else {
      console.info(
        "[attendance] Automatic live collection is disabled in settings.",
      );
    }
  } catch (error) {
    console.error(
      `[startup] Could not apply persisted collection settings: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
