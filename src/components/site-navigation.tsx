"use client";

import {
  Activity,
  ArrowDownUp,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Settings2,
  UserCog,
  Users,
  Webcam,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";

const BASE_LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/people", label: "People", icon: Users },
  { href: "/devices", label: "Devices", icon: Webcam },
  { href: "/access-events", label: "Access events", icon: Activity },
  { href: "/attendance", label: "Attendance", icon: CalendarClock },
  { href: "/sync-history", label: "Sync history", icon: ArrowDownUp },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function SiteNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  const handleSignOut = async () => {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  if (isPending) return null;
  if (!session) return null;
  if (
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    pathname === "/auth-error" ||
    pathname.startsWith("/auth-error/")
  ) {
    return null;
  }

  const links =
    session.user.role === "admin"
      ? [...BASE_LINKS, { href: "/users", label: "Users", icon: UserCog }]
      : BASE_LINKS;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Webcam aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <Link
              href="/"
              className="truncate text-sm font-semibold tracking-tight"
            >
              Hikvision Access Manager
            </Link>
            <p className="text-xs text-muted-foreground">
              Access operations workspace
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {session.user.name || session.user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleSignOut()}
              className="shrink-0"
            >
              <LogOut data-icon="inline-start" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>

        <nav
          aria-label="Main navigation"
          className="-mx-1 flex gap-1 overflow-x-auto pb-0.5"
        >
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href}>
                <Button
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  aria-current={active ? "page" : undefined}
                  className="shrink-0"
                >
                  <Icon data-icon="inline-start" aria-hidden="true" />
                  {label}
                </Button>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
