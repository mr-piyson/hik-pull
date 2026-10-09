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
 * Tokens are "name:token" or "name:token:organizationId", comma-separated.
 * Parsing is exact: each entry must have exactly two or three colon-separated
 * segments, so a token can never be split ambiguously. Tokens therefore must
 * not contain colons (generated tokens are hex, so this always holds).
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
    const parts = trimmed.split(":").map((part) => part.trim());
    if (parts.length !== 2 && parts.length !== 3) {
      throw new Error(
        `API_TOKENS entry "${trimmed}" must have exactly two or three colon-separated segments: name:token[:organizationId]. Tokens must not contain colons.`,
      );
    }
    const [name, token, organizationId = "default"] = parts;
    if (!name || !token) {
      throw new Error(
        `API_TOKENS entry "${trimmed}" is missing a name or token.`,
      );
    }
    if (parts.length === 3 && !organizationId) {
      throw new Error(
        `API_TOKENS entry "${trimmed}" has an empty organizationId.`,
      );
    }
    seeds.push({ name, token, organizationId });
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
