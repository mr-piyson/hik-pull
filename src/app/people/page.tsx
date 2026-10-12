import { UserManagement } from "@/components/user-management";
import { listManagedUsers } from "@/lib/hik/user-store";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const users = await listManagedUsers();
  return <UserManagement initialUsers={users} mode="directory" />;
}
