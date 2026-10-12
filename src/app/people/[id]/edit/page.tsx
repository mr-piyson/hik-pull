import { notFound } from "next/navigation";
import { UserManagement } from "@/components/user-management";
import { getManagedUser } from "@/lib/hik/user-store";

export const dynamic = "force-dynamic";

export default async function EditPersonPage({
  params,
}: PageProps<"/people/[id]/edit">) {
  const { id } = await params;
  const user = await getManagedUser(id);

  if (!user) {
    notFound();
  }

  return (
    <UserManagement initialUsers={[user]} initialUser={user} mode="edit" />
  );
}
