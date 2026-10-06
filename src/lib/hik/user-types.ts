export const USER_TYPES = ["normal", "visitor", "blackList"] as const;

export type ManagedUserType = (typeof USER_TYPES)[number];
export const GENDERS = ["male", "female", "unknown"] as const;
export type ManagedUserGender = (typeof GENDERS)[number];
export const AUTHENTICATION_MODES = [
  "face",
  "faceAndCard",
  "faceAndFp",
  "faceAndFpAndCard",
  "faceAndPw",
  "faceAndPwAndFp",
  "faceOrFpOrCardOrPw",
  "fp",
  "fpAndCard",
  "fpAndCardAndPw",
  "fpAndPw",
  "fpOrCard",
  "fpOrFace",
  "card",
  "cardAndPw",
  "cardOrFace",
  "cardOrFaceOrFp",
] as const;
export type AuthenticationMode = (typeof AUTHENTICATION_MODES)[number];
export type AuthenticationType = "sameDevice" | "custom";

export type ManagedUser = {
  id: string;
  employeeNo: string;
  name: string;
  cardNo: string;
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
