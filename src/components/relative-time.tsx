"use client";

import { useEffect, useState } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";

/**
 * Renders a live "3m ago" label. The first client render matches the server
 * (absolute text), then the relative label takes over after mount so SSR and
 * hydration never disagree.
 */
export function RelativeTime({
  value,
  className,
  refreshMs = 30_000,
}: {
  value: string | null | undefined;
  className?: string;
  refreshMs?: number;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(formatRelative(value));
    update();
    const interval = setInterval(update, refreshMs);
    return () => clearInterval(interval);
  }, [value, refreshMs]);

  return (
    <time
      dateTime={value ?? undefined}
      title={value ? formatDateTime(value) : undefined}
      className={className}
    >
      {label ?? (value ? formatDateTime(value) : "never")}
    </time>
  );
}
