import { probeDevice, stopDevice } from "@/lib/hik/registry";
import { deleteDevice, getDevice, saveDevice } from "@/lib/hik/store";
import { toPublicDevice } from "@/lib/hik/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/devices/[id]">,
) {
  const { id } = await context.params;
  const device = await getDevice(id);
  if (!device) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }
  return Response.json({ device: toPublicDevice(device) });
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/devices/[id]">,
) {
  const { id } = await context.params;
  const device = await getDevice(id);
  if (!device) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const next = {
    ...device,
    label:
      typeof payload.label === "string" ? payload.label.trim() : device.label,
    // Password is write-only: an empty or absent value keeps the stored one.
    password:
      typeof payload.password === "string" && payload.password.length > 0
        ? payload.password
        : device.password,
  };

  const changedCredentials =
    next.password !== device.password ||
    next.host !== device.host ||
    next.username !== device.username;

  if (changedCredentials) {
    try {
      await probeDevice(next);
    } catch (error) {
      return Response.json(
        {
          error:
            "Could not authenticate with the new credentials. Nothing was changed.",
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 502 },
      );
    }
  }

  return Response.json({ device: toPublicDevice(await saveDevice(next)) });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/devices/[id]">,
) {
  const { id } = await context.params;
  // Close the socket before dropping the record, otherwise the device keeps
  // pushing events for a device that no longer exists.
  stopDevice(id);
  const removed = await deleteDevice(id);
  if (!removed) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
