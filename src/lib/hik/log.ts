/**
 * Terminal logging for stream activity.
 *
 * Deliberately dependency-free and conditioned on `process.stdout.isTTY`, so
 * running under a process manager (or `NO_COLOR=1`) does not emit escape
 * sequences into a log file. Every live event is printed in full: the whole
 * point of this file is that nothing reaches the UI that cannot also be read
 * on the console.
 */

import type { AccessEvent, DeviceRecord } from "./types";

const enabled = Boolean(process.stdout?.isTTY) && !process.env.NO_COLOR;
const paint = (code: string, text: string): string =>
  enabled ? `\u001b[${code}m${text}\u001b[0m` : text;

export const color = {
  red: (t: string) => paint("31", t),
  green: (t: string) => paint("32", t),
  yellow: (t: string) => paint("33", t),
  magenta: (t: string) => paint("35", t),
  cyan: (t: string) => paint("36", t),
  gray: (t: string) => paint("90", t),
  bold: (t: string) => paint("1", t),
};

const DIRECTION_COLOR: Record<string, (t: string) => string> = {
  in: color.green,
  denied: color.red,
  door: color.yellow,
  other: color.magenta,
};

function stamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3,
  )}`;
}

/** `Front door (172.18.12.17:80)` — enough to tell streams apart at a glance. */
function endpoint(device: DeviceRecord): string {
  return color.cyan(`${device.label} (${device.host}:${device.port})`);
}

/** A detail field, omitted when the device did not report it. */
function field(name: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  return `${color.gray(name)}=${value}`;
}

function details(parts: (string | null)[]): string {
  const present = parts.filter((p): p is string => p !== null);
  return present.length > 0 ? ` ${color.gray("·")} ${present.join(" ")}` : "";
}

/** One line per live access event, with every field the normaliser produced. */
export function logEvent(device: DeviceRecord, event: AccessEvent): void {
  const tint = DIRECTION_COLOR[event.direction] ?? color.magenta;
  const title = [
    color.gray(stamp()),
    color.bold("EVENT"),
    endpoint(device),
    tint(event.direction.toUpperCase().padEnd(6)),
    tint(event.label),
    color.gray(`(major ${event.major} / minor ${event.minor})`),
  ].join("  ");

  console.log(
    [
      title,
      details([
        field("time", event.time),
        field("name", event.name),
        field("card", event.cardNo),
        field("employee", event.employeeNo),
        field("reader", event.readerNo),
        field("serial", event.serialNo),
        field("source", event.source),
        field("id", event.id),
      ]),
    ].join("\n"),
  );
}

/** Stream lifecycle: open, close, failure, reconnect scheduling. */
export function logStream(
  device: DeviceRecord,
  level: "info" | "ok" | "warn" | "error",
  message: string,
): void {
  const tag =
    level === "info"
      ? color.gray("INFO  ")
      : level === "ok"
        ? color.green("LIVE  ")
        : level === "warn"
          ? color.yellow("WARN  ")
          : color.red("ERROR ");
  console.log([color.gray(stamp()), tag, endpoint(device), message].join("  "));
}

/**
 * A part arrived but was not an access event — VMD noise, a channel snapshot,
 * or a shape this build does not read yet. Worth surfacing: silent drops are
 * what make "why is that event missing?" unanswerable.
 *
 * A parsed payload is preferred when one exists, because `eventType: "VMD"`
 * explains the skip; otherwise the body is binary, so the preview keeps only
 * printable bytes and never floods the terminal.
 */
export function logSkipped(
  device: DeviceRecord,
  contentType: string | undefined,
  body: string,
  payload: Record<string, unknown> | null = null,
): void {
  const kind = contentType ?? "unknown content-type";
  const reason = payload
    ? `eventType=${String(payload.eventType ?? "(none)")} eventState=${String(
        payload.eventState ?? "(none)",
      )}`
    : `${body.length} chars, unparseable or binary: ${
        body
          .replace(/[^ -~]+/g, "·")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80) || "(binary)"
      }`;

  console.log(
    [
      color.gray(stamp()),
      color.gray("SKIP "),
      endpoint(device),
      color.gray(`not an access event (${kind}):`),
      color.gray(reason),
    ].join("  "),
  );
}

/**
 * History is summarised rather than printed line by line — a 31-day sweep can
 * return tens of thousands of events, and dumping them would bury the live
 * stream this module exists to surface. Set `HIK_LOG_BACKFILL=1` to print each
 * historical event in full as well.
 */
export function logBackfill(
  device: DeviceRecord,
  events: AccessEvent[],
  truncated: boolean,
  stored?: { unique: number; new: number },
): void {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.direction] = (counts[event.direction] ?? 0) + 1;
  }
  const breakdown = Object.entries(counts)
    .map(([direction, n]) => {
      const tint = DIRECTION_COLOR[direction] ?? color.magenta;
      return tint(`${direction}=${n}`);
    })
    .join(" ");

  // The device answers the same event more than once across its per-major
  // searches, so the raw fetch is routinely larger than the number of real
  // events. Showing both numbers makes that visible instead of mysterious.
  const storedDetail = stored
    ? color.gray(`(${stored.unique} unique, ${stored.new} new)`)
    : null;

  console.log(
    [
      color.gray(stamp()),
      color.cyan("BACKFILL"),
      endpoint(device),
      color.bold(`${events.length} events`),
      breakdown || color.gray("none"),
      storedDetail,
      truncated ? color.yellow("(truncated: more history remains)") : null,
    ]
      .filter((part): part is string => part !== null)
      .join("  "),
  );

  if (process.env.HIK_LOG_BACKFILL === "1") {
    for (const event of events) {
      logEvent(device, event);
    }
  }
}
