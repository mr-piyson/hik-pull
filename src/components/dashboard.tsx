import {
  Activity,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleAlert,
  Plus,
  Radio,
  Users,
  Webcam,
} from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { PageBody, PageHeader, SectionHeading } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { SystemPulse } from "@/components/system-pulse";
import { ButtonLink } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatNumber } from "@/lib/format";
import type { UserSyncLogEntry } from "@/lib/hik/user-types";

const QUICK_LINKS = [
  {
    href: "/people",
    title: "Directory",
    description: "People, cards and face photos",
    icon: Users,
  },
  {
    href: "/devices",
    title: "Terminals",
    description: "Connectivity and credentials",
    icon: Webcam,
  },
  {
    href: "/access-events",
    title: "Live events",
    description: "Follow a terminal in real time",
    icon: Radio,
  },
  {
    href: "/attendance",
    title: "Attendance",
    description: "Authentications with cloud state",
    icon: CalendarClock,
  },
] as const;

export function Dashboard({
  deviceCount,
  onlineDevices,
  userCount,
  eventCount,
  eventsToday,
  failedSyncCount,
  recentSyncs,
}: {
  deviceCount: number;
  onlineDevices: number;
  userCount: number;
  eventCount: number;
  eventsToday: number;
  failedSyncCount: number;
  recentSyncs: UserSyncLogEntry[];
}) {
  const needsSetup = deviceCount === 0;

  return (
    <PageBody>
      <PageHeader
        eyebrow="Operations"
        title="Access overview"
        description="One workspace for identity, terminals and the events they record. Changes flow from the master directory to every configured device."
        actions={
          <>
            <ButtonLink href="/access-events" variant="outline" size="default">
              <Radio data-icon="inline-start" aria-hidden="true" />
              Live events
            </ButtonLink>
            <ButtonLink href="/people/new" size="default">
              <Plus data-icon="inline-start" aria-hidden="true" />
              Add person
            </ButtonLink>
          </>
        }
      />

      <section
        aria-label="Workspace metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Configured devices"
          value={formatNumber(deviceCount)}
          hint={
            deviceCount === 0
              ? "No terminals registered yet"
              : `${onlineDevices} online · ${deviceCount - onlineDevices} unreachable`
          }
          icon={Webcam}
          tone={deviceCount === 0 ? "warning" : "primary"}
        />
        <StatCard
          label="Master people"
          value={formatNumber(userCount)}
          hint="Identities synced across terminals"
          icon={Users}
          tone="info"
        />
        <StatCard
          label="Access events stored"
          value={formatNumber(eventCount)}
          hint={`${formatNumber(eventsToday)} recorded today`}
          icon={Activity}
          tone="success"
        />
        <StatCard
          label="Sync issues"
          value={formatNumber(failedSyncCount)}
          hint={
            failedSyncCount === 0
              ? "All device updates confirmed"
              : "Review and retry from sync history"
          }
          icon={CircleAlert}
          tone={failedSyncCount > 0 ? "danger" : "success"}
        />
      </section>

      {needsSetup ? <SetupChecklist hasPeople={userCount > 0} /> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <SectionHeading
            title="Recent sync activity"
            description="Latest identity updates pushed to terminals"
            icon={ArrowDownUp}
            action={
              <ButtonLink href="/sync-history" variant="ghost" size="sm">
                View all
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </ButtonLink>
            }
          />

          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8">
            {recentSyncs.length > 0 ? (
              <ul className="divide-y">
                {recentSyncs.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-nowrap"
                  >
                    <Avatar name={entry.userName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.userName}
                        <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
                          {entry.employeeNo}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="capitalize">{entry.operation}</span>
                        {" · "}
                        {entry.deviceLabel}
                      </p>
                    </div>
                    <StatusPill
                      tone={entry.status === "success" ? "success" : "danger"}
                    >
                      {entry.status === "success" ? "Synced" : "Failed"}
                    </StatusPill>
                    <RelativeTime
                      value={entry.createdAt}
                      className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="border-0 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ArrowDownUp aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No sync activity yet</EmptyTitle>
                  <EmptyDescription>
                    Saving a person pushes the change to every terminal. Results
                    will appear here.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <ButtonLink href="/people/new" size="sm" variant="outline">
                    Add the first person
                  </ButtonLink>
                </EmptyContent>
              </Empty>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {QUICK_LINKS.map(({ href, title, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/8 transition-all hover:ring-primary/25"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    {title}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                    />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <SectionHeading
            title="Live status"
            description="Collector, queue and terminals"
            icon={Activity}
            action={
              <ButtonLink href="/settings" variant="ghost" size="sm">
                Configure
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </ButtonLink>
            }
          />
          <SystemPulse showHeader={false} />
        </div>
      </section>
    </PageBody>
  );
}

function SetupChecklist({ hasPeople }: { hasPeople: boolean }) {
  const steps = [
    {
      label: "Register a terminal",
      description: "Host, credentials and attendance direction.",
      href: "/devices/new",
      done: false,
    },
    {
      label: "Add people to the directory",
      description: "Employee number, cards and an optional face photo.",
      href: "/people/new",
      done: hasPeople,
    },
    {
      label: "Verify live collection",
      description: "Open a terminal stream and trigger an authentication.",
      href: "/access-events",
      done: false,
    },
  ];

  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Finish setting up your workspace
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Three short steps until events start landing here.
          </p>
        </div>
        <StatusPill tone="warning">Setup incomplete</StatusPill>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className="group flex h-full flex-col gap-1.5 rounded-lg border border-dashed p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="flex items-center gap-2">
                <span
                  className={
                    step.done
                      ? "grid size-5 place-items-center rounded-full bg-success/15 text-[10px] font-semibold text-success"
                      : "grid size-5 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                  }
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <span className="text-[13px] font-medium">{step.label}</span>
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {step.description}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
