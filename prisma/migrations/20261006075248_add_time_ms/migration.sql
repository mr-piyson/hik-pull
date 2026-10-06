-- DropIndex
DROP INDEX "LogEvent_deviceId_time_idx";

-- AlterTable
ALTER TABLE "LogEvent" ADD COLUMN "timeMs" BIGINT;

-- CreateIndex
CREATE INDEX "LogEvent_deviceId_timeMs_idx" ON "LogEvent"("deviceId", "timeMs");
