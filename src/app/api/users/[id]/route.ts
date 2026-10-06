import { Prisma } from "@/generated/prisma/client";
import {
  deleteManagedUser,
  getManagedUser,
  listUserSyncLogsForUser,
  updateManagedUser,
} from "@/lib/hik/user-store";
import { deleteUserFromDevices, syncUserToDevices } from "@/lib/hik/user-sync";
import type { ManagedUser } from "@/lib/hik/user-types";
import { validateUserUpdate } from "@/lib/hik/user-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/users/[id]">,
) {
  const { id } = await context.params;
  const user = await getManagedUser(id);
  if (!user) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }
  const syncLogs = await listUserSyncLogsForUser(id);
  return Response.json({ user, syncLogs });
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/users/[id]">,
) {
  const { id } = await context.params;
  const current = await getManagedUser(id);
  if (!current) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  let input: ReturnType<typeof validateUserUpdate>;
  try {
    input = validateUserUpdate(payload, current);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  let user: ManagedUser;
  try {
    user = await updateManagedUser(id, input);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    throw error;
  }

  const results = await syncUserToDevices(user, "update", current.cardNo);
  return Response.json({ user, results });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/users/[id]">,
) {
  const { id } = await context.params;
  const user = await getManagedUser(id);
  if (!user) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  const results = await deleteUserFromDevices(user);
  const deleted = results.every((result) => result.ok);
  if (deleted) {
    await deleteManagedUser(id);
  }
  return Response.json({ deleted, results });
}
