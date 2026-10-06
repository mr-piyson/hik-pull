import { SyncHistory } from "@/components/sync-history";
import { listUserSyncLogs } from "@/lib/hik/user-store";

export const dynamic = "force-dynamic";

export default async function SyncHistoryPage() {
  const entries = await listUserSyncLogs(500);
  return <SyncHistory entries={entries} />;
}
