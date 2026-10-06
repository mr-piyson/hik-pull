// Prisma CLI configuration. The database file lives in `.data/` alongside the
// old `devices.json` so everything the app persists is gitignored together.
// `DATABASE_URL` can override the path; without it the default is used.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./.data/hik.db",
  },
});
