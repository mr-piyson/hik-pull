import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { prisma } from "@/lib/hik/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin({ adminRoles: ["admin"], defaultRole: "user" }),
    nextCookies(),
  ],
  user: {
    modelName: "AuthUser",
  },
  session: {
    modelName: "AuthSession",
  },
  account: {
    modelName: "AuthAccount",
  },
  verification: {
    modelName: "AuthVerification",
  },
  databaseHooks: {
    user: {
      create: {
        before: async (_user, ctx) => {
          const count = await prisma.authUser.count();
          let session = null;
          try {
            session = await auth.api.getSession({
              headers: ctx?.headers ?? new Headers(),
            });
          } catch {
            session = null;
          }
          if (!session && count > 0) {
            throw new APIError("BAD_REQUEST", {
              message: "Registration is closed.",
            });
          }
          if (count === 0) {
            return { data: { role: "admin" } };
          }
          return;
        },
      },
    },
  },
});
