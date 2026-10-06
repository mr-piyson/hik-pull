import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import type {
  ManagedUser,
  ManagedUserType,
  UserSyncLogEntry,
} from "./user-types";

export type ManagedUserInput = {
  employeeNo: string;
  name: string;
  cardNo: string;
  userType: ManagedUserType;
  validFrom: string | null;
  validUntil: string | null;
};

type UserRow = {
  id: string;
  employeeNo: string;
  name: string;
  cardNo: string;
  userType: string;
  validFrom: string | null;
  validUntil: string | null;
  photoMimeType: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toManagedUser(row: UserRow): ManagedUser {
  return {
    ...row,
    userType: row.userType as ManagedUserType,
    photoUrl: row.photoMimeType ? `/api/users/${row.id}/photo` : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const rows = await prisma.user.findMany({
    select: {
      id: true,
      employeeNo: true,
      name: true,
      cardNo: true,
      userType: true,
      validFrom: true,
      validUntil: true,
      photoMimeType: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { employeeNo: "asc" }],
  });
  return rows.map(toManagedUser);
}

export async function getManagedUser(id: string): Promise<ManagedUser | null> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      employeeNo: true,
      name: true,
      cardNo: true,
      userType: true,
      validFrom: true,
      validUntil: true,
      photoMimeType: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return row ? toManagedUser(row) : null;
}

export async function saveManagedUserPhoto(
  id: string,
  photoData: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: { photoData, photoMimeType: "image/jpeg" },
  });
}

export async function getManagedUserPhoto(
  id: string,
): Promise<Uint8Array | null> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: { photoData: true },
  });
  return row?.photoData ? new Uint8Array(row.photoData) : null;
}

export async function createManagedUser(
  id: string,
  input: ManagedUserInput,
): Promise<ManagedUser> {
  const row = await prisma.user.create({ data: { id, ...input } });
  return toManagedUser(row);
}

export async function updateManagedUser(
  id: string,
  input: Omit<ManagedUserInput, "employeeNo">,
): Promise<ManagedUser> {
  const row = await prisma.user.update({ where: { id }, data: input });
  return toManagedUser(row);
}

export async function deleteManagedUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
}

export async function listUserSyncLogs(
  limit = 100,
): Promise<UserSyncLogEntry[]> {
  const rows = await prisma.userSyncLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toUserSyncLog);
}

export async function listUserSyncLogsForUser(
  userId: string,
): Promise<UserSyncLogEntry[]> {
  const rows = await prisma.userSyncLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(toUserSyncLog);
}

function toUserSyncLog(row: {
  id: string;
  userId: string | null;
  employeeNo: string;
  userName: string;
  deviceId: string | null;
  deviceLabel: string;
  operation: string;
  status: string;
  message: string | null;
  createdAt: Date;
}): UserSyncLogEntry {
  return {
    ...row,
    status: row.status === "success" ? "success" : "failure",
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordUserSync(
  entry: Omit<UserSyncLogEntry, "id" | "createdAt">,
): Promise<void> {
  await prisma.userSyncLog.create({
    data: {
      id: randomUUID(),
      ...entry,
    },
  });
}
