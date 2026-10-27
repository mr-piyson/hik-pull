import { router } from "../trpc";
import { attendanceRouter } from "./attendance";
import { devicesRouter } from "./devices";
import { eventsRouter } from "./events";
import { settingsRouter } from "./settings";
import { systemRouter } from "./system";
import { usersRouter } from "./users";
import { workerRouter } from "./worker";

export const appRouter = router({
  attendance: attendanceRouter,
  devices: devicesRouter,
  events: eventsRouter,
  settings: settingsRouter,
  system: systemRouter,
  users: usersRouter,
  worker: workerRouter,
});

export type AppRouter = typeof appRouter;
