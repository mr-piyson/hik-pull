import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/hik/db";
import { probeDevice, stopDevice } from "@/lib/hik/registry";
import {
  assertHost,
  assertPassword,
  assertPort,
  assertScheme,
  assertUsername,
  deleteDevice,
  getDevice,
  listDevices,
  saveDevice,
} from "@/lib/hik/store";
import { type DeviceRecord, toPublicDevice } from "@/lib/hik/types";
import { publicProcedure, router } from "../trpc";

const deviceInput = z.object({
  label: z.string().optional(),
  scheme: z.enum(["http", "https"]).optional(),
  host: z.string(),
  port: z.number().optional(),
  username: z.string(),
  password: z.string(),
});

const importDeviceInput = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  scheme: z.unknown().optional(),
  host: z.string(),
  port: z.number().optional(),
  username: z.string(),
  password: z.string(),
  createdAt: z.string().optional(),
});

function badRequest(error: unknown): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : String(error),
  });
}

function asDevice(input: z.infer<typeof deviceInput>): DeviceRecord {
  try {
    const port = input.port ?? 80;
    assertPort(port);
    return {
      id: randomUUID(),
      label: input.label?.trim() ?? "",
      scheme: assertScheme(input.scheme),
      host: assertHost(input.host),
      port,
      username: assertUsername(input.username),
      password: assertPassword(input.password),
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    return badRequest(error);
  }
}

export const devicesRouter = router({
  list: publicProcedure.query(async () => {
    const devices = await listDevices();
    return { devices: devices.map(toPublicDevice) };
  }),

  create: publicProcedure.input(deviceInput).mutation(async ({ input }) => {
    const device = asDevice(input);
    if (device.label.length === 0) {
      device.label = `${device.host}:${device.port}`;
    }

    const existing = await prisma.device.findFirst({
      where: { host: device.host },
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `A device with host "${device.host}" already exists.`,
      });
    }

    try {
      const info = await probeDevice(device);
      const saved = await saveDevice(device, {
        model: info.model,
        serial: info.serialNumber,
      });
      return { device: toPublicDevice(saved), info };
    } catch (error) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: `Could not authenticate against the device. Nothing was saved. ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }),

  import: publicProcedure
    .input(z.array(importDeviceInput))
    .mutation(async ({ input }) => {
      const saved: DeviceRecord[] = [];
      for (const raw of input) {
        let device: DeviceRecord;
        try {
          const port = raw.port ?? 80;
          assertPort(port);
          device = {
            id: raw.id ?? randomUUID(),
            label: raw.label ?? "",
            scheme: assertScheme(raw.scheme),
            host: assertHost(raw.host),
            port,
            username: assertUsername(raw.username),
            password: assertPassword(raw.password),
            createdAt: raw.createdAt ?? new Date().toISOString(),
          };
        } catch (error) {
          return badRequest(error);
        }
        saved.push(await saveDevice(device));
      }
      return { devices: saved.map(toPublicDevice) };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        label: z.string().optional(),
        password: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const device = await getDevice(input.id);
      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found.",
        });
      }

      const next = {
        ...device,
        label: input.label === undefined ? device.label : input.label.trim(),
        password:
          input.password && input.password.length > 0
            ? input.password
            : device.password,
      };

      const changedCredentials = next.password !== device.password;
      let metadata: { model: string; serial: string } | null = null;
      if (changedCredentials) {
        try {
          const info = await probeDevice(next);
          metadata = { model: info.model, serial: info.serialNumber };
        } catch (error) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `Could not authenticate with the new credentials. Nothing was changed. ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      const saved = await saveDevice(next, metadata ?? undefined);
      return { device: toPublicDevice(saved) };
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      stopDevice(input.id);
      const removed = await deleteDevice(input.id);
      if (!removed) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found.",
        });
      }
      return { ok: true };
    }),

  stopStream: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      if (!(await getDevice(input.id))) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found.",
        });
      }
      stopDevice(input.id);
      return { ok: true, status: "idle" as const };
    }),
});
