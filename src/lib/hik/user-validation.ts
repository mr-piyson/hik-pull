import type { ManagedUserInput } from "./user-store";
import {
  AUTHENTICATION_MODES,
  type AuthenticationMode,
  type AuthenticationType,
  GENDERS,
  type ManagedUser,
  type ManagedUserGender,
  type ManagedUserType,
  USER_TYPES,
} from "./user-types";

const EMPLOYEE_NO_RE = /^[A-Za-z0-9._-]{1,32}$/;
const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MAX_DEVICE_DATE_TIME = "2037-12-31T23:59";

function parseOptionalDateTime(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a local date and time.`);
  }
  const match = LOCAL_DATE_TIME_RE.exec(value);
  if (!match) {
    throw new Error(`${field} must use YYYY-MM-DDTHH:mm format.`);
  }
  if (field === "Valid from" && value > MAX_DEVICE_DATE_TIME) {
    throw new Error(
      `${field} must be on or before ${MAX_DEVICE_DATE_TIME.replace("T", " ")} because of terminal date limits.`,
    );
  }

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ),
  );
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day) ||
    Number(hour) > 23 ||
    Number(minute) > 59
  ) {
    throw new Error(`${field} is not a valid date and time.`);
  }
  return value;
}

function readString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required.`);
  }
  const result = value.trim();
  if (result.length === 0 || result.length > maxLength) {
    throw new Error(`${field} must be between 1 and ${maxLength} characters.`);
  }
  return result;
}

function readNonNegativeInteger(
  value: unknown,
  field: string,
  fallback = 0,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) {
    throw new Error(`${field} must be a whole number of at least 0.`);
  }
  return parsed;
}

function readBoolean(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be true or false.`);
  }
  return value;
}

function readType(value: unknown): ManagedUserType {
  if (
    typeof value === "string" &&
    USER_TYPES.includes(value as ManagedUserType)
  ) {
    return value as ManagedUserType;
  }
  throw new Error(`Person type must be one of: ${USER_TYPES.join(", ")}.`);
}

function readGender(value: unknown): ManagedUserGender {
  if (
    typeof value === "string" &&
    GENDERS.includes(value as ManagedUserGender)
  ) {
    return value as ManagedUserGender;
  }
  throw new Error(`Gender must be one of: ${GENDERS.join(", ")}.`);
}

function readAuthenticationType(value: unknown): AuthenticationType {
  if (value === "sameDevice" || value === "custom") {
    return value;
  }
  throw new Error("Authentication type must be Same as Device or Custom.");
}

function readAuthenticationMode(value: unknown): AuthenticationMode {
  if (
    typeof value === "string" &&
    AUTHENTICATION_MODES.includes(value as AuthenticationMode)
  ) {
    return value as AuthenticationMode;
  }
  throw new Error("Choose a supported authentication mode.");
}

function readCards(payload: Record<string, unknown>): string[] {
  const values =
    payload.cardNos === undefined
      ? payload.cardNo === undefined ||
        payload.cardNo === null ||
        payload.cardNo === ""
        ? []
        : [payload.cardNo]
      : payload.cardNos;
  if (!Array.isArray(values) || values.length > 5) {
    throw new Error("A person can have at most 5 cards.");
  }
  const cards = values
    .map((value, index) => {
      if (typeof value !== "string") {
        throw new Error(`Card ${index + 1} must be text.`);
      }
      const card = value.trim();
      if (card.length > 32) {
        throw new Error(
          `Card ${index + 1} must contain at most 32 characters.`,
        );
      }
      return card;
    })
    .filter(Boolean);
  if (new Set(cards).size !== cards.length) {
    throw new Error("Card numbers must be unique.");
  }
  return cards;
}

export function validateNewUser(value: unknown): ManagedUserInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object.");
  }
  const payload = value as Record<string, unknown>;
  const employeeNo = readString(payload.employeeNo, "Employee number", 32);
  if (!EMPLOYEE_NO_RE.test(employeeNo)) {
    throw new Error(
      "Employee number may contain only letters, numbers, dots, underscores, and hyphens.",
    );
  }
  const validFrom = parseOptionalDateTime(payload.validFrom, "Valid from");
  const longTermEffective = readBoolean(
    payload.longTermEffective,
    "Long-term effective",
  );
  const validUntil = parseOptionalDateTime(payload.validUntil, "Valid until");
  if (
    !longTermEffective &&
    validFrom &&
    validUntil &&
    validFrom >= validUntil
  ) {
    throw new Error("Valid until must be later than valid from.");
  }
  const authenticationType = readAuthenticationType(
    payload.authenticationType ?? "sameDevice",
  );

  return {
    employeeNo,
    name: readString(payload.name, "Name", 64),
    cardNos: readCards(payload),
    userType: readType(payload.userType),
    floorNumber: readNonNegativeInteger(payload.floorNumber, "Floor number"),
    roomNumber: readNonNegativeInteger(payload.roomNumber, "Room number"),
    gender: readGender(payload.gender ?? "unknown"),
    longTermEffective,
    isAdministrator: readBoolean(payload.isAdministrator, "Administrator"),
    visitTimes: readNonNegativeInteger(payload.visitTimes, "Visit times"),
    authenticationType,
    authenticationMode: readAuthenticationMode(
      payload.authenticationMode ?? "face",
    ),
    validFrom,
    validUntil,
  };
}

export function validateUserUpdate(
  value: unknown,
  current: ManagedUser,
): Omit<ManagedUserInput, "employeeNo"> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object.");
  }
  const payload = value as Record<string, unknown>;
  if (
    payload.employeeNo !== undefined &&
    payload.employeeNo !== current.employeeNo
  ) {
    throw new Error("Employee number cannot be changed after creation.");
  }

  const merged = validateNewUser({
    employeeNo: current.employeeNo,
    name: payload.name ?? current.name,
    cardNos: payload.cardNos ?? current.cardNos,
    userType: payload.userType ?? current.userType,
    floorNumber: payload.floorNumber ?? current.floorNumber,
    roomNumber: payload.roomNumber ?? current.roomNumber,
    gender: payload.gender ?? current.gender,
    longTermEffective: payload.longTermEffective ?? current.longTermEffective,
    isAdministrator: payload.isAdministrator ?? current.isAdministrator,
    visitTimes: payload.visitTimes ?? current.visitTimes,
    authenticationType:
      payload.authenticationType ?? current.authenticationType,
    authenticationMode:
      payload.authenticationMode ?? current.authenticationMode,
    validFrom:
      payload.validFrom === undefined ? current.validFrom : payload.validFrom,
    validUntil:
      payload.validUntil === undefined
        ? current.validUntil
        : payload.validUntil,
  });

  return {
    name: merged.name,
    cardNos: merged.cardNos,
    userType: merged.userType,
    floorNumber: merged.floorNumber,
    roomNumber: merged.roomNumber,
    gender: merged.gender,
    longTermEffective: merged.longTermEffective,
    isAdministrator: merged.isAdministrator,
    visitTimes: merged.visitTimes,
    authenticationType: merged.authenticationType,
    authenticationMode: merged.authenticationMode,
    validFrom: merged.validFrom,
    validUntil: merged.validUntil,
  };
}
