export function PageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl bg-card ring-1 ring-foreground/8"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-card ring-1 ring-foreground/8" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}
