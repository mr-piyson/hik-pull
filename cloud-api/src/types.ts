/**
 * One attendance event as sent by the hik-pull local collector.
 * Mirrors `src/lib/cloud/types.ts` in the Next.js app.
 */
export type CloudAttendanceEvent = {
  sourceEventKey: string;
  organizationId: string;
  deviceId: string | null;
  deviceSerial: string | null;
  personId: string | null;
  personName: string | null;
  cardNo: string | null;
  gateDirection: string;
  eventType: string | null;
  verification: string | null;
  timeRaw: string | null;
  occurredAt: string | null;
};

/** Authenticated caller, resolved from a bearer token. */
export type Installation = {
  id: string;
  name: string;
  organizationId: string;
};

/** A validated event ready to be written to MySQL. */
export type NormalizedEvent = {
  organizationId: string;
  sourceEventKey: string;
  deviceId: string | null;
  deviceSerial: string | null;
  personId: string | null;
  personName: string | null;
  cardNo: string | null;
  gateDirection: string;
  eventType: string | null;
  verification: string | null;
  timeRaw: string | null;
  occurredAt: Date | null;
};
