import {
  deleteFaceImage,
  HikRequestError,
  isapiCommand,
  uploadFaceImage,
} from "./client";
import { listDevices } from "./store";
import type { DeviceRecord } from "./types";
import { getManagedUserPhoto, recordUserSync } from "./user-store";
import type { ManagedUser, UserSyncResult } from "./user-types";

type SyncOperation = "create" | "update" | "delete" | "retry" | "photo";
const MAX_DEVICE_DATE_TIME = "2037-12-31T23:59";

function getErrorMessage(error: unknown): string {
  if (error instanceof HikRequestError && error.deviceMessage) {
    return `${error.message}: ${error.deviceMessage}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function isAlreadyAbsent(error: unknown): boolean {
  if (error instanceof HikRequestError && error.status === 404) {
    return true;
  }
  const message = getErrorMessage(error).toLowerCase();
  return /not.?exist|not.?found|no.?such|does.?not.?exist/.test(message);
}

function canTryAlternate(error: unknown): boolean {
  if (!(error instanceof HikRequestError)) {
    return false;
  }
  const message = `${error.message} ${error.deviceMessage ?? ""}`.toLowerCase();
  return (
    error.status === 404 ||
    error.status === 405 ||
    /already.?exist|duplicate|not.?exist|not.?found|employee.?no.?not.?exist/.test(
      message,
    )
  );
}

async function commandWithAlternate(
  device: DeviceRecord,
  primary: { path: string; method: "POST" | "PUT"; json: unknown },
  alternate: { path: string; method: "POST" | "PUT"; json: unknown },
): Promise<void> {
  try {
    await isapiCommand(device, primary.path, {
      method: primary.method,
      json: primary.json,
    });
  } catch (firstError) {
    if (!canTryAlternate(firstError)) {
      throw firstError;
    }
    try {
      await isapiCommand(device, alternate.path, {
        method: alternate.method,
        json: alternate.json,
      });
    } catch (secondError) {
      throw new Error(
        `${getErrorMessage(firstError)}; alternate operation failed: ${getErrorMessage(secondError)}`,
      );
    }
  }
}

function userInfoPayload(user: ManagedUser) {
  const localToday = new Date();
  const currentDayStart = `${localToday.getFullYear()}-${String(
    localToday.getMonth() + 1,
  ).padStart(
    2,
    "0",
  )}-${String(localToday.getDate()).padStart(2, "0")}T00:00:00`;
  if (user.validFrom && user.validFrom > MAX_DEVICE_DATE_TIME) {
    throw new Error(
      `Valid from cannot be after ${MAX_DEVICE_DATE_TIME.replace("T", " ")} because of terminal date limits.`,
    );
  }
  const endTime =
    user.validUntil && user.validUntil > MAX_DEVICE_DATE_TIME
      ? "2037-12-31T23:59:59"
      : user.validUntil
        ? `${user.validUntil}:00`
        : "2037-12-31T23:59:59";
  return {
    UserInfo: {
      employeeNo: user.employeeNo,
      name: user.name,
      userType: user.userType,
      doorRight: "1",
      RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
      userVerifyMode: "",
      localUIRight: false,
      Valid: {
        enable: true,
        beginTime: user.validFrom ? `${user.validFrom}:00` : currentDayStart,
        endTime,
        timeType: "local",
      },
    },
  };
}

async function syncPerson(
  device: DeviceRecord,
  user: ManagedUser,
  previousCardNo: string,
): Promise<void> {
  const userJson = userInfoPayload(user);
  await commandWithAlternate(
    device,
    {
      path: "/ISAPI/AccessControl/UserInfo/Modify?format=json",
      method: "PUT",
      json: userJson,
    },
    {
      path: "/ISAPI/AccessControl/UserInfo/Record?format=json",
      method: "POST",
      json: userJson,
    },
  );

  if (user.cardNo.length > 0) {
    const cardJson = {
      CardInfo: {
        employeeNo: user.employeeNo,
        cardNo: user.cardNo,
        cardType: "normalCard",
      },
    };
    await commandWithAlternate(
      device,
      {
        path: "/ISAPI/AccessControl/CardInfo/Modify?format=json",
        method: "PUT",
        json: cardJson,
      },
      {
        path: "/ISAPI/AccessControl/CardInfo/Record?format=json",
        method: "POST",
        json: cardJson,
      },
    );
    if (previousCardNo && previousCardNo !== user.cardNo) {
      await isapiCommand(
        device,
        "/ISAPI/AccessControl/CardInfo/Delete?format=json",
        {
          method: "PUT",
          json: {
            CardInfoDelCond: {
              CardNoList: [{ cardNo: previousCardNo }],
            },
          },
        },
      );
    }
  } else if (previousCardNo.length > 0) {
    await isapiCommand(
      device,
      "/ISAPI/AccessControl/CardInfo/Delete?format=json",
      {
        method: "PUT",
        json: {
          CardInfoDelCond: {
            EmployeeNoList: [{ employeeNo: user.employeeNo }],
          },
        },
      },
    );
  }
}

async function removePerson(
  device: DeviceRecord,
  user: ManagedUser,
  hasPhoto: boolean,
): Promise<void> {
  const failures: string[] = [];

  if (hasPhoto) {
    try {
      await deleteFaceImage(device, user.employeeNo);
    } catch (error) {
      if (!isAlreadyAbsent(error)) {
        failures.push(`Face photo: ${getErrorMessage(error)}`);
      }
    }
  }
  if (user.cardNo) {
    try {
      await isapiCommand(
        device,
        "/ISAPI/AccessControl/CardInfo/Delete?format=json",
        {
          method: "PUT",
          json: {
            CardInfoDelCond: {
              EmployeeNoList: [{ employeeNo: user.employeeNo }],
            },
          },
        },
      );
    } catch (error) {
      if (!isAlreadyAbsent(error)) {
        failures.push(`Card: ${getErrorMessage(error)}`);
      }
    }
  }
  try {
    await isapiCommand(
      device,
      "/ISAPI/AccessControl/UserInfo/Delete?format=json",
      {
        method: "PUT",
        json: {
          UserInfoDelCond: {
            EmployeeNoList: [{ employeeNo: user.employeeNo }],
          },
        },
      },
    );
  } catch (error) {
    if (!isAlreadyAbsent(error)) {
      failures.push(`User: ${getErrorMessage(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
}

async function syncAcrossDevices(
  user: ManagedUser,
  operation: SyncOperation,
  previousCardNo = user.cardNo,
  suppliedPhoto?: Uint8Array,
): Promise<UserSyncResult[]> {
  const [devices, storedPhoto] = await Promise.all([
    listDevices(),
    operation === "delete" || operation === "photo"
      ? Promise.resolve(null)
      : getManagedUserPhoto(user.id),
  ]);
  const photo = suppliedPhoto ?? storedPhoto;
  return Promise.all(
    devices.map(async (device) => {
      let message: string;
      let ok = false;
      try {
        if (operation === "delete") {
          await removePerson(device, user, user.photoUrl !== null);
        } else {
          if (operation !== "photo") {
            await syncPerson(device, user, previousCardNo);
          }
          if (photo) {
            await uploadFaceImage(device, {
              employeeNo: user.employeeNo,
              name: user.name,
              image: photo,
            });
          }
        }
        ok = true;
        message =
          operation === "delete"
            ? "User and linked credentials removed."
            : operation === "photo"
              ? "Face photo synchronized."
              : "Identity and card details synchronized.";
      } catch (error) {
        message = getErrorMessage(error);
      }

      await recordUserSync({
        userId: user.id,
        employeeNo: user.employeeNo,
        userName: user.name,
        deviceId: device.id,
        deviceLabel: device.label,
        operation,
        status: ok ? "success" : "failure",
        message,
      });

      return {
        deviceId: device.id,
        deviceLabel: device.label,
        ok,
        message,
      };
    }),
  );
}

export function syncUserToDevices(
  user: ManagedUser,
  operation: Exclude<SyncOperation, "delete" | "photo">,
  previousCardNo = user.cardNo,
): Promise<UserSyncResult[]> {
  return syncAcrossDevices(user, operation, previousCardNo);
}

export function syncUserPhotoToDevices(
  user: ManagedUser,
  photo: Uint8Array<ArrayBuffer>,
): Promise<UserSyncResult[]> {
  return syncAcrossDevices(user, "photo", user.cardNo, photo);
}

export function deleteUserFromDevices(
  user: ManagedUser,
): Promise<UserSyncResult[]> {
  return syncAcrossDevices(user, "delete", "");
}
