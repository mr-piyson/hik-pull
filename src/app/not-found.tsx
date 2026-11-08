import { Compass, Home } from "lucide-react";
import { PageBody } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageBody>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/8">
        <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Compass aria-hidden="true" className="size-6" />
        </span>
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            404
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Nothing found here
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            The record you opened may have been deleted, or the address is
            wrong.
          </p>
        </div>
        <ButtonLink href="/">
          <Home data-icon="inline-start" aria-hidden="true" />
          Back to overview
        </ButtonLink>
      </div>
    </PageBody>
  );
}
