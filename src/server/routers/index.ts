import { router } from "../trpc";
import { attendanceRouter } from "./attendance";
import { devicesRouter } from "./devices";
import { eventsRouter } from "./events";
import { settingsRouter } from "./settings";
import { usersRouter } from "./users";

export const appRouter = router({
  attendance: attendanceRouter,
  devices: devicesRouter,
  events: eventsRouter,
  settings: settingsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
