import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const TONE_TILE: Record<StatTone, string> = {
  primary: "bg-primary/10 text-primary ring-primary/15",
  success: "bg-success/10 text-success ring-success/20",
  warning:
    "bg-warning/15 text-warning-foreground ring-warning/25 dark:text-warning",
  danger: "bg-destructive/10 text-destructive ring-destructive/20",
  info: "bg-info/10 text-info ring-info/20",
  neutral: "bg-muted text-muted-foreground ring-border",
};

const TONE_VALUE: Record<StatTone, string> = {
  primary: "",
  success: "",
  warning: "text-warning-foreground dark:text-warning",
  danger: "text-destructive",
  info: "",
  neutral: "",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  footer,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-xl bg-card p-4 ring-1 ring-foreground/8 transition-shadow hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.18)] sm:p-5",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg ring-1",
              TONE_TILE[tone],
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "font-mono text-[1.7rem] leading-none font-semibold tracking-tight tabular-nums",
          TONE_VALUE[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
      ) : null}
      {footer}
    </div>
  );
}
