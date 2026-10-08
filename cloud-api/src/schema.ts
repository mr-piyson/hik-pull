import { sha256Hex } from "./crypto";
import { db } from "./db";
import { env } from "./env";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS installations (
    id CHAR(36) NOT NULL,
    name VARCHAR(191) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    organization_id VARCHAR(191) NOT NULL DEFAULT 'default',
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    last_seen_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_installations_token_hash (token_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS attendance_events (
    id CHAR(36) NOT NULL,
    organization_id VARCHAR(128) NOT NULL DEFAULT 'default',
    source_event_key VARCHAR(191) NOT NULL,
    device_id VARCHAR(191) NULL,
    device_serial VARCHAR(191) NULL,
    person_id VARCHAR(191) NULL,
    person_name VARCHAR(255) NULL,
    card_no VARCHAR(191) NULL,
    gate_direction VARCHAR(32) NOT NULL DEFAULT 'none',
    event_type VARCHAR(64) NULL,
    verification VARCHAR(64) NULL,
    time_raw VARCHAR(64) NULL,
    occurred_at DATETIME(3) NULL,
    received_at DATETIME(3) NOT NULL,
    installation_id CHAR(36) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_attendance_source (organization_id, source_event_key),
    KEY idx_attendance_org_time (organization_id, occurred_at),
    KEY idx_attendance_person (organization_id, person_id, occurred_at),
    KEY idx_attendance_device (organization_id, device_id, occurred_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Create the tables if they do not exist yet. Safe to run on every boot. */
export async function migrate(): Promise<void> {
  for (const statement of STATEMENTS) {
    await db.unsafe(statement);
  }
}

/**
 * Seed bearer tokens from `API_TOKENS` into `installations`. Idempotent:
 * re-running with the same token refreshes its name/organization and
 * reactivates it instead of creating a duplicate (unique on token_hash).
 */
export async function seedTokens(): Promise<number> {
  if (env.apiTokens.length === 0) {
    return 0;
  }
  const now = new Date();
  for (const seed of env.apiTokens) {
    const tokenHash = await sha256Hex(seed.token);
    await db`
      INSERT INTO installations
        (id, name, token_hash, organization_id, active, created_at, updated_at)
      VALUES
        (${crypto.randomUUID()}, ${seed.name}, ${tokenHash}, ${seed.organizationId}, 1, ${now}, ${now})
      ON DUPLICATE KEY UPDATE
        name = ${seed.name},
        organization_id = ${seed.organizationId},
        active = 1,
        updated_at = ${now}
    `;
  }
  return env.apiTokens.length;
}
