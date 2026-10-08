import { AttendanceViewer } from "@/components/attendance-viewer";
import { listAttendanceLogs } from "@/lib/hik/attendance-store";
import { getAppSettings } from "@/lib/hik/settings-store";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const [initialPage, settings] = await Promise.all([
    listAttendanceLogs(0, 100),
    getAppSettings(),
  ]);
  return (
    <AttendanceViewer
      initialPage={initialPage}
      refreshSeconds={settings.attendanceRefreshSeconds}
    />
  );
}
