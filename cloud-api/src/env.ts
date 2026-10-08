export type TokenSeed = {
  name: string;
  token: string;
  organizationId: string;
};

export type Env = {
  hostname: string;
  port: number;
  databaseUrl: string;
  mysqlTls: boolean;
  /** MySQL 8 caching_sha2_password over plain TCP; only for trusted networks. */
  allowPublicKeyRetrieval: boolean;
  apiTokens: TokenSeed[];
  autoMigrate: boolean;
};

function optional(name: string): string | undefined {
  const value = Bun.env[name]?.trim();
  return value ? value : undefined;
}

function requiredUrl(): string {
  const direct = optional("DATABASE_URL") ?? optional("MYSQL_URL");
  if (direct) {
    return direct;
  }

  const host = optional("MYSQL_HOST") ?? optional("MYSQLHOST");
  const database = optional("MYSQL_DATABASE") ?? optional("MYSQLDATABASE");
  if (!host || !database) {
    throw new Error(
      "Set DATABASE_URL (mysql://user:pass@host:3306/db) or MYSQL_HOST/MYSQL_DATABASE.",
    );
  }
  const user = optional("MYSQL_USER") ?? optional("MYSQLUSER") ?? "";
  const password = optional("MYSQL_PASSWORD") ?? optional("MYSQLPASSWORD");
  const port = optional("MYSQL_PORT") ?? optional("MYSQLPORT") ?? "3306";
  const credentials = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  return `mysql://${credentials}@${host}:${port}/${database}`;
}

/**
 * Tokens are "name:token" or "name:token:organizationId". The name is the part
 * before the first colon; the token is everything after it (tokens may contain
 * colons), and the trailing ":organizationId" is optional and defaults to
 * "default".
 */
function parseTokens(raw: string | undefined): TokenSeed[] {
  if (!raw) {
    return [];
  }
  const seeds: TokenSeed[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      throw new Error(
        `API_TOKENS entry "${trimmed}" must look like name:token or name:token:organizationId.`,
      );
    }
    const name = trimmed.slice(0, colon).trim();
    let rest = trimmed.slice(colon + 1).trim();
    let organizationId = "default";
    const lastColon = rest.lastIndexOf(":");
    // A third segment is only treated as the organization when it holds no
    // whitespace; this keeps generated tokens (which are colon-free) intact.
    if (lastColon > 0) {
      const maybeOrg = rest.slice(lastColon + 1).trim();
      if (maybeOrg && !/\s/.test(maybeOrg)) {
        organizationId = maybeOrg;
        rest = rest.slice(0, lastColon).trim();
      }
    }
    if (!name || !rest) {
      throw new Error(
        `API_TOKENS entry "${trimmed}" is missing a name or token.`,
      );
    }
    seeds.push({ name, token: rest, organizationId });
  }
  return seeds;
}

export function loadEnv(): Env {
  const port = Number(optional("PORT") ?? "8787");
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`PORT must be a valid port number, received "${port}".`);
  }

  return {
    hostname: optional("HOSTNAME") ?? "0.0.0.0",
    port,
    databaseUrl: requiredUrl(),
    mysqlTls: /^(1|true|yes|require|required)$/i.test(
      optional("MYSQL_TLS") ?? "",
    ),
    allowPublicKeyRetrieval: /^(1|true|yes)$/i.test(
      optional("MYSQL_ALLOW_PUBLIC_KEY_RETRIEVAL") ?? "",
    ),
    apiTokens: parseTokens(optional("API_TOKENS")),
    autoMigrate: !/^(0|false|no)$/i.test(optional("AUTO_MIGRATE") ?? ""),
  };
}

export const env = loadEnv();
