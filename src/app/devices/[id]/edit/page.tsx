import { notFound } from "next/navigation";
import { DeviceForm } from "@/components/device-form";
import { getDevice } from "@/lib/hik/store";
import { toPublicDevice } from "@/lib/hik/types";

export const dynamic = "force-dynamic";

export default async function EditDevicePage({
  params,
}: PageProps<"/devices/[id]/edit">) {
  const { id } = await params;
  const device = await getDevice(id);

  if (!device) {
    notFound();
  }

  return <DeviceForm mode="edit" initialDevice={toPublicDevice(device)} />;
}
