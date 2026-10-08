"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview", marker: "OV" },
  { href: "/devices", label: "Devices", marker: "DV" },
  { href: "/people", label: "People", marker: "US" },
  { href: "/access-events", label: "Access events", marker: "EV" },
  { href: "/attendance", label: "Attendance", marker: "AT" },
  { href: "/sync-history", label: "Sync history", marker: "SY" },
  { href: "/settings", label: "Settings", marker: "ST" },
] as const;

export function SiteNavigation() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-blue-600 text-xs font-bold tracking-wide text-white">
            HK
          </div>
          <div>
            <Link href="/" className="text-base font-semibold tracking-tight">
              Hikvision Access Manager
            </Link>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Users · Devices · Audit
            </p>
          </div>
          <span className="ml-auto hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 sm:inline-flex dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            Local network
          </span>
        </div>

        <nav
          aria-label="Main navigation"
          className="flex gap-1 overflow-x-auto border-t border-zinc-100 pt-3 dark:border-zinc-800"
        >
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">
                  {link.marker}
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
