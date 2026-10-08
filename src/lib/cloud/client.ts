import type { CloudAttendanceEvent, CloudBatchResponse } from "./types";

export class CloudSyncError extends Error {
  readonly status: number;
  /** True for timeouts/network faults and 5xx/429, which are worth retrying. */
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "CloudSyncError";
    this.status = status;
    this.retryable = retryable;
  }
}

function batchUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/attendance/batch`;
}

/**
 * POST one batch of attendance events to the cloud ingestion API.
 *
 * Auth is a per-installation bearer token. Idempotency is the caller's job
 * upstream: every event carries its stable `sourceEventKey`, so the cloud can
 * discard a batch that was already accepted after a network timeout.
 */
export async function postAttendanceBatch(
  endpoint: string,
  token: string,
  events: CloudAttendanceEvent[],
  signal?: AbortSignal,
): Promise<CloudBatchResponse> {
  let response: Response;
  try {
    response = await fetch(batchUrl(endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events }),
      signal,
    });
  } catch (error) {
    throw new CloudSyncError(
      `Cannot reach the cloud endpoint at ${endpoint}. ${
        error instanceof Error ? error.message : String(error)
      }`,
      0,
      true,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new CloudSyncError(
      `Cloud ingestion failed with HTTP ${response.status}${
        text.trim() ? `: ${text.slice(0, 300)}` : ""
      }`,
      response.status,
      response.status >= 500 || response.status === 429,
    );
  }

  if (!text.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as CloudBatchResponse)
      : {};
  } catch {
    throw new CloudSyncError(
      `Cloud endpoint returned an unreadable body: ${text.slice(0, 200)}`,
      response.status,
      false,
    );
  }
}
