import Link from "next/link";
import type { UserSyncLogEntry } from "@/lib/hik/user-types";

const SECTIONS = [
  {
    href: "/people",
    marker: "01",
    title: "Master users",
    description: "Manage identity records, cards, and face photos.",
  },
  {
    href: "/devices",
    marker: "02",
    title: "Hikvision devices",
    description: "Configure terminals and check connectivity.",
  },
  {
    href: "/access-events",
    marker: "03",
    title: "Access events",
    description: "Review event history and follow a live terminal stream.",
  },
  {
    href: "/sync-history",
    marker: "04",
    title: "Sync audit",
    description: "Inspect per-device updates and retry failed user syncs.",
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
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl bg-zinc-950 px-6 py-8 text-white sm:px-8 sm:py-10 dark:bg-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
          Operations overview
        </p>
        <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Access management, in sync.
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Manage people centrally, distribute their access identity to
              Hikvision terminals, and keep a clear record of device activity.
            </p>
          </div>
          <Link
            href="/people"
            className="inline-flex w-fit items-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Manage people
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Configured devices" value={deviceCount} marker="DV" />
        <Metric label="Master users" value={userCount} marker="US" />
        <Metric label="Stored access events" value={eventCount} marker="EV" />
        <Metric
          label="Failed sync attempts"
          value={failedSyncCount}
          marker="!"
          warning={failedSyncCount > 0}
        />
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold tracking-tight">Workspace</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Go directly to an entity or operational view.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-800"
            >
              <span className="font-mono text-xs text-blue-700 dark:text-blue-300">
                {section.marker}
              </span>
              <h3 className="mt-4 font-semibold">{section.title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {section.description}
              </p>
              <span className="mt-4 inline-block text-sm font-medium text-blue-700 group-hover:underline dark:text-blue-300">
                Open section →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold">Recent sync activity</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Latest device updates across the master directory.
            </p>
          </div>
          <Link
            href="/sync-history"
            className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
          >
            View all
          </Link>
        </header>
        {recentSyncs.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {recentSyncs.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {entry.userName}{" "}
                    <span className="font-mono text-xs text-zinc-500">
                      {entry.employeeNo}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {entry.operation} · {entry.deviceLabel}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    entry.status === "success"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                  }`}
                >
                  {entry.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-sm text-zinc-500 dark:text-zinc-400">
            No user sync activity yet.
          </p>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  marker,
  warning = false,
}: {
  label: string;
  value: number;
  marker: string;
  warning?: boolean;
}) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </p>
        <span
          className={`grid size-8 place-items-center rounded-lg font-mono text-[10px] font-bold ${
            warning
              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {marker}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}
