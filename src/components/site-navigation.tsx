"use client";

import {
  Activity,
  ArrowDownUp,
  CalendarClock,
  LayoutDashboard,
  Settings2,
  Users,
  Webcam,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/people", label: "People", icon: Users },
  { href: "/devices", label: "Devices", icon: Webcam },
  { href: "/access-events", label: "Access events", icon: Activity },
  { href: "/attendance", label: "Attendance", icon: CalendarClock },
  { href: "/sync-history", label: "Sync history", icon: ArrowDownUp },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function SiteNavigation() {
  const pathname = usePathname();

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
          <span className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="size-2 rounded-full bg-primary" />
            Local network
          </span>
        </div>

        <nav
          aria-label="Main navigation"
          className="-mx-1 flex gap-1 overflow-x-auto pb-0.5"
        >
          {LINKS.map(({ href, label, icon: Icon }) => {
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
