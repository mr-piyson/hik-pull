"use client";

import {
  Activity,
  ArrowDownUp,
  CalendarClock,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  Webcam,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "hik-sidebar-collapsed";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/access-events", label: "Access events", icon: Activity },
      { href: "/attendance", label: "Attendance", icon: CalendarClock },
    ],
  },
  {
    title: "Directory",
    items: [
      { href: "/people", label: "People", icon: Users },
      { href: "/devices", label: "Devices", icon: Webcam },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/sync-history", label: "Sync history", icon: ArrowDownUp },
      { href: "/settings", label: "Settings", icon: Settings2 },
      { href: "/users", label: "Users", icon: UserCog, adminOnly: true },
    ],
  },
];

const AUTH_ROUTES = ["/sign-in", "/sign-up", "/auth-error"];

const PAGE_LABELS: Record<string, string> = {
  "": "Overview",
  people: "People",
  devices: "Devices",
  "access-events": "Access events",
  attendance: "Attendance",
  "sync-history": "Sync history",
  settings: "Settings",
  users: "Users",
};

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function breadcrumb(pathname: string): { label: string; href?: string }[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [{ label: "Overview" }];
  }

  const crumbs: { label: string; href?: string }[] = [];
  let href = "";
  for (const segment of segments) {
    href += `/${segment}`;
    const known = PAGE_LABELS[segment];
    if (known) {
      crumbs.push({ label: known, href: href === pathname ? undefined : href });
      continue;
    }
    if (segment === "new") {
      crumbs.push({ label: "New" });
      continue;
    }
    if (segment === "edit") {
      crumbs.push({ label: "Edit" });
      continue;
    }
    crumbs.push({ label: "Details" });
  }
  return crumbs;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: navigation state must reset on every route change.
  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (isAuthRoute(pathname)) {
    return <>{children}</>;
  }

  if (!isPending && !session) {
    return null;
  }

  const isAdmin = session?.user.role === "admin";
  const displayName =
    session?.user.name || session?.user.email || "Loading account";
  const crumbs = breadcrumb(pathname);
  const currentLabel = crumbs[crumbs.length - 1]?.label ?? "Overview";

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  }));

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  const sidebarBody = (onNavigate?: () => void) => (
    <>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4",
          collapsed && "lg:justify-center lg:px-0",
        )}
      >
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-info text-primary-foreground shadow-sm">
            <ShieldCheck aria-hidden="true" className="size-[1.15rem]" />
          </span>
          <span className={cn("min-w-0", collapsed && "lg:hidden")}>
            <span className="block truncate text-sm font-semibold tracking-tight">
              Hikvision
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              Access manager
            </span>
          </span>
        </Link>
      </div>

      <nav
        aria-label="Main navigation"
        className="scrollbar-subtle flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5"
      >
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <p
              className={cn(
                "px-2 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/70 uppercase",
                collapsed && "lg:hidden",
              )}
            >
              {group.title}
            </p>
            {collapsed ? (
              <div className="mb-1 hidden h-px bg-sidebar-border lg:block" />
            ) : null}
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors outline-none hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/40",
                    active &&
                      "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
                    collapsed && "lg:justify-center lg:px-0",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
                    />
                  ) : null}
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-[1.05rem] shrink-0 transition-colors",
                      active
                        ? "text-primary"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span className={cn("truncate", collapsed && "lg:hidden")}>
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t border-sidebar-border p-3">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl bg-sidebar-accent/50 p-2",
            collapsed && "lg:justify-center lg:bg-transparent lg:p-0",
          )}
        >
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary ring-1 ring-primary/20",
              isPending && "animate-pulse text-transparent",
            )}
          >
            {initials(displayName)}
          </span>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate text-[13px] font-medium leading-tight">
              {isPending ? "Loading…" : displayName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {isPending ? "" : isAdmin ? "Administrator" : "Operator"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            title="Sign out"
            aria-label="Sign out"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-background hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/40",
              collapsed && "lg:hidden",
            )}
          >
            <LogOut aria-hidden="true" className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "hidden h-8 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 lg:flex",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-4" />
          )}
          <span className={cn(collapsed && "lg:hidden")}>Collapse</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-svh bg-background">
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-20" : "w-[17rem]",
        )}
      >
        {sidebarBody()}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in-0"
          />
          <div className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl animate-in slide-in-from-left-4 duration-200">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute top-3.5 right-3 z-10 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
            {sidebarBody(() => setMobileOpen(false))}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-h-svh flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-20" : "lg:pl-[17rem]",
        )}
      >
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>

            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold tracking-tight">
                {currentLabel}
              </h1>
              <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                {crumbs.map((crumb, index) => (
                  <span
                    key={`${crumb.label}-${index}`}
                    className="flex items-center gap-1"
                  >
                    {index > 0 ? (
                      <ChevronRight aria-hidden="true" className="size-3" />
                    ) : null}
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="transition-colors hover:text-foreground"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current="page">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </div>
            </nav>

            <div className="flex items-center gap-1.5">
              <ButtonLink
                href="/people/new"
                size="sm"
                className="hidden sm:inline-flex"
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                New person
              </ButtonLink>
              <ThemeToggle />
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="grid size-9 place-items-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary ring-1 ring-primary/20 transition-colors outline-none hover:bg-primary/18 focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  {initials(displayName)}
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute top-11 right-0 z-50 w-60 origin-top-right overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
                  >
                    <div className="flex flex-col gap-0.5 px-2.5 py-2">
                      <span className="truncate text-sm font-medium">
                        {displayName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {session?.user.email ?? ""}
                      </span>
                      <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-primary uppercase">
                        {isAdmin ? "Admin" : "Operator"}
                      </span>
                    </div>
                    <div className="my-1 h-px bg-border" />
                    <Link
                      href="/settings"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Settings2 aria-hidden="true" className="size-4" />
                      Settings
                    </Link>
                    {isAdmin ? (
                      <Link
                        href="/users"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <UserCog aria-hidden="true" className="size-4" />
                        Manage users
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleSignOut()}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut aria-hidden="true" className="size-4" />
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main
          id="workspace-content"
          className="flex w-full flex-1 flex-col pb-16"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
