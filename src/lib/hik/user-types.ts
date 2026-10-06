export const USER_TYPES = ["normal", "visitor", "blackList"] as const;

export type ManagedUserType = (typeof USER_TYPES)[number];

export type ManagedUser = {
  id: string;
  employeeNo: string;
  name: string;
  cardNo: string;
  userType: ManagedUserType;
  validFrom: string | null;
  validUntil: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserSyncLogEntry = {
  id: string;
  userId: string | null;
  employeeNo: string;
  userName: string;
  deviceId: string | null;
  deviceLabel: string;
  operation: string;
  status: "success" | "failure";
  message: string | null;
  createdAt: string;
};

export type UserSyncResult = {
  deviceId: string;
  deviceLabel: string;
  ok: boolean;
  message: string;
};
