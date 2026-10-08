/**
 * Single-organization default. Every attendance/outbox row carries this so
 * enabling real multi-tenancy later is a configuration change rather than a
 * data migration: the column already exists and is already indexed.
 */
export const DEFAULT_ORGANIZATION_ID = "default";
