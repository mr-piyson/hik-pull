import { router } from "../trpc";
import { attendanceRouter } from "./attendance";
import { devicesRouter } from "./devices";
import { eventsRouter } from "./events";
import { usersRouter } from "./users";

export const appRouter = router({
  attendance: attendanceRouter,
  devices: devicesRouter,
  events: eventsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
