import { UserManagement } from "@/components/user-management";

export default function NewPersonPage() {
  return <UserManagement initialUsers={[]} mode="create" />;
}
