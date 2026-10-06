import { randomUUID } from "node:crypto";
import { probeDevice } from "@/lib/hik/registry";
import {
  assertHost,
  assertPassword,
  assertPort,
  assertScheme,
  assertUsername,
  listDevices,
  saveDevice,
} from "@/lib/hik/store";
import { type DeviceRecord, toPublicDevice } from "@/lib/hik/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const devices = await listDevices();
  return Response.json({ devices: devices.map(toPublicDevice) });
}

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Request body must be JSON.");
  }

  let device: DeviceRecord;
  try {
    const port = Number(payload.port ?? 80);
    assertPort(port);
    device = {
      id: randomUUID(),
      label: typeof payload.label === "string" ? payload.label.trim() : "",
      scheme: assertScheme(payload.scheme),
      host: assertHost(String(payload.host ?? "")),
      port,
      username: assertUsername(String(payload.username ?? "")),
      password: assertPassword(String(payload.password ?? "")),
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : String(error));
  }

  if (device.label.length === 0) {
    device.label = `${device.host}:${device.port}`;
  }

  // Validate against the real device before persisting, so a typo is reported
  // now rather than surfacing as an authentication failure later.
  try {
    const info = await probeDevice(device);
    const saved = await saveDevice(device);
    return Response.json(
      { device: toPublicDevice(saved), info },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error: "Could not authenticate against the device. Nothing was saved.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request) {
  // Bulk-import convenience: write devices without probing, for restoring a
  // backup. Individual adds should use POST so credentials get verified.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Request body must be JSON.");
  }
  if (!Array.isArray(payload)) {
    return badRequest("Expected an array of devices.");
  }
  const saved: DeviceRecord[] = [];
  for (const item of payload) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const raw = item as Record<string, unknown>;
    saved.push(
      await saveDevice({
        id: typeof raw.id === "string" ? raw.id : randomUUID(),
        label: typeof raw.label === "string" ? raw.label : "",
        scheme: assertScheme(raw.scheme),
        host: assertHost(String(raw.host ?? "")),
        port: Number(raw.port ?? 80),
        username: assertUsername(String(raw.username ?? "")),
        password: assertPassword(String(raw.password ?? "")),
        createdAt:
          typeof raw.createdAt === "string"
            ? raw.createdAt
            : new Date().toISOString(),
      }),
    );
  }
  return Response.json({ devices: saved.map(toPublicDevice) });
}
