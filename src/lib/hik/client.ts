import { randomUUID } from "node:crypto";
import { buildDigestAuthorization, parseChallenge } from "./digest";
import { normalizeHistoryItem, toIsapiTime, unwrapRoot } from "./events";
import { looksLikeXml, xmlToJson } from "./multipart";
import type { AccessEvent, DeviceCredentials, DeviceInfo } from "./types";

export class HikRequestError extends Error {
  readonly status: number;
  readonly deviceMessage: string | null;

  constructor(message: string, status: number, deviceMessage: string | null) {
    super(message);
    this.name = "HikRequestError";
    this.status = status;
    this.deviceMessage = deviceMessage;
  }
}

function baseUrl(device: DeviceCredentials): string {
  const scheme = device.scheme === "https" ? "https" : "http";
  return `${scheme}://${device.host}:${device.port}`;
}

/**
 * Hikvision reports failures in the body even on a 4xx, and that body is
 * usually the only actionable detail (`statusString: "Invalid Content"`,
 * `subStatusCode: "badParameters"`). Pull it out rather than losing it.
 */
/**
 * Parse an ISAPI response body, tolerating XML.
 *
 * `?format=json` is advisory, not a contract. A DS-K1T671MF on firmware
 * V3.7.0 answers `/ISAPI/System/deviceInfo?format=json` with
 * `Content-Type: application/json` and an XML body, so trusting the header —
 * or calling `JSON.parse` on it — fails on a device that is otherwise working
 * perfectly. Converting the XML keeps the caller on one shape.
 */
function tryParseBody(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Not JSON; it may still be XML.
  }
  if (looksLikeXml(trimmed)) {
    return xmlToJson(trimmed);
  }
  return null;
}

async function deviceErrorMessage(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }
    const raw = tryParseBody(text);
    // XML roots (`<userCheck>`, `<ResponseStatus>`) become the outer key, so
    // the interesting fields sit one level down.
    const parsed = raw ? unwrapRoot(raw) : null;
    if (parsed) {
      const parts = [
        parsed.statusString,
        parsed.subStatusCode,
        parsed.errorMsg,
        parsed.message,
        parsed.statusSubCode,
      ].filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      );
      if (parts.length > 0) {
        return parts.join(" / ");
      }
    }
    return text.slice(0, 200);
  } catch {
    // Hikvision frequently slams the connection shut on 4xx, so reading the
    // body can itself fail. Never let that mask the status code.
    return null;
  }
}

type RequestOptions = {
  method?: string;
  json?: unknown;
  headers?: Record<string, string>;
  /** Timeout for reaching response headers. `null` disables it (streaming). */
  timeoutMs?: number | null;
  signal?: AbortSignal;
};

/**
 * One ISAPI call.
 *
 * Sends the request without credentials, expects a 401 challenge, then
 * re-sends with a freshly computed Authorization header. Two round-trips is
 * the unavoidable cost of the single-use nonces some Hikvision firmware
 * issues — see `digest.ts` for why caching a challenge does not work.
 */
export async function isapiRequest(
  device: DeviceCredentials,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const method = options.method ?? "GET";
  const url = `${baseUrl(device)}${path}`;
  const body =
    options.json === undefined ? undefined : JSON.stringify(options.json);

  const baseHeaders: Record<string, string> = {
    Accept: "application/json, application/xml, text/xml, */*",
    ...options.headers,
  };
  if (options.json !== undefined) {
    baseHeaders["Content-Type"] = "application/json";
  }

  const timeoutMs =
    options.timeoutMs === undefined ? 15_000 : options.timeoutMs;
  const controller = new AbortController();
  const timer =
    timeoutMs === null
      ? null
      : setTimeout(() => {
          controller.abort();
        }, timeoutMs);
  const onExternalAbort = () => {
    controller.abort();
  };
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  // Once headers are in, the connection is the caller's to own. For the
  // long-lived alert stream the timer must not be cleared, but for normal
  // requests we release the socket instead of holding it open.
  let headersReceived = false;
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    options.signal?.removeEventListener("abort", onExternalAbort);
  };

  try {
    const challengeResponse = await fetch(url, {
      method,
      headers: baseHeaders,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    headersReceived = true;

    if (challengeResponse.status !== 401) {
      return challengeResponse;
    }

    const wwwAuthenticate = challengeResponse.headers.get("www-authenticate");
    if (!wwwAuthenticate || !/digest/i.test(wwwAuthenticate)) {
      return challengeResponse;
    }

    const authorization = buildDigestAuthorization({
      username: device.username,
      password: device.password,
      challenge: parseChallenge(wwwAuthenticate),
      method,
      // Must match the request line exactly; it feeds the HA2 hash.
      uri: path,
    });

    // The challenge response body is not useful and the socket is dead.
    await challengeResponse.body?.cancel();

    return await fetch(url, {
      method,
      headers: { ...baseHeaders, Authorization: authorization },
      body,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HikRequestError(
        `Timed out or aborted contacting ${device.host}:${device.port} after ${timeoutMs ?? 0}ms`,
        0,
        null,
      );
    }
    throw new HikRequestError(
      `Cannot reach ${device.host}:${device.port} over ${device.scheme}. ${
        error instanceof Error ? error.message : String(error)
      }`,
      0,
      null,
    );
  } finally {
    if (headersReceived && timeoutMs !== null) {
      clearTimer();
    }
  }
}

async function isapiJson<T>(
  device: DeviceCredentials,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await isapiRequest(device, path, options);
  if (!response.ok) {
    throw new HikRequestError(
      `${options.method ?? "GET"} ${path} failed with HTTP ${response.status}`,
      response.status,
      await deviceErrorMessage(response),
    );
  }
  const text = await response.text();
  const parsed = tryParseBody(text);
  if (parsed) {
    return parsed as T;
  }
  throw new HikRequestError(
    `Device returned an unreadable body for ${path}. Expected JSON or XML.`,
    response.status,
    text.slice(0, 200) || null,
  );
}

export async function getDeviceInfo(
  device: DeviceCredentials,
): Promise<DeviceInfo> {
  const raw = await isapiJson<Record<string, unknown>>(
    device,
    "/ISAPI/System/deviceInfo?format=json",
  );
  // The XML form nests everything under the `<DeviceInfo>` root.
  const data = unwrapRoot(raw);
  const read = (key: string) =>
    typeof data[key] === "string" ? (data[key] as string) : "";
  const readFirst = (...keys: string[]) => {
    for (const key of keys) {
      const value = read(key);
      if (value.length > 0) {
        return value;
      }
    }
    return "";
  };
  return {
    deviceName: read("deviceName"),
    serialNumber: read("serialNumber"),
    // JSON firmware reports `deviceModel`; the XML form reports `model`.
    model: readFirst("deviceModel", "model"),
    firmwareVersion: read("firmwareVersion"),
    macAddress: read("macAddress"),
  };
}

type AcsEventCapabilities = {
  maxResults: { min: number; max: number };
  searchIdMaxLength: number;
  majors: number[];
};

const FALLBACK_CAPABILITIES: AcsEventCapabilities = {
  // `maxResults @max` is 10 on some terminals and 30 on others. Hardcoding
  // either is what produces statusCode 6 / "Invalid Content" / badParameters,
  // so this is only ever a last resort when capabilities cannot be read.
  maxResults: { min: 1, max: 10 },
  searchIdMaxLength: 20,
  majors: [0, 1, 2, 3, 5],
};

let capabilitiesCache: { key: string; value: AcsEventCapabilities } | null =
  null;

function parseNumberAttr(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Ask the device what it actually accepts.
 *
 * The AcsEventCond limits differ per model and firmware, so every request is
 * built from this response rather than from hardcoded constants.
 */
export async function getAcsEventCapabilities(
  device: DeviceCredentials,
): Promise<AcsEventCapabilities> {
  const cacheKey = `${device.scheme}://${device.host}:${device.port}`;
  if (capabilitiesCache?.key === cacheKey) {
    return capabilitiesCache.value;
  }

  try {
    const data = await isapiJson<Record<string, unknown>>(
      device,
      "/ISAPI/AccessControl/AcsEvent/capabilities?format=json",
    );
    const acsEvent = data.AcsEvent as Record<string, unknown> | undefined;
    const cond = acsEvent?.AcsEventCond as Record<string, unknown> | undefined;
    const rawMax = cond?.maxResults as Record<string, unknown> | undefined;
    const rawSearchId = cond?.searchID as Record<string, unknown> | undefined;
    const rawMajor = cond?.major as Record<string, unknown> | undefined;

    const maxResults = parseNumberAttr(rawMax?.["@max"]);
    const minResults = parseNumberAttr(rawMax?.["@min"]);
    const searchIdMaxLength = parseNumberAttr(rawSearchId?.["@max"]);
    const majors =
      typeof rawMajor?.["@opt"] === "string"
        ? rawMajor["@opt"]
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value))
        : [];

    capabilitiesCache = {
      key: cacheKey,
      value: {
        maxResults: {
          min: minResults ?? 1,
          max: maxResults ?? FALLBACK_CAPABILITIES.maxResults.max,
        },
        searchIdMaxLength:
          searchIdMaxLength ?? FALLBACK_CAPABILITIES.searchIdMaxLength,
        majors: majors.length > 0 ? majors : FALLBACK_CAPABILITIES.majors,
      },
    };
    return capabilitiesCache.value;
  } catch {
    return FALLBACK_CAPABILITIES;
  }
}

export type SearchOptions = {
  /** Registry id, so backfilled events share a key with their live twins. */
  deviceId: string;
  from: Date;
  to: Date;
  pageSize?: number;
  maxPages?: number;
  signal?: AbortSignal;
};

/**
 * Page through historical access-control events.
 *
 * `searchID` is a server-side session token: two concurrent searches against
 * one device interleave their cursors and corrupt each other's results, so a
 * fresh one is minted per call and never shared. Every supported `major` is
 * swept because access events are not guaranteed to sit under a single one.
 */
export async function* searchAcsEvents(
  device: DeviceCredentials,
  options: SearchOptions,
): AsyncGenerator<AccessEvent> {
  const capabilities = await getAcsEventCapabilities(device);
  const pageSize = Math.min(
    Math.max(1, options.pageSize ?? capabilities.maxResults.max),
    capabilities.maxResults.max,
  );
  const searchId = randomUUID()
    .replace(/-/g, "")
    .slice(0, capabilities.searchIdMaxLength);
  const startTime = toIsapiTime(options.from);
  const endTime = toIsapiTime(options.to);
  const maxPages = options.maxPages ?? 200;

  for (const major of capabilities.majors) {
    let position = 0;
    for (let page = 0; page < maxPages; page += 1) {
      options.signal?.throwIfAborted();

      const response = await isapiRequest(
        device,
        "/ISAPI/AccessControl/AcsEvent?format=json",
        {
          method: "POST",
          json: {
            AcsEventCond: {
              searchID: searchId,
              searchResultPosition: position,
              maxResults: pageSize,
              major,
              // 0 is the documented "any sub-type" wildcard for a given major.
              minor: 0,
              startTime,
              endTime,
            },
          },
          signal: options.signal,
        },
      );

      if (!response.ok) {
        throw new HikRequestError(
          `AcsEvent search (major=${major}, position=${position}) failed with HTTP ${response.status}`,
          response.status,
          await deviceErrorMessage(response),
        );
      }

      const text = await response.text();
      const page = tryParseBody(text);
      if (!page) {
        throw new HikRequestError(
          `AcsEvent search (major=${major}) returned an unreadable body`,
          response.status,
          text.slice(0, 200) || null,
        );
      }

      const acsEvent = page.AcsEvent as Record<string, unknown> | undefined;
      const infoList = acsEvent?.InfoList;
      if (!Array.isArray(infoList) || infoList.length === 0) {
        break;
      }

      for (const item of infoList) {
        if (typeof item !== "object" || item === null) {
          continue;
        }
        const event = normalizeHistoryItem(
          options.deviceId,
          item as Record<string, unknown>,
        );
        if (event) {
          yield event;
        }
      }

      // Advance by what was actually returned, not by the requested page size:
      // the device can return fewer rows than asked for.
      position += infoList.length;
    }
  }
}

/**
 * Open the long-lived event stream.
 *
 * `timeoutMs` defaults to `null` because the connection is meant to stay open
 * indefinitely; only the caller-supplied `signal` ends it.
 */
export async function openAlertStream(
  device: DeviceCredentials,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await isapiRequest(
    device,
    "/ISAPI/Event/notification/alertStream",
    { timeoutMs: null, signal },
  );

  if (response.status === 401) {
    throw new HikRequestError(
      "alertStream rejected the credentials (HTTP 401). Check the username/password and that the account has event-stream permission.",
      401,
      await deviceErrorMessage(response),
    );
  }
  if (!response.ok || !response.body) {
    const deviceMessage = await deviceErrorMessage(response);
    // The terminal keeps a small fixed number of event-stream slots and
    // answers 404 (not 503) when they are all taken — by a previous run that
    // died before closing its socket, by the device's own web UI, or by
    // another subscriber. It clears on its own, so the caller should retry
    // rather than treat it as a permanent failure.
    if (/deployExceedMax/i.test(deviceMessage ?? "")) {
      throw new HikRequestError(
        `Device event-stream limit reached (HTTP ${response.status}, deployExceedMax). Another client is holding the subscription — often the device web UI or a connection that has not timed out yet. It will free shortly; retry in a few seconds.`,
        response.status,
        deviceMessage,
      );
    }
    throw new HikRequestError(
      `alertStream failed with HTTP ${response.status}`,
      response.status,
      deviceMessage,
    );
  }
  return response;
}
