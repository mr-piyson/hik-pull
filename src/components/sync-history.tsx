import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserSyncLogEntry } from "@/lib/hik/user-types";

export function SyncHistory({ entries }: { entries: UserSyncLogEntry[] }) {
  const successful = entries.filter(
    (entry) => entry.status === "success",
  ).length;
  const failed = entries.length - successful;

  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Audit</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Sync history
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Per-device outcomes for user and face-photo changes, including
          failures and retries.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Recent attempts" value={entries.length} />
        <Summary label="Successful" value={successful} />
        <Summary
          label="Needs attention"
          value={failed}
          destructive={failed > 0}
        />
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Device updates</CardTitle>
          <CardDescription>
            Latest user and photo synchronization results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <time dateTime={entry.createdAt}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </time>
                    </TableCell>
                    <TableCell>
                      <span className="block font-medium">
                        {entry.userName}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {entry.employeeNo}
                      </span>
                    </TableCell>
                    <TableCell>{entry.deviceLabel}</TableCell>
                    <TableCell className="capitalize">
                      {entry.operation}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.status === "success"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-xs text-muted-foreground">
                      {entry.message ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-48 border">
              <EmptyHeader>
                <EmptyTitle>No sync attempts recorded</EmptyTitle>
                <EmptyDescription>
                  Changes synced to devices will be listed here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Summary({
  label,
  value,
  destructive = false,
}: {
  label: string;
  value: number;
  destructive?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardTitle
          className={destructive ? "text-2xl text-destructive" : "text-2xl"}
        >
          {value}
        </CardTitle>
      </CardContent>
    </Card>
  );
}
