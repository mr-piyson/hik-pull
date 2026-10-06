import type { UserSyncLogEntry } from "@/lib/hik/user-types";

export function SyncHistory({ entries }: { entries: UserSyncLogEntry[] }) {
  const successful = entries.filter(
    (entry) => entry.status === "success",
  ).length;
  const failed = entries.length - successful;

  return (
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
          Audit
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Sync history
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Per-device outcomes for user and face-photo changes, including
          failures and retries.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Recent attempts" value={entries.length} />
        <Summary label="Successful" value={successful} tone="good" />
        <Summary label="Needs attention" value={failed} tone="bad" />
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-4 py-3">
                  When
                </th>
                <th scope="col" className="px-4 py-3">
                  User
                </th>
                <th scope="col" className="px-4 py-3">
                  Device
                </th>
                <th scope="col" className="px-4 py-3">
                  Operation
                </th>
                <th scope="col" className="px-4 py-3">
                  Result
                </th>
                <th scope="col" className="px-4 py-3">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-t border-zinc-200 align-top dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                    <time dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{entry.userName}</span>
                    <span className="font-mono text-xs text-zinc-500">
                      {entry.employeeNo}
                    </span>
                  </td>
                  <td className="px-4 py-3">{entry.deviceLabel}</td>
                  <td className="px-4 py-3 capitalize">{entry.operation}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        entry.status === "success"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {entry.message ?? "—"}
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    No sync attempts have been recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Summary({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          tone === "good"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "bad"
              ? "text-red-700 dark:text-red-300"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
