import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "primary"
  | "neutral";

const TONE: Record<StatusTone, { pill: string; dot: string }> = {
  success: {
    pill: "bg-success/12 text-success ring-success/25",
    dot: "bg-success",
  },
  warning: {
    pill: "bg-warning/15 text-warning-foreground ring-warning/30 dark:text-warning",
    dot: "bg-warning",
  },
  danger: {
    pill: "bg-destructive/10 text-destructive ring-destructive/25",
    dot: "bg-destructive",
  },
  info: { pill: "bg-info/12 text-info ring-info/25", dot: "bg-info" },
  primary: {
    pill: "bg-primary/10 text-primary ring-primary/20",
    dot: "bg-primary",
  },
  neutral: {
    pill: "bg-muted text-muted-foreground ring-border",
    dot: "bg-muted-foreground/60",
  },
};

export function StatusPill({
  tone = "neutral",
  children,
  icon: Icon,
  pulse = false,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  icon?: LucideIcon;
  pulse?: boolean;
  className?: string;
}) {
  const styles = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] w-fit items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        styles.pill,
        className,
      )}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="size-3" />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            styles.dot,
            pulse && "pulse-dot",
          )}
        />
      )}
      {children}
    </span>
  );
}

export function StatusDot({
  tone = "neutral",
  pulse = false,
  label,
  className,
}: {
  tone?: StatusTone;
  pulse?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          TONE[tone].dot,
          pulse && "pulse-dot",
        )}
      />
      {label ? (
        <span className="text-xs text-muted-foreground">{label}</span>
      ) : null}
    </span>
  );
}
