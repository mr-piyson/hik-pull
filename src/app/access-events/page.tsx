import { AccessEventsViewer } from "@/components/access-events-viewer";
import { listDevices } from "@/lib/hik/store";
import { toPublicDevice } from "@/lib/hik/types";

export const dynamic = "force-dynamic";

export default async function AccessEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const [{ device: initialDeviceId }, records] = await Promise.all([
    searchParams,
    listDevices(),
  ]);
  return (
    <AccessEventsViewer
      devices={records.map(toPublicDevice)}
      initialDeviceId={initialDeviceId ?? null}
    />
  );
}
