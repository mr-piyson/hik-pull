import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { captureAndEnrollFingerprint } from "@/lib/hik/client";
import { getDevice } from "@/lib/hik/store";
import {
  createManagedUser,
  deleteManagedUser,
  getManagedUser,
  listManagedUsers,
  listUserSyncLogs,
  listUserSyncLogsForUser,
  recordUserSync,
  updateManagedUser,
} from "@/lib/hik/user-store";
import { deleteUserFromDevices, syncUserToDevices } from "@/lib/hik/user-sync";
import type { ManagedUser } from "@/lib/hik/user-types";
import {
  AUTHENTICATION_MODES,
  GENDERS,
  USER_TYPES,
} from "@/lib/hik/user-types";
import { validateNewUser, validateUserUpdate } from "@/lib/hik/user-validation";
import { publicProcedure, router } from "../trpc";

const userInput = z.object({
  employeeNo: z.string(),
  name: z.string(),
  cardNo: z.string().nullable().optional(),
  cardNos: z.array(z.string()).optional(),
  userType: z.enum(USER_TYPES),
  floorNumber: z.union([z.number(), z.string()]).optional(),
  roomNumber: z.union([z.number(), z.string()]).optional(),
  gender: z.enum(GENDERS).optional(),
  longTermEffective: z.boolean().optional(),
  isAdministrator: z.boolean().optional(),
  visitTimes: z.union([z.number(), z.string()]).optional(),
  authenticationType: z.enum(["sameDevice", "custom"]).optional(),
  authenticationMode: z.enum(AUTHENTICATION_MODES).optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
});

const userUpdateInput = userInput.partial();

function validationError(error: unknown): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : String(error),
  });
}

export const usersRouter = router({
  list: publicProcedure.query(async () => {
    const [users, syncLogs] = await Promise.all([
      listManagedUsers(),
      listUserSyncLogs(),
    ]);
    return { users, syncLogs };
  }),

  get: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const user = await getManagedUser(input.id);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }
      const syncLogs = await listUserSyncLogsForUser(input.id);
      return { user, syncLogs };
    }),

  create: publicProcedure.input(userInput).mutation(async ({ input }) => {
    let parsed: ReturnType<typeof validateNewUser>;
    try {
      parsed = validateNewUser(input);
    } catch (error) {
      return validationError(error);
    }

    let user: ManagedUser;
    try {
      user = await createManagedUser(randomUUID(), parsed);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That employee number is already in use.",
        });
      }
      throw error;
    }

    const results = await syncUserToDevices(user, "create");
    return { user, results };
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        data: userUpdateInput,
      }),
    )
    .mutation(async ({ input }) => {
      const current = await getManagedUser(input.id);
      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }

      let data: ReturnType<typeof validateUserUpdate>;
      try {
        data = validateUserUpdate(input.data, current);
      } catch (error) {
        return validationError(error);
      }

      let user: ManagedUser;
      try {
        user = await updateManagedUser(input.id, data);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found.",
          });
        }
        throw error;
      }

      const results = await syncUserToDevices(user, "update", current.cardNos);
      return { user, results };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const user = await getManagedUser(input.id);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }

      const results = await deleteUserFromDevices(user);
      const deleted = results.every((result) => result.ok);
      if (deleted) {
        await deleteManagedUser(input.id);
      }
      return { deleted, results };
    }),

  sync: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const user = await getManagedUser(input.id);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }
      const results = await syncUserToDevices(user, "retry");
      return { results };
    }),

  enrollFingerprint: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        deviceId: z.string().min(1),
        fingerNo: z.coerce.number().int().min(1).max(10),
      }),
    )
    .mutation(async ({ input }) => {
      const user = await getManagedUser(input.id);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found.",
        });
      }
      const device = await getDevice(input.deviceId);
      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found.",
        });
      }

      try {
        await captureAndEnrollFingerprint(device, {
          employeeNo: user.employeeNo,
          fingerNo: input.fingerNo,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordUserSync({
          userId: user.id,
          employeeNo: user.employeeNo,
          userName: user.name,
          deviceId: device.id,
          deviceLabel: device.label,
          operation: "fingerprint",
          status: "failure",
          message,
        });
        throw new TRPCError({ code: "BAD_GATEWAY", message });
      }

      await recordUserSync({
        userId: user.id,
        employeeNo: user.employeeNo,
        userName: user.name,
        deviceId: device.id,
        deviceLabel: device.label,
        operation: "fingerprint",
        status: "success",
        message: `Fingerprint ${input.fingerNo} enrolled on the device.`,
      });
      return {
        ok: true,
        fingerNo: input.fingerNo,
        deviceLabel: device.label,
      };
    }),
});
