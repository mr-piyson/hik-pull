import {
  Activity,
  ArrowDownUp,
  ArrowRight,
  CircleAlert,
  Users,
  Webcam,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { UserSyncLogEntry } from "@/lib/hik/user-types";

const SECTIONS = [
  {
    href: "/people",
    title: "People",
    description: "Manage identity records, cards, and face photos.",
    icon: Users,
  },
  {
    href: "/devices",
    title: "Devices",
    description: "Configure terminals and check connectivity.",
    icon: Webcam,
  },
  {
    href: "/access-events",
    title: "Access events",
    description: "Review event history and follow live terminal streams.",
    icon: Activity,
  },
  {
    href: "/sync-history",
    title: "Sync audit",
    description: "Inspect device updates and retry failed user syncs.",
    icon: ArrowDownUp,
  },
] as const;

export function Dashboard({
  deviceCount,
  userCount,
  eventCount,
  failedSyncCount,
  recentSyncs,
}: {
  deviceCount: number;
  userCount: number;
  eventCount: number;
  failedSyncCount: number;
  recentSyncs: UserSyncLogEntry[];
}) {
  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="flex flex-col justify-between gap-5 rounded-xl bg-primary p-6 text-primary-foreground sm:flex-row sm:items-end sm:p-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium opacity-75">Operations overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Access management, in sync.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 opacity-80">
            Manage people centrally, distribute access identity to Hikvision
            terminals, and keep a clear record of device activity.
          </p>
        </div>
        <Button
          variant="secondary"
          render={<Link href="/people" />}
          className="w-fit"
        >
          Manage people
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </section>

      <section
        aria-label="Workspace metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Metric label="Configured devices" value={deviceCount} icon={Webcam} />
        <Metric label="Master users" value={userCount} icon={Users} />
        <Metric
          label="Stored access events"
          value={eventCount}
          icon={Activity}
        />
        <Metric
          label="Failed sync attempts"
          value={failedSyncCount}
          icon={CircleAlert}
          warning={failedSyncCount > 0}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Workspace</h2>
            <p className="text-sm text-muted-foreground">
              Go directly to an entity or operational view.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SECTIONS.map(({ href, title, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
              >
                <div className="mb-4 grid size-9 place-items-center rounded-lg bg-muted text-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
                  Open section
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Recent sync activity</CardTitle>
              <CardDescription>
                Latest user updates across configured terminals.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/sync-history" />}
            >
              View all
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentSyncs.length > 0 ? (
              <ul className="divide-y">
                {recentSyncs.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {entry.userName}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {entry.employeeNo}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.operation} · {entry.deviceLabel}
                      </p>
                    </div>
                    <Badge
                      variant={
                        entry.status === "success" ? "secondary" : "destructive"
                      }
                    >
                      {entry.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="min-h-48 border">
                <EmptyHeader>
                  <EmptyTitle>No sync activity yet</EmptyTitle>
                  <EmptyDescription>
                    User changes and device sync results will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  warning = false,
}: {
  label: string;
  value: number;
  icon: typeof Webcam;
  warning?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon
          className={
            warning ? "size-4 text-destructive" : "size-4 text-muted-foreground"
          }
          aria-hidden="true"
        />
      </CardHeader>
      <CardContent>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardContent>
    </Card>
  );
}
