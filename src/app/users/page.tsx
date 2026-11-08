"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AccountManagement } from "@/components/account-management";
import { PageBody } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
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

  if (isPending) {
    return (
      <PageBody>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </PageBody>
    );
  }

  if (!session || session.user.role !== "admin") {
    return null;
  }

  return <AccountManagement />;
}
