import { getDeviceInfo, openAlertStream } from "./client";
import { recordEvents } from "./event-store";
import { normalizeLiveChunk } from "./events";
import { logSkipped, logStream } from "./log";
import {
  extractBoundary,
  looksLikeXml,
  parseMultipart,
  xmlToJson,
} from "./multipart";
import type { AccessEvent, ConnectionState, DeviceRecord } from "./types";

type EventListener = (event: AccessEvent) => void;
type StateListener = (state: ConnectionState) => void;

type Connection = {
  controller: AbortController | null;
  listeners: Set<EventListener>;
  stateListeners: Set<StateListener>;
  state: ConnectionState;
  reconnectTimer: NodeJS.Timeout | null;
  /** Retained so `stopDevice` can identify the device in its log line. */
  device: DeviceRecord | null;
};

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

const INITIAL_STATE: ConnectionState = {
  status: "idle",
  message: null,
  since: null,
  eventsReceived: 0,
  lastEventAt: null,
  attempt: 0,
};

/**
 * Anchored on `globalThis` deliberately.
 *
 * Next.js dev-mode hot reload re-evaluates route modules, which would
 * otherwise leave a second registry — orphaning the first one's sockets to the
 * device and doubling the connection count with every edit.
 */
type RegistryGlobal = typeof globalThis & {
  __hikRegistry?: Map<string, Connection>;
};

const registry: Map<string, Connection> = (() => {
  const scope = globalThis as RegistryGlobal;
  scope.__hikRegistry ??= new Map<string, Connection>();
  return scope.__hikRegistry;
})();

function entryFor(deviceId: string): Connection {
  let entry = registry.get(deviceId);
  if (!entry) {
    entry = {
      controller: null,
      listeners: new Set(),
      stateListeners: new Set(),
      state: { ...INITIAL_STATE },
      reconnectTimer: null,
      device: null,
    };
    registry.set(deviceId, entry);
  }
  return entry;
}

function publish(deviceId: string, patch: Partial<ConnectionState>): void {
  const entry = entryFor(deviceId);
  entry.state = {
    ...entry.state,
    ...patch,
    since: patch.since ?? entry.state.since,
  };
  for (const listener of entry.stateListeners) {
    listener(entry.state);
  }
}

function emit(deviceId: string, event: AccessEvent): void {
  const entry = entryFor(deviceId);
  entry.state.eventsReceived += 1;
  entry.state.lastEventAt = new Date().toISOString();
  for (const listener of entry.listeners) {
    try {
      listener(event);
    } catch {
      // One broken SSE consumer must not tear down the device connection.
    }
  }
}

function backoffDelay(attempt: number): number {
  return Math.min(
    RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1),
    RECONNECT_MAX_MS,
  );
}

/**
 * Store the event without waiting for it.
 *
 * A slow or failing write must never stall the live loop: the device drops a
 * reader that falls behind, and losing the connection would cost far more
 * events than one failed insert. Failures are logged rather than swallowed.
 */
function persistEvent(device: DeviceRecord, event: AccessEvent): void {
  void recordEvents([event], device).catch((error) => {
    logStream(
      device,
      "error",
      `could not store event ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

function parsePayload(body: string): Record<string, unknown> | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (looksLikeXml(trimmed)) {
    return xmlToJson(trimmed);
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function runConnection(
  device: DeviceRecord,
  entry: Connection,
): Promise<void> {
  const attempt = entry.state.attempt + 1;
  entry.device = device;
  publish(device.id, {
    status: attempt === 1 ? "connecting" : "reconnecting",
    attempt,
  });
  logStream(
    device,
    "info",
    `connecting to ${device.scheme}://${device.host}:${device.port} (attempt ${attempt})`,
  );

  const controller = new AbortController();
  entry.controller = controller;
  let response: Response | null = null;

  // Some terminals hold the stream open for ~25s before the first byte while
  // they flush their buffer. Without a note, that reads as a hang.
  let connected = false;
  const slowStart = setTimeout(() => {
    if (!connected) {
      logStream(
        device,
        "warn",
        "no response from the device yet — this model can take ~20-25s to open the event stream",
      );
    }
  }, 8_000);

  try {
    response = await openAlertStream(device, controller.signal);
    const boundary = extractBoundary(response.headers.get("content-type"));
    if (!boundary) {
      throw new Error(
        `Device did not return a multipart boundary (content-type: ${response.headers.get("content-type")}).`,
      );
    }
    if (!response.body) {
      throw new Error("Device returned an empty event stream.");
    }
    const stream = response.body;
    connected = true;

    // Only reset the backoff once the stream actually opened.
    publish(device.id, {
      status: "live",
      message: null,
      attempt: 0,
      since: new Date().toISOString(),
    });
    logStream(
      device,
      "ok",
      `stream open, boundary=${boundary}, listening for events`,
    );

    for await (const part of parseMultipart(stream, boundary)) {
      if (controller.signal.aborted) {
        break;
      }
      const payload = parsePayload(part.body);
      const event = payload ? normalizeLiveChunk(device.id, payload) : null;
      if (!event) {
        logSkipped(device, part.headers["content-type"], part.body, payload);
        continue;
      }
      emit(device.id, event);
      // logEvent(device, event);
      persistEvent(device, event);
    }

    if (!controller.signal.aborted) {
      throw new Error("Event stream closed by the device.");
    }
    logStream(device, "warn", "stream closed (stop requested)");
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    publish(device.id, { status: "error", message });
    logStream(device, "error", message);
  } finally {
    clearTimeout(slowStart);
    if (entry.controller === controller) {
      entry.controller = null;
      // Release the socket explicitly; the device will not drop it on its own.
      await response?.body?.cancel().catch(() => undefined);
    }
  }

  // Reconnect unless the caller asked us to stop. The device closes the
  // stream on its own schedule, so a silent supervisor is required.
  if (!registry.has(device.id) || entry.state.status === "idle") {
    return;
  }
  const delay = backoffDelay(entry.state.attempt);
  publish(device.id, {
    status: "reconnecting",
    message: `Reconnecting in ${Math.round(delay / 1000)}s`,
  });
  logStream(
    device,
    "warn",
    `reconnecting in ${Math.round(delay / 1000)}s (attempt ${entry.state.attempt + 1})`,
  );
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null;
    void runConnection(device, entry);
  }, delay);
}

export function startDevice(device: DeviceRecord): void {
  const entry = entryFor(device.id);
  if (entry.controller || entry.reconnectTimer) {
    return;
  }
  entry.device = device;
  publish(device.id, { status: "connecting", message: null, attempt: 0 });
  logStream(device, "info", `live stream requested for ${device.label}`);
  void runConnection(device, entry);
}

export function stopDevice(deviceId: string): void {
  const entry = registry.get(deviceId);
  if (!entry) {
    return;
  }
  entry.controller?.abort();
  entry.controller = null;
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  publish(deviceId, { status: "idle", message: null, attempt: 0 });
  if (entry.device) {
    logStream(entry.device, "info", "live stream stopped");
  }
}

export function isRunning(deviceId: string): boolean {
  const entry = registry.get(deviceId);
  return Boolean(entry?.controller || entry?.reconnectTimer);
}

export function getState(deviceId: string): ConnectionState {
  return entryFor(deviceId).state;
}

export function listStates(): Record<string, ConnectionState> {
  const states: Record<string, ConnectionState> = {};
  for (const [id, entry] of registry) {
    states[id] = entry.state;
  }
  return states;
}

export function subscribeEvents(
  deviceId: string,
  listener: EventListener,
): () => void {
  const entry = entryFor(deviceId);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function subscribeState(
  deviceId: string,
  listener: StateListener,
): () => void {
  const entry = entryFor(deviceId);
  entry.stateListeners.add(listener);
  return () => {
    entry.stateListeners.delete(listener);
  };
}

/** Probe credentials without opening a stream, for save-time validation. */
export async function probeDevice(device: DeviceRecord) {
  return getDeviceInfo(device);
}
