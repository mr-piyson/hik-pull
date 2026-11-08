import { Dashboard } from "@/components/dashboard";
import { prisma } from "@/lib/hik/db";
import { listUserSyncLogs } from "@/lib/hik/user-store";

// The overview reflects live database counts and is rendered on every request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    deviceCount,
    onlineDevices,
    userCount,
    eventCount,
    eventsToday,
    failedSyncCount,
    recentSyncs,
  ] = await Promise.all([
    prisma.device.count(),
    prisma.device.count({ where: { status: "online" } }),
    prisma.user.count(),
    prisma.logEvent.count(),
    prisma.attendanceLog.count({ where: { dateTime: { gte: startOfDay } } }),
    prisma.userSyncLog.count({ where: { status: "failure" } }),
    listUserSyncLogs(6),
  ]);

  return (
    <Dashboard
      deviceCount={deviceCount}
      onlineDevices={onlineDevices}
      userCount={userCount}
      eventCount={eventCount}
      eventsToday={eventsToday}
      failedSyncCount={failedSyncCount}
      recentSyncs={recentSyncs}
    />
  );
}
