import { SQL } from "bun";
import { env } from "./env";

/**
 * Native Bun MySQL client (no npm driver). The adapter is auto-detected from
 * the `mysql://` (or `mysql2://`) connection string.
 */
const options: { tls?: boolean; allowPublicKeyRetrieval?: boolean } = {};
if (env.mysqlTls) {
  options.tls = true;
}
if (env.allowPublicKeyRetrieval) {
  options.allowPublicKeyRetrieval = true;
}

export const db = new SQL(env.databaseUrl, options);

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
