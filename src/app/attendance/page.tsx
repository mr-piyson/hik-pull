import { AttendanceViewer } from "@/components/attendance-viewer";
import { listAttendanceLogs } from "@/lib/hik/attendance-store";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const initialPage = await listAttendanceLogs(0, 100);
  return <AttendanceViewer initialPage={initialPage} />;
}
