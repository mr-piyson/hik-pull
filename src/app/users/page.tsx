"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AccountManagement } from "@/components/account-management";
import { authClient } from "@/lib/auth-client";

export default function UsersPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    if (session.user.role !== "admin") {
      router.replace("/");
    }
  }, [session, isPending, router]);

  if (isPending || !session || session.user.role !== "admin") {
    return null;
  }

  return <AccountManagement />;
}
