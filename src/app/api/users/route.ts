import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  createManagedUser,
  listManagedUsers,
  listUserSyncLogs,
} from "@/lib/hik/user-store";
import { syncUserToDevices } from "@/lib/hik/user-sync";
import type { ManagedUser } from "@/lib/hik/user-types";
import { validateNewUser } from "@/lib/hik/user-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [users, syncLogs] = await Promise.all([
    listManagedUsers(),
    listUserSyncLogs(),
  ]);
  return Response.json({ users, syncLogs });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  let input: ReturnType<typeof validateNewUser>;
  try {
    input = validateNewUser(payload);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  let user: ManagedUser;
  try {
    user = await createManagedUser(randomUUID(), input);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "That employee number is already in use." },
        { status: 409 },
      );
    }
    throw error;
  }

  const results = await syncUserToDevices(user, "create");
  return Response.json({ user, results }, { status: 201 });
}
