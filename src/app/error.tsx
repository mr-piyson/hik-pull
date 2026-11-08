"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageBody>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/8">
        <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert aria-hidden="true" className="size-6" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            This view could not load. Retrying usually fixes a transient device
            or database error.
          </p>
          {error.digest ? (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
        <Button onClick={reset}>
          <RotateCcw data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </PageBody>
  );
}
