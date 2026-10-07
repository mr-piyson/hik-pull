import { initTRPC } from "@trpc/server";

export type TRPCContext = {
  signal: AbortSignal;
};

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
