import { sha256Hex } from "./crypto";
import { db } from "./db";
import type { Installation } from "./types";

type InstallationRow = {
  id: string;
  name: string;
  organization_id: string;
  active: number;
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve the caller from its bearer token. Tokens are stored as SHA-256
 * hashes, so a leaked database cannot be replayed against the API. Returns
 * null when the header is missing or the token is unknown/inactive.
 */
export async function authenticate(
  request: Request,
): Promise<Installation | null> {
  const token = bearerToken(request);
  if (!token) {
    return null;
  }
  const tokenHash = await sha256Hex(token);
  const rows = await db<InstallationRow[]>`
    SELECT id, name, organization_id, active
    FROM installations
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.active !== 1) {
    return null;
  }
  await db`
    UPDATE installations
    SET last_seen_at = ${new Date()}
    WHERE id = ${row.id}
  `;
  return {
    id: row.id,
    name: row.name,
    organizationId: row.organization_id,
  };
}
