import { DeviceManagement } from "@/components/device-management";
import { listDevices } from "@/lib/hik/store";
import { toPublicDevice } from "@/lib/hik/types";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const devices = (await listDevices()).map(toPublicDevice);
  return <DeviceManagement initialDevices={devices} />;
}
