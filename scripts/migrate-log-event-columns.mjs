import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { Prisma } from "../src/generated/prisma/client.ts";
import { mapApiEventFields } from "../src/lib/hik/event-store.ts";

const databaseUrl = process.env.DATABASE_URL ?? "file:./.data/hik.db";
if (!databaseUrl.startsWith("file:")) {
  throw new Error("LogEvent migration requires a SQLite file: DATABASE_URL.");
}
const databasePath = resolve(
  process.cwd(),
  decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]),
);
const db = new Database(databasePath);

const columns = {
  faceRectHeight: "FaceRect.height",
  faceRectWidth: "FaceRect.width",
  faceRectX: "FaceRect.x",
  faceRectY: "FaceRect.y",
  accessDeviceName: "AccessControllerEvent.deviceName",
  accessMajorEventType: "AccessControllerEvent.majorEventType",
  accessSubEventType: "AccessControllerEvent.subEventType",
  accessCardNo: "AccessControllerEvent.cardNo",
  accessCardType: "AccessControllerEvent.cardType",
  accessName: "AccessControllerEvent.name",
  accessCardReaderKind: "AccessControllerEvent.cardReaderKind",
  accessCardReaderNo: "AccessControllerEvent.cardReaderNo",
  accessDoorNo: "AccessControllerEvent.doorNo",
  accessVerifyNo: "AccessControllerEvent.verifyNo",
  accessEmployeeNoString: "AccessControllerEvent.employeeNoString",
  accessSerialNo: "AccessControllerEvent.serialNo",
  accessUserType: "AccessControllerEvent.userType",
  accessCurrentVerifyMode: "AccessControllerEvent.currentVerifyMode",
  accessCurrentEvent: "AccessControllerEvent.currentEvent",
  accessFrontSerialNo: "AccessControllerEvent.frontSerialNo",
  accessAttendanceStatus: "AccessControllerEvent.attendanceStatus",
  accessLabel: "AccessControllerEvent.label",
  accessStatusValue: "AccessControllerEvent.statusValue",
  accessMask: "AccessControllerEvent.mask",
  accessHelmet: "AccessControllerEvent.helmet",
  accessPurePwdVerifyEnable: "AccessControllerEvent.purePwdVerifyEnable",
};

function quote(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function columnName(field) {
  return columns[field] ?? field;
}

const existingColumns = new Set(
  db
    .query('PRAGMA table_info("LogEvent")')
    .all()
    .map((row) => row.name),
);
if (!existingColumns.has("apiData")) {
  if (
    !existingColumns.has("_event_id") ||
    !existingColumns.has("_device_id") ||
    !existingColumns.has("AccessControllerEvent.majorEventType")
  ) {
    db.close();
    throw new Error(
      "LogEvent has neither apiData nor the new event columns; migrate this database from its previous normalized schema separately.",
    );
  }
  console.log("LogEvent already uses dedicated API field columns.");
  db.close();
  process.exit(0);
}

const rows = db
  .query('SELECT id, deviceId, apiData, source FROM "LogEvent"')
  .all();
const updates = rows.map((row) => {
  const mapped = mapApiEventFields(
    row.deviceId,
    row.id,
    row.source,
    row.apiData,
  );
  const values = Object.entries(mapped).filter(
    ([field]) => !["id", "deviceId", "source", "receivedAt"].includes(field),
  );
  return { ...row, values };
});

const apiFields = Object.values(Prisma.LogEventScalarFieldEnum).filter(
  (field) => !["id", "deviceId", "source", "receivedAt"].includes(field),
);
const updateRow = (row) => {
  if (row.values.length === 0) {
    return;
  }
  const assignments = row.values.map(
    ([field]) => `${quote(columnName(field))} = ?`,
  );
  const values = row.values.map(([_, value]) =>
    value === Prisma.JsonNull ? "null" : JSON.stringify(value),
  );
  db.query(
    `UPDATE "LogEvent" SET ${assignments.join(", ")} WHERE "_device_id" = ? AND "_event_id" = ?`,
  ).run(...values, row.deviceId, row.id);
};

db.transaction(() => {
  for (const index of [
    "LogEvent_deviceId_timeMs_idx",
    "LogEvent_deviceId_direction_idx",
    "LogEvent_receivedAt_idx",
  ]) {
    db.exec(`DROP INDEX IF EXISTS ${quote(index)}`);
  }
  db.exec('ALTER TABLE "LogEvent" RENAME COLUMN "deviceId" TO "_device_id"');
  db.exec('ALTER TABLE "LogEvent" RENAME COLUMN "id" TO "_event_id"');

  const currentColumns = new Set(
    db
      .query('PRAGMA table_info("LogEvent")')
      .all()
      .map((row) => row.name),
  );
  for (const field of apiFields) {
    const name = columnName(field);
    if (!currentColumns.has(name)) {
      db.exec(`ALTER TABLE "LogEvent" ADD COLUMN ${quote(name)} JSONB`);
    }
  }
  for (const row of updates) {
    updateRow(row);
  }
  db.exec('ALTER TABLE "LogEvent" DROP COLUMN "apiData"');
})();

const remaining = db
  .query('SELECT count(*) AS count FROM "LogEvent"')
  .get().count;
const foreignKeyErrors = db.query("PRAGMA foreign_key_check").all();
db.close();
if (remaining !== rows.length || foreignKeyErrors.length > 0) {
  throw new Error(
    `LogEvent migration verification failed: expected ${rows.length} rows, found ${remaining}; foreign key violations: ${foreignKeyErrors.length}.`,
  );
}
console.log(`Migrated ${remaining} LogEvent rows to dedicated API columns.`);
