import { DeviceManagement } from "@/components/device-management";
import { listDevices } from "@/lib/hik/store";
import { toPublicDevice } from "@/lib/hik/types";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const devices = await listDevices();
  const initialDevices = devices.map(toPublicDevice);
  const metaById = Object.fromEntries(
    devices.map((device) => [
      device.id,
      {
        model: device.deviceModel ?? null,
        serial: device.deviceSerial ?? null,
      },
    ]),
  );
  return <DeviceManagement initialDevices={initialDevices} metaById={metaById} />;
}
