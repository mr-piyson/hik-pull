import type { ManagedUserInput } from "./user-store";
import {
  type ManagedUser,
  type ManagedUserType,
  USER_TYPES,
} from "./user-types";

const EMPLOYEE_NO_RE = /^[A-Za-z0-9._-]{1,32}$/;
const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

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

function readType(value: unknown): ManagedUserType {
  if (
    typeof value === "string" &&
    USER_TYPES.includes(value as ManagedUserType)
  ) {
    return value as ManagedUserType;
  }
  throw new Error(`User type must be one of: ${USER_TYPES.join(", ")}.`);
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
  const validUntil = parseOptionalDateTime(payload.validUntil, "Valid until");
  if (validFrom && validUntil && validFrom >= validUntil) {
    throw new Error("Valid until must be later than valid from.");
  }

  const cardNo =
    payload.cardNo === undefined || payload.cardNo === null
      ? ""
      : typeof payload.cardNo === "string"
        ? payload.cardNo.trim()
        : null;
  if (cardNo === null || cardNo.length > 32) {
    throw new Error("Card number must be a string of at most 32 characters.");
  }

  return {
    employeeNo,
    name: readString(payload.name, "Name", 64),
    cardNo,
    userType: readType(payload.userType),
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
    cardNo: payload.cardNo ?? current.cardNo,
    userType: payload.userType ?? current.userType,
    validFrom:
      payload.validFrom === undefined ? current.validFrom : payload.validFrom,
    validUntil:
      payload.validUntil === undefined
        ? current.validUntil
        : payload.validUntil,
  });

  return {
    name: merged.name,
    cardNo: merged.cardNo,
    userType: merged.userType,
    validFrom: merged.validFrom,
    validUntil: merged.validUntil,
  };
}
