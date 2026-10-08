import {
  insertEvents,
  JSON_MAX,
  listEvents,
  normalizeEvent,
} from "./attendance";
import { authenticate } from "./auth";
import { db, errorMessage } from "./db";
import { env } from "./env";
import { dateParam, json, numberParam } from "./http";
import { migrate, seedTokens } from "./schema";
import type { Installation, NormalizedEvent } from "./types";

async function handleHealth(): Promise<Response> {
  try {
    await db`SELECT 1`;
    return json({ ok: true, database: "up", time: new Date().toISOString() });
  } catch (error) {
    return json(
      { ok: false, database: "down", error: errorMessage(error) },
      { status: 503 },
    );
  }
}

async function handleBatch(request: Request): Promise<Response> {
  let installation: Installation | null;
  try {
    installation = await authenticate(request);
  } catch (error) {
    return json(
      { error: "Authentication unavailable", detail: errorMessage(error) },
      { status: 503 },
    );
  }
  if (!installation) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const rawEvents =
    body && typeof body === "object" && "events" in body
      ? (body as { events: unknown }).events
      : Array.isArray(body)
        ? body
        : null;
  if (!Array.isArray(rawEvents)) {
    return json({ error: "Expected { events: [...] }" }, { status: 400 });
  }
  if (rawEvents.length > JSON_MAX) {
    return json(
      { error: `Too many events in one batch (max ${JSON_MAX})` },
      { status: 413 },
    );
  }

  const valid: NormalizedEvent[] = [];
  const errors: { index: number; reason: string }[] = [];
  for (let index = 0; index < rawEvents.length; index += 1) {
    const result = normalizeEvent(
      rawEvents[index],
      installation.organizationId,
    );
    if ("error" in result) {
      errors.push({ index, reason: result.error });
    } else {
      valid.push(result.event);
    }
  }

  try {
    const { accepted, duplicates } = await insertEvents(installation.id, valid);
    return json({
      accepted,
      duplicates,
      rejected: errors.length,
      received: rawEvents.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    // 500 so the collector keeps the batch queued and retries.
    return json(
      { error: "Failed to store events", detail: errorMessage(error) },
      { status: 500 },
    );
  }
}

async function handleList(request: Request): Promise<Response> {
  const installation = await authenticate(request);
  if (!installation) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const organizationId =
    url.searchParams.get("organizationId")?.trim() ||
    installation.organizationId;
  const events = await listEvents({
    organizationId,
    from: dateParam(url.searchParams.get("from")),
    to: dateParam(url.searchParams.get("to")),
    personId: url.searchParams.get("personId"),
    deviceId: url.searchParams.get("deviceId"),
    limit: numberParam(url.searchParams.get("limit"), 100, 1, 1_000),
    offset: numberParam(url.searchParams.get("offset"), 0, 0, 2_147_483_647),
  });
  return json({ organizationId, count: events.length, events });
}

async function main(): Promise<void> {
  if (env.autoMigrate) {
    await migrate();
  }
  const seeded = await seedTokens();

  Bun.serve({
    hostname: env.hostname,
    port: env.port,
    routes: {
      "/": {
        GET: () =>
          json({
            name: "hik-pull cloud ingestion API",
            version: "0.1.0",
            status: "ok",
          }),
      },
      "/health": { GET: () => handleHealth() },
      "/attendance/batch": { POST: (request) => handleBatch(request) },
      "/attendance": { GET: (request) => handleList(request) },
    },
    fetch() {
      return json({ error: "Not found" }, { status: 404 });
    },
  });

  console.log(
    `[cloud-api] Listening on http://${env.hostname}:${env.port} ` +
      `(migrate: ${env.autoMigrate ? "on" : "off"}, ` +
      `tokens seeded: ${seeded}).`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`[cloud-api] Startup failed: ${errorMessage(error)}`);
  process.exit(1);
}
