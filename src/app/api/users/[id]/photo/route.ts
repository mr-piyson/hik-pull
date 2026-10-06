import { Buffer } from "node:buffer";
import {
  compressUserPhoto,
  MAX_DEVICE_PHOTO_BYTES,
  MAX_UPLOAD_BYTES,
} from "@/lib/hik/user-photo";
import {
  getManagedUser,
  getManagedUserPhoto,
  saveManagedUserPhoto,
} from "@/lib/hik/user-store";
import { syncUserPhotoToDevices } from "@/lib/hik/user-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readUpload(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    throw new RangeError("The source image must be 10 MB or smaller.");
  }
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new RangeError("The source image must be 10 MB or smaller.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks, total));
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/users/[id]/photo">,
) {
  const { id } = await context.params;
  const image = await getManagedUserPhoto(id);
  if (!image) {
    return Response.json({ error: "User photo not found." }, { status: 404 });
  }
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/users/[id]/photo">,
) {
  const { id } = await context.params;
  const user = await getManagedUser(id);
  if (!user) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  let input: Uint8Array<ArrayBuffer>;
  try {
    input = await readUpload(request);
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    return Response.json(
      { error: "Could not read the uploaded image." },
      { status: 400 },
    );
  }
  if (input.byteLength === 0) {
    return Response.json(
      { error: "Choose an image file to upload." },
      { status: 400 },
    );
  }

  let compressed: Uint8Array<ArrayBuffer>;
  try {
    compressed = await compressUserPhoto(Buffer.from(input));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not process the selected image.",
      },
      { status: 422 },
    );
  }

  await saveManagedUserPhoto(id, compressed);
  const results = await syncUserPhotoToDevices(user, compressed);
  return Response.json({
    photoUrl: user.photoUrl ?? `/api/users/${id}/photo`,
    sizeBytes: compressed.byteLength,
    maxSizeBytes: MAX_DEVICE_PHOTO_BYTES,
    results,
  });
}
