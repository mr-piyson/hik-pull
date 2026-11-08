import { Eye, EyeOff, Fingerprint, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

const HIGHLIGHTS = [
  {
    icon: Radio,
    title: "Live terminal streams",
    description:
      "One upstream connection per device, fanned out to every open browser.",
  },
  {
    icon: Fingerprint,
    title: "Central identity",
    description:
      "Cards, faces and fingerprints provisioned to every terminal at once.",
  },
  {
    icon: ShieldCheck,
    title: "Durable by design",
    description:
      "Events land in SQLite first, then sync to the cloud with a retry queue.",
  },
] as const;

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside className="bg-brand-wash relative hidden flex-col justify-between overflow-hidden border-r bg-sidebar p-10 lg:flex">
        <div
          aria-hidden="true"
          className="bg-grid pointer-events-none absolute inset-0 opacity-40"
        />
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-info text-primary-foreground shadow-sm">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">
                Hikvision
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Access manager
              </span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            Access operations, without spreadsheets.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A self-hosted control plane for Hikvision terminals: identity,
            credentials, live events and attendance in one place.
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {HIGHLIGHTS.map(
              ({
                icon: Icon,
                title: itemTitle,
                description: itemDescription,
              }) => (
                <li key={itemTitle} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-background/70 text-primary ring-1 ring-foreground/8">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-medium">
                      {itemTitle}
                    </span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {itemDescription}
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>

        <p className="relative text-[11px] text-muted-foreground">
          Self-hosted · Runs on the same network as your terminals
        </p>
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2.5 lg:hidden"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-info text-primary-foreground">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Hikvision Access Manager
            </span>
          </Link>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>

          {children}

          {footer ? <div className="mt-6">{footer}</div> : null}

          <p className="mt-10 text-center text-[11px] text-muted-foreground">
            Restricted to trusted operators on this network.
          </p>
        </div>
      </main>
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  visible,
  onToggle,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="h-9 pr-9"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-3.5" />
        ) : (
          <Eye aria-hidden="true" className="size-3.5" />
        )}
      </button>
    </div>
  );
}
