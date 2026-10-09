/** One attendance event as sent to the cloud ingestion API. */
export type CloudAttendanceEvent = {
  /** Stable upstream identity; the cloud deduplicates on this per device. */
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
  /** Device-reported timestamp, verbatim. */
  timeRaw: string | null;
  /** Parsed timestamp (ISO 8601) or null when the device omitted it. */
  occurredAt: string | null;
};

export type CloudBatchResponse = {
  accepted?: number;
  duplicates?: number;
  rejected?: number;
  received?: number;
  errors?: { index: number; reason: string }[];
  [key: string]: unknown;
};
