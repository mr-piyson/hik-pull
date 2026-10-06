import { Dashboard } from "@/components/dashboard";
import { listDevices } from "@/lib/hik/store";
import { toPublicDevice } from "@/lib/hik/types";

// Devices live on disk and change outside the render, so this must never be
// prerendered.
export const dynamic = "force-dynamic";

export default async function Home() {
  const devices = (await listDevices()).map(toPublicDevice);
  return <Dashboard initialDevices={devices} />;
}
