import { getManagedUser } from "@/lib/hik/user-store";
import { syncUserToDevices } from "@/lib/hik/user-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/users/[id]/sync">,
) {
  const { id } = await context.params;
  const user = await getManagedUser(id);
  if (!user) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  const results = await syncUserToDevices(user, "retry");
  return Response.json({ results });
}
