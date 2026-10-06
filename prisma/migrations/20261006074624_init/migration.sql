-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "scheme" TEXT NOT NULL DEFAULT 'http',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 80,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "LogEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "time" TEXT,
    "direction" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "employeeNo" TEXT NOT NULL DEFAULT '',
    "cardNo" TEXT NOT NULL DEFAULT '',
    "readerNo" INTEGER,
    "serialNo" TEXT,
    "source" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("deviceId", "id"),
    CONSTRAINT "LogEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Device_host_idx" ON "Device"("host");

-- CreateIndex
CREATE INDEX "LogEvent_deviceId_time_idx" ON "LogEvent"("deviceId", "time");

-- CreateIndex
CREATE INDEX "LogEvent_deviceId_direction_idx" ON "LogEvent"("deviceId", "direction");

-- CreateIndex
CREATE INDEX "LogEvent_receivedAt_idx" ON "LogEvent"("receivedAt");
