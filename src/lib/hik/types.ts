export type DeviceScheme = "http" | "https";

export type DeviceCredentials = {
  scheme: DeviceScheme;
  host: string;
  port: number;
  username: string;
  password: string;
};

export type DeviceRecord = DeviceCredentials & {
  id: string;
  label: string;
  createdAt: string;
};

/** Device as safe to send to the browser: no password, ever. */
export type PublicDevice = {
  id: string;
  label: string;
  scheme: DeviceScheme;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  createdAt: string;
};

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";

export type ConnectionState = {
  status: ConnectionStatus;
  message: string | null;
  since: string | null;
  eventsReceived: number;
  lastEventAt: string | null;
  attempt: number;
};

/**
 * How a single access-control event should be presented. A face terminal has
 * no literal "in/out direction", so this is derived from the event code.
 */
export type AccessDirection = "in" | "denied" | "door" | "other";

export type AccessEvent = {
  /** Stable across live + backfill for the same device event, for dedupe. */
  id: string;
  deviceId: string;
  /** Device-reported timestamp, ISO-ish. `null` when the device omits it. */
  time: string | null;
  direction: AccessDirection;
  /** Human label for the minor code. */
  label: string;
  /** `majorEventType` as reported. */
  major: number;
  /** `subEventType` as reported. */
  minor: number;
  name: string;
  employeeNo: string;
  cardNo: string;
  readerNo: number | null;
  serialNo: string | null;
  source: "live" | "backfill";
};

export type DeviceInfo = {
  deviceName: string;
  serialNumber: string;
  model: string;
  firmwareVersion: string;
  macAddress: string;
};

export function toPublicDevice(device: DeviceRecord): PublicDevice {
  return {
    id: device.id,
    label: device.label,
    scheme: device.scheme,
    host: device.host,
    port: device.port,
    username: device.username,
    hasPassword: device.password.length > 0,
    createdAt: device.createdAt,
  };
}
