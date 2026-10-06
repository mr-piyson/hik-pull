import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import type {
  AuthenticationMode,
  AuthenticationType,
  ManagedUser,
  ManagedUserGender,
  ManagedUserType,
  UserSyncLogEntry,
} from "./user-types";

export type ManagedUserInput = {
  employeeNo: string;
  name: string;
  cardNos: string[];
  userType: ManagedUserType;
  floorNumber: number;
  roomNumber: number;
  gender: ManagedUserGender;
  longTermEffective: boolean;
  isAdministrator: boolean;
  visitTimes: number;
  authenticationType: AuthenticationType;
  authenticationMode: AuthenticationMode;
  validFrom: string | null;
  validUntil: string | null;
};

type UserRow = {
  id: string;
  employeeNo: string;
  name: string;
  cardNo: string;
  cardNosJson: string;
  userType: string;
  floorNumber: number;
  roomNumber: number;
  gender: string;
  longTermEffective: boolean;
  isAdministrator: boolean;
  visitTimes: number;
  authenticationType: string;
  authenticationMode: string;
  validFrom: string | null;
  validUntil: string | null;
  photoMimeType: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toManagedUser(row: UserRow): ManagedUser {
  const parsedCards: unknown = JSON.parse(row.cardNosJson);
  if (
    !Array.isArray(parsedCards) ||
    !parsedCards.every((card): card is string => typeof card === "string")
  ) {
    throw new Error(`Stored card list for user ${row.employeeNo} is invalid.`);
  }
  const cardNos =
    parsedCards.length > 0 ? parsedCards : row.cardNo ? [row.cardNo] : [];
  const { cardNosJson: _cardNosJson, photoMimeType, ...user } = row;
  return {
    ...user,
    cardNo: cardNos[0] ?? "",
    cardNos,
    userType: row.userType as ManagedUserType,
    gender: row.gender as ManagedUserGender,
    authenticationType: row.authenticationType as AuthenticationType,
    authenticationMode: row.authenticationMode as AuthenticationMode,
    photoUrl: photoMimeType ? `/api/users/${row.id}/photo` : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const userSelect = {
  id: true,
  employeeNo: true,
  name: true,
  cardNo: true,
  cardNosJson: true,
  userType: true,
  floorNumber: true,
  roomNumber: true,
  gender: true,
  longTermEffective: true,
  isAdministrator: true,
  visitTimes: true,
  authenticationType: true,
  authenticationMode: true,
  validFrom: true,
  validUntil: true,
  photoMimeType: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const rows = await prisma.user.findMany({
    select: userSelect,
    orderBy: [{ updatedAt: "desc" }, { employeeNo: "asc" }],
  });
  return rows.map(toManagedUser);
}

export async function getManagedUser(id: string): Promise<ManagedUser | null> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: userSelect,
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
  const { cardNos, ...userData } = input;
  const row = await prisma.user.create({
    data: {
      id,
      ...userData,
      cardNo: cardNos[0] ?? "",
      cardNosJson: JSON.stringify(cardNos),
    },
  });
  return toManagedUser(row);
}

export async function updateManagedUser(
  id: string,
  input: Omit<ManagedUserInput, "employeeNo">,
): Promise<ManagedUser> {
  const { cardNos, ...userData } = input;
  const row = await prisma.user.update({
    where: { id },
    data: {
      ...userData,
      cardNo: cardNos[0] ?? "",
      cardNosJson: JSON.stringify(cardNos),
    },
  });
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
