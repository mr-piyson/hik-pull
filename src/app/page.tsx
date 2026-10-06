import { Dashboard } from "@/components/dashboard";
import { prisma } from "@/lib/hik/db";
import { listUserSyncLogs } from "@/lib/hik/user-store";

// The overview reflects live database counts and is rendered on every request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [deviceCount, userCount, eventCount, failedSyncCount, recentSyncs] =
    await Promise.all([
      prisma.device.count(),
      prisma.user.count(),
      prisma.logEvent.count(),
      prisma.userSyncLog.count({ where: { status: "failure" } }),
      listUserSyncLogs(6),
    ]);
  return (
    <Dashboard
      deviceCount={deviceCount}
      userCount={userCount}
      eventCount={eventCount}
      failedSyncCount={failedSyncCount}
      recentSyncs={recentSyncs}
    />
  );
}
