import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-6 text-[9px]",
  sm: "size-8 text-[10px]",
  md: "size-10 text-[11px]",
  lg: "size-14 text-sm",
} as const;

const GRADIENTS = [
  "from-indigo-500/85 to-violet-500/85",
  "from-sky-500/85 to-cyan-500/85",
  "from-emerald-500/85 to-teal-500/85",
  "from-amber-500/85 to-orange-500/85",
  "from-rose-500/85 to-pink-500/85",
  "from-fuchsia-500/85 to-purple-500/85",
] as const;

function gradientFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Avatar({
  name,
  src,
  size = "sm",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={56}
        height={56}
        unoptimized
        className={cn(
          "shrink-0 rounded-full bg-muted object-cover ring-1 ring-foreground/10",
          SIZES[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-foreground/10",
        gradientFor(name),
        SIZES[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
