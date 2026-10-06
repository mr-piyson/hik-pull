import { captureAndEnrollFingerprint } from "@/lib/hik/client";
import { getDevice } from "@/lib/hik/store";
import { getManagedUser, recordUserSync } from "@/lib/hik/user-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCaptureRequest(value: unknown): {
  deviceId: string;
  fingerNo: number;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object.");
  }
  const payload = value as Record<string, unknown>;
  if (typeof payload.deviceId !== "string" || payload.deviceId.length === 0) {
    throw new Error("Choose a device for fingerprint enrollment.");
  }
  const fingerNo = Number(payload.fingerNo);
  if (!Number.isInteger(fingerNo) || fingerNo < 1 || fingerNo > 10) {
    throw new Error("Fingerprint slot must be between 1 and 10.");
  }
  return { deviceId: payload.deviceId, fingerNo };
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/users/[id]/fingerprints">,
) {
  const { id } = await context.params;
  const user = await getManagedUser(id);
  if (!user) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  let payload: { deviceId: string; fingerNo: number };
  try {
    payload = parseCaptureRequest(await request.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  const device = await getDevice(payload.deviceId);
  if (!device) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }

  try {
    await captureAndEnrollFingerprint(device, {
      employeeNo: user.employeeNo,
      fingerNo: payload.fingerNo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordUserSync({
      userId: user.id,
      employeeNo: user.employeeNo,
      userName: user.name,
      deviceId: device.id,
      deviceLabel: device.label,
      operation: "fingerprint",
      status: "failure",
      message,
    });
    return Response.json({ error: message }, { status: 502 });
  }

  await recordUserSync({
    userId: user.id,
    employeeNo: user.employeeNo,
    userName: user.name,
    deviceId: device.id,
    deviceLabel: device.label,
    operation: "fingerprint",
    status: "success",
    message: `Fingerprint ${payload.fingerNo} enrolled on the device.`,
  });
  return Response.json({
    ok: true,
    fingerNo: payload.fingerNo,
    deviceLabel: device.label,
  });
}
