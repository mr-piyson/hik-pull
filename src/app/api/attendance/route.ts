import { listAttendanceLogs } from "@/lib/hik/attendance-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function parseInteger(
  value: string | null,
  label: string,
  fallback: number,
  max: number,
): number {
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    throw new Error(`${label} must be an integer between 0 and ${max}.`);
  }
  return parsed;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let offset: number;
  let limit: number;
  try {
    offset = parseInteger(params.get("offset"), "offset", 0, 2_147_483_647);
    limit = parseInteger(
      params.get("limit"),
      "limit",
      DEFAULT_LIMIT,
      MAX_LIMIT,
    );
    if (limit === 0) {
      throw new Error("limit must be between 1 and 500.");
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  return Response.json(await listAttendanceLogs(offset, limit));
}
