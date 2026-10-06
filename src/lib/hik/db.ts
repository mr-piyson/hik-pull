import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Default matches `prisma7.config.ts`, so the app runs with no `.env` at all:
 * the database is a single SQLite file in the gitignored `.data/` directory.
 */
const DEFAULT_URL = "file:./.data/hik.db";

/**
 * Anchored on `globalThis` deliberately.
 *
 * Next.js dev-mode hot reload re-evaluates route modules, and a second
 * `PrismaClient` means a second SQLite connection to the same file — which
 * serialises writes against each other and eventually trips `SQLITE_BUSY`.
 */
type PrismaGlobal = typeof globalThis & { __hikPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

const scope = globalThis as PrismaGlobal;
scope.__hikPrisma ??= createClient();

export const prisma = scope.__hikPrisma;
