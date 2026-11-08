"use client";

import {
  ArrowLeft,
  Camera,
  CreditCard,
  Fingerprint,
  IdCard,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRoundPlus,
  Users,
  Webcam,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/modal";
import { PageBody, PageHeader, SectionHeading } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate } from "@/lib/format";
import type { PublicDevice } from "@/lib/hik/types";
import {
  AUTHENTICATION_MODES,
  type AuthenticationMode,
  type AuthenticationType,
  GENDERS,
  type ManagedUser,
  type ManagedUserGender,
  type ManagedUserType,
  USER_TYPES,
  type UserSyncResult,
} from "@/lib/hik/user-types";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

type UserForm = {
  employeeNo: string;
  name: string;
  cardNos: { id: string; value: string }[];
  userType: ManagedUserType;
  floorNumber: string;
  roomNumber: string;
  gender: ManagedUserGender;
  longTermEffective: boolean;
  isAdministrator: boolean;
  visitTimes: string;
  authenticationType: AuthenticationType;
  authenticationMode: AuthenticationMode;
  validFrom: string;
  validUntil: string;
};

const EMPTY_FORM: UserForm = {
  employeeNo: "",
  name: "",
  cardNos: [{ id: "draft-0", value: "" }],
  userType: "normal",
  floorNumber: "0",
  roomNumber: "0",
  gender: "unknown",
  longTermEffective: true,
  isAdministrator: false,
  visitTimes: "0",
  authenticationType: "sameDevice",
  authenticationMode: "face",
  validFrom: "",
  validUntil: "",
};

const FINGER_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PAGE_SIZE = 10;

const TYPE_LABELS: Record<ManagedUserType, string> = {
  normal: "Normal",
  visitor: "Visitor",
  blackList: "Blocked",
};

const TYPE_TONES = {
  normal: "primary",
  visitor: "info",
  blackList: "danger",
} as const;

function toForm(user: ManagedUser): UserForm {
  return {
    employeeNo: user.employeeNo,
    name: user.name,
    cardNos:
      user.cardNos.length > 0
        ? user.cardNos.map((value, index) => ({ id: `saved-${index}`, value }))
        : [{ id: "draft-0", value: "" }],
    userType: user.userType,
    floorNumber: String(user.floorNumber),
    roomNumber: String(user.roomNumber),
    gender: user.gender,
    longTermEffective: user.longTermEffective,
    isAdministrator: user.isAdministrator,
    visitTimes: String(user.visitTimes),
    authenticationType: user.authenticationType,
    authenticationMode: user.authenticationMode,
    validFrom: user.validFrom ?? "",
    validUntil: user.validUntil ?? "",
  };
}

function authenticationLabel(mode: AuthenticationMode): string {
  const label = mode
    .replace(/([A-Z])/g, " $1")
    .replace(/\bFp\b/g, "Fingerprint")
    .replace(/\bPw\b/g, "Password")
    .replace(/\bFace\b/g, "Face")
    .replace(/\bCard\b/g, "Card")
    .replace(/\bOr\b/g, "or")
    .replace(/\bAnd\b/g, "and")
    .trim();
  return label[0].toUpperCase() + label.slice(1);
}

function syncSummary(results: UserSyncResult[]): string {
  if (results.length === 0) {
    return "Saved in the master database. No devices are configured to sync.";
  }
  const failed = results.filter((result) => !result.ok);
  return failed.length === 0
    ? `Synchronized to ${results.length} device${results.length === 1 ? "" : "s"}.`
    : `Saved locally; ${failed.length} of ${results.length} device sync${results.length === 1 ? "" : "s"} failed.`;
}

function isExpired(user: ManagedUser): boolean {
  if (!user.validUntil || user.longTermEffective) {
    return false;
  }
  return new Date(user.validUntil).getTime() < Date.now();
}

export function UserManagement({
  initialUsers,
  mode,
  initialUser,
}: {
  initialUsers: ManagedUser[];
  mode: "directory" | "create" | "edit";
  initialUser?: ManagedUser;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isDirectory = mode === "directory";
  const [editingId, setEditingId] = useState<string | null>(
    mode === "edit" ? (initialUser?.id ?? null) : null,
  );
  const [users, setUsers] = useState(initialUsers);
  const [devices, setDevices] = useState<PublicDevice[]>([]);
  const [form, setForm] = useState<UserForm>(() =>
    initialUser ? toForm(initialUser) : EMPTY_FORM,
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ManagedUserType | "all">("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fingerprintDeviceId, setFingerprintDeviceId] = useState("");
  const [fingerprintNo, setFingerprintNo] = useState("1");
  const [fingerprintBusy, setFingerprintBusy] = useState(false);
  const [fingerprintMessage, setFingerprintMessage] = useState<string | null>(
    null,
  );
  const [nextCardFieldId, setNextCardFieldId] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const editingUser = initialUser ?? null;
  const currentPhoto =
    photoPreview ?? savedPhotoUrl ?? editingUser?.photoUrl ?? null;

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photoFile]);

  useEffect(() => {
    let active = true;
    void trpc.devices.list
      .query()
      .then((payload) => {
        if (active) {
          setDevices(payload.devices);
          setFingerprintDeviceId(
            (current) => current || payload.devices[0]?.id || "",
          );
        }
      })
      .catch(() => {
        // Device loading is only needed for fingerprint enrollment; the page
        // itself still works without it.
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users
      .filter((user) => typeFilter === "all" || user.userType === typeFilter)
      .filter((user) => {
        if (!needle) {
          return true;
        }
        return (
          user.employeeNo.toLowerCase().includes(needle) ||
          user.name.toLowerCase().includes(needle) ||
          user.cardNos.some((cardNo) => cardNo.toLowerCase().includes(needle))
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [query, typeFilter, users]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const typeCounts = useMemo(() => {
    const counts: Record<ManagedUserType | "all", number> = {
      all: users.length,
      normal: 0,
      visitor: 0,
      blackList: 0,
    };
    for (const user of users) {
      counts[user.userType] += 1;
    }
    return counts;
  }, [users]);

  const updateForm = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const reload = async () => {
    const payload = await trpc.users.list.query();
    setUsers(payload.users);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    let savedUser: ManagedUser | null = null;
    try {
      const data = {
        ...form,
        cardNos: form.cardNos.map((card) => card.value.trim()).filter(Boolean),
        floorNumber: Number(form.floorNumber),
        roomNumber: Number(form.roomNumber),
        visitTimes: Number(form.visitTimes),
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
      };
      const payload = editingId
        ? await trpc.users.update.mutate({ id: editingId, data })
        : await trpc.users.create.mutate(data);
      savedUser = payload.user;
      let message = syncSummary(payload.results);
      if (photoFile) {
        const photoResponse = await fetch(
          `/api/users/${payload.user.id}/photo`,
          {
            method: "POST",
            headers: { "Content-Type": photoFile.type },
            body: photoFile,
          },
        );
        const photoPayload = (await photoResponse.json()) as {
          photoUrl?: string;
          sizeBytes?: number;
          results?: UserSyncResult[];
          error?: string;
        };
        if (!photoResponse.ok || photoPayload.sizeBytes === undefined) {
          setForm(toForm(savedUser));
          setEditingId(savedUser.id);
          setError(
            `Person saved, but the photo was not uploaded: ${photoPayload.error ?? "Photo upload failed."}`,
          );
          await reload();
          return;
        }
        setSavedPhotoUrl(
          photoPayload.photoUrl ?? `/api/users/${payload.user.id}/photo`,
        );
        message = `Photo optimized to ${(photoPayload.sizeBytes / 1024).toFixed(1)} KB. ${syncSummary(photoPayload.results ?? [])}`;
      }
      setPhotoFile(null);
      toast({
        title: editingId ? "Person updated" : "Person added",
        description: message,
        tone: payload.results.some((result) => !result.ok) ? "info" : "success",
      });
      if (!editingId) {
        router.push("/people");
        return;
      }
      setForm(toForm(savedUser));
      await reload();
      router.refresh();
    } catch (failure) {
      if (savedUser && photoFile) {
        setForm(toForm(savedUser));
        setEditingId(savedUser.id);
        setError(
          `Person saved, but the photo upload could not be confirmed. Retry the photo from this form. ${
            failure instanceof Error ? failure.message : ""
          }`,
        );
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not reach the app server.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const captureFingerprint = async () => {
    if (!editingId || !fingerprintDeviceId) {
      setFingerprintMessage("Save the person and choose a device first.");
      return;
    }
    setFingerprintBusy(true);
    setFingerprintMessage(
      "Waiting for the selected device sensor. Place the person's finger on its reader.",
    );
    try {
      const payload = await trpc.users.enrollFingerprint.mutate({
        id: editingId,
        deviceId: fingerprintDeviceId,
        fingerNo: Number(fingerprintNo),
      });
      setFingerprintMessage(
        `Fingerprint ${fingerprintNo} enrolled on ${payload.deviceLabel}. Repeat on each additional device if needed.`,
      );
    } catch (failure) {
      setFingerprintMessage(
        failure instanceof Error
          ? failure.message
          : "Fingerprint enrollment failed.",
      );
    } finally {
      setFingerprintBusy(false);
    }
  };

  const remove = async (user: ManagedUser) => {
    setBusyUserId(user.id);
    setError(null);
    try {
      const payload = await trpc.users.remove.mutate({ id: user.id });
      toast({
        title: payload.deleted ? "Person removed" : "Record retained",
        description: payload.deleted
          ? syncSummary(payload.results)
          : `At least one device did not confirm deletion. ${payload.results
              ?.filter((result) => !result.ok)
              .map((result) => `${result.deviceLabel}: ${result.message}`)
              .join(" ")}`,
        tone: payload.deleted ? "success" : "error",
      });
      setPendingDelete(null);
      await reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not reach the app server.",
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const retry = async (user: ManagedUser) => {
    setBusyUserId(user.id);
    setError(null);
    try {
      const payload = await trpc.users.sync.mutate({ id: user.id });
      const failed = payload.results.filter((result) => !result.ok).length;
      toast({
        title: failed === 0 ? "Sync complete" : `${failed} device sync failed`,
        description: syncSummary(payload.results),
        tone: failed === 0 ? "success" : "error",
      });
      await reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not reach the app server.",
      );
    } finally {
      setBusyUserId(null);
    }
  };

  if (isDirectory) {
    const title = editingId ? "Edit person" : "People";
    return (
      <PageBody>
        <PageHeader
          eyebrow="Directory"
          title={title}
          description="The database is the source of truth. Each save is pushed to every configured terminal, and failures are recorded per device."
          meta={
            <>
              <StatusPill tone="primary" icon={Users}>
                {users.length} {users.length === 1 ? "person" : "people"}
              </StatusPill>
              <StatusPill tone="neutral" icon={Webcam}>
                {devices.length}{" "}
                {devices.length === 1 ? "terminal" : "terminals"}
              </StatusPill>
            </>
          }
          actions={
            <ButtonLink href="/people/new">
              <UserRoundPlus data-icon="inline-start" aria-hidden="true" />
              Add person
            </ButtonLink>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/8 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="people-search"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, employee number or card"
                aria-label="Search people"
                className="h-9 pl-9"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </div>

            <ToggleGroup
              aria-label="Filter by person type"
              value={[typeFilter]}
              onValueChange={(values) => {
                const next = values[0];
                if (
                  next === "all" ||
                  next === "normal" ||
                  next === "visitor" ||
                  next === "blackList"
                ) {
                  setTypeFilter(next);
                  setPage(1);
                }
              }}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="all">
                All <Count value={typeCounts.all} />
              </ToggleGroupItem>
              <ToggleGroupItem value="normal">
                Normal <Count value={typeCounts.normal} />
              </ToggleGroupItem>
              <ToggleGroupItem value="visitor">
                Visitors <Count value={typeCounts.visitor} />
              </ToggleGroupItem>
              <ToggleGroupItem value="blackList">
                Blocked <Count value={typeCounts.blackList} />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="rounded-xl bg-card ring-1 ring-foreground/8">
              <Empty className="border-0 py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {users.length === 0 ? (
                      <Users aria-hidden="true" />
                    ) : (
                      <Search aria-hidden="true" />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    {users.length === 0
                      ? "No people in the directory"
                      : "No matching people"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {users.length === 0
                      ? "Add an identity once and it is provisioned to every terminal you connect."
                      : "Adjust the search text or the person-type filter."}
                  </EmptyDescription>
                </EmptyHeader>
                {users.length === 0 ? (
                  <EmptyContent>
                    <ButtonLink href="/people/new" size="sm">
                      <Plus data-icon="inline-start" aria-hidden="true" />
                      Add the first person
                    </ButtonLink>
                  </EmptyContent>
                ) : null}
              </Empty>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8">
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-10 pl-4">Person</TableHead>
                      <TableHead>Employee no.</TableHead>
                      <TableHead>Cards</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Validity</TableHead>
                      <TableHead className="pr-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleUsers.map((user) => {
                      const expired = isExpired(user);
                      return (
                        <TableRow key={user.id} className="group">
                          <TableCell className="pl-4">
                            <div className="flex items-center gap-3">
                              <Avatar
                                name={user.name}
                                src={user.photoUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium">
                                  {user.name}
                                </p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {user.floorNumber > 0 || user.roomNumber > 0
                                    ? `Floor ${user.floorNumber} · Room ${user.roomNumber}`
                                    : "No location assigned"}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {user.employeeNo}
                          </TableCell>
                          <TableCell>
                            {user.cardNos.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {user.cardNos.slice(0, 2).map((cardNo) => (
                                  <span
                                    key={cardNo}
                                    className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                                  >
                                    {cardNo}
                                  </span>
                                ))}
                                {user.cardNos.length > 2 ? (
                                  <span className="text-[11px] text-muted-foreground">
                                    +{user.cardNos.length - 2}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                None
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusPill
                              tone={TYPE_TONES[user.userType]}
                              className="capitalize"
                            >
                              {TYPE_LABELS[user.userType]}
                            </StatusPill>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs">
                                {user.longTermEffective
                                  ? "No expiry"
                                  : user.validUntil
                                    ? `Until ${formatDate(user.validUntil)}`
                                    : "Open-ended"}
                              </span>
                              {expired ? (
                                <StatusPill tone="warning">Expired</StatusPill>
                              ) : user.validFrom ? (
                                <span className="text-[11px] text-muted-foreground">
                                  From {formatDate(user.validFrom)}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="pr-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title="Push this person to every device"
                                aria-label={`Sync ${user.name}`}
                                disabled={busyUserId === user.id || busy}
                                onClick={() => void retry(user)}
                              >
                                <RefreshCw
                                  aria-hidden="true"
                                  className={
                                    busyUserId === user.id
                                      ? "animate-spin"
                                      : undefined
                                  }
                                />
                              </Button>
                              <ButtonLink
                                href={`/people/${user.id}/edit`}
                                variant="ghost"
                                size="icon-sm"
                                title="Edit person"
                                aria-label={`Edit ${user.name}`}
                              >
                                <Pencil aria-hidden="true" />
                              </ButtonLink>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                title="Delete person"
                                aria-label={`Delete ${user.name}`}
                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                disabled={busyUserId === user.id || busy}
                                onClick={() => setPendingDelete(user)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <ul className="divide-y md:hidden">
                {visibleUsers.map((user) => (
                  <li key={user.id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={user.name} src={user.photoUrl} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {user.name}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {user.employeeNo}
                        </p>
                      </div>
                      <StatusPill tone={TYPE_TONES[user.userType]}>
                        {TYPE_LABELS[user.userType]}
                      </StatusPill>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        {user.cardNos.length > 0
                          ? `${user.cardNos.length} card${user.cardNos.length === 1 ? "" : "s"}`
                          : "No cards"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {user.longTermEffective
                          ? "No expiry"
                          : `Valid until ${formatDate(user.validUntil)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={busyUserId === user.id}
                        onClick={() => void retry(user)}
                      >
                        <RefreshCw
                          data-icon="inline-start"
                          aria-hidden="true"
                          className={
                            busyUserId === user.id ? "animate-spin" : undefined
                          }
                        />
                        Sync
                      </Button>
                      <ButtonLink
                        href={`/people/${user.id}/edit`}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <Pencil data-icon="inline-start" aria-hidden="true" />
                        Edit
                      </ButtonLink>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${user.name}`}
                        className="text-destructive"
                        onClick={() => setPendingDelete(user)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {(safePage - 1) * PAGE_SIZE + 1}–
                    {Math.min(safePage * PAGE_SIZE, filteredUsers.length)}
                  </span>{" "}
                  of {filteredUsers.length}
                </p>
                <Pagination
                  page={safePage}
                  pageCount={pageCount}
                  onPageChange={setPage}
                />
              </div>
            </div>
          )}
        </section>

        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null);
            }
          }}
          title={`Delete ${pendingDelete?.name ?? "person"}?`}
          description="The record is removed from the master database and from every configured terminal. Access history is kept."
          confirmLabel="Delete person"
          tone="destructive"
          busy={busyUserId === pendingDelete?.id}
          onConfirm={() => {
            if (pendingDelete) {
              void remove(pendingDelete);
            }
          }}
        >
          <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
            <Avatar name={pendingDelete?.name ?? "?"} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {pendingDelete?.name}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {pendingDelete?.employeeNo}
              </p>
            </div>
          </div>
        </ConfirmDialog>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title={editingId ? "Edit person" : "Add person"}
        description={
          editingId
            ? "Update identity, credentials and authentication. Saving pushes the change to every configured terminal."
            : "Create a master record once; it is provisioned to every terminal you connect."
        }
        actions={
          <ButtonLink href="/people" variant="outline">
            <ArrowLeft data-icon="inline-start" aria-hidden="true" />
            Back to people
          </ButtonLink>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-xl bg-card ring-1 ring-foreground/8">
              <SectionHeading
                title="Identity"
                description="How this person is known in the directory"
                icon={IdCard}
                className="border-b px-5 py-4"
              />
              <div className="p-5">
                <FieldGroup className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="employee-no">
                      Employee ID <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="employee-no"
                      required
                      maxLength={32}
                      value={form.employeeNo}
                      disabled={Boolean(editingId)}
                      onChange={(event) =>
                        updateForm("employeeNo", event.target.value)
                      }
                      placeholder="5738"
                      autoComplete="off"
                      className="font-mono"
                    />
                    <FieldDescription>
                      {editingId
                        ? "The employee ID identifies the person on every device and cannot change."
                        : "Must be unique across the directory."}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="person-name">
                      Full name <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="person-name"
                      required
                      maxLength={64}
                      value={form.name}
                      onChange={(event) =>
                        updateForm("name", event.target.value)
                      }
                      placeholder="Jane Doe"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="visit-times">Visit limit</FieldLabel>
                    <Input
                      id="visit-times"
                      type="number"
                      min={0}
                      max={2147483647}
                      value={form.visitTimes}
                      onChange={(event) =>
                        updateForm("visitTimes", event.target.value)
                      }
                    />
                    <FieldDescription>
                      Applies to visitor passes; 0 is unlimited.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="floor-number">Floor</FieldLabel>
                    <Input
                      id="floor-number"
                      type="number"
                      min={0}
                      max={2147483647}
                      value={form.floorNumber}
                      onChange={(event) =>
                        updateForm("floorNumber", event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="room-number">Room</FieldLabel>
                    <Input
                      id="room-number"
                      type="number"
                      min={0}
                      max={2147483647}
                      value={form.roomNumber}
                      onChange={(event) =>
                        updateForm("roomNumber", event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldTitle>Gender</FieldTitle>
                    <ToggleGroup
                      aria-label="Gender"
                      value={[form.gender]}
                      onValueChange={(values) => {
                        const gender = GENDERS.find(
                          (option) => option === values[0],
                        );
                        if (gender) {
                          updateForm("gender", gender);
                        }
                      }}
                      variant="outline"
                    >
                      {GENDERS.map((gender) => (
                        <ToggleGroupItem
                          key={gender}
                          value={gender}
                          className="flex-1 capitalize"
                        >
                          {gender}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </Field>
                </FieldGroup>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <FieldSet className="rounded-lg border bg-muted/30 p-4">
                    <FieldLegend variant="label">Person type</FieldLegend>
                    <ToggleGroup
                      aria-label="Person type"
                      value={[form.userType]}
                      onValueChange={(values) => {
                        const type = USER_TYPES.find(
                          (option) => option === values[0],
                        );
                        if (type) {
                          updateForm("userType", type);
                        }
                      }}
                      variant="outline"
                    >
                      {USER_TYPES.map((type) => (
                        <ToggleGroupItem
                          key={type}
                          value={type}
                          className="flex-1"
                        >
                          {TYPE_LABELS[type]}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <FieldDescription>
                      Blocked people are denied at the terminal regardless of
                      credential.
                    </FieldDescription>
                  </FieldSet>

                  <FieldSet className="rounded-lg border bg-muted/30 p-4">
                    <FieldLegend variant="label">Options</FieldLegend>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor="long-term-effective"
                          className="min-w-0 cursor-pointer"
                        >
                          <span className="block text-sm font-medium">
                            Long-term effective
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Ignore the validity end date
                          </span>
                        </label>
                        <Checkbox
                          id="long-term-effective"
                          checked={form.longTermEffective}
                          onCheckedChange={(checked) =>
                            updateForm("longTermEffective", checked === true)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <label
                          htmlFor="user-administrator"
                          className="min-w-0 cursor-pointer"
                        >
                          <span className="block text-sm font-medium">
                            Device administrator
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Allow local device UI privileges
                          </span>
                        </label>
                        <Checkbox
                          id="user-administrator"
                          checked={form.isAdministrator}
                          onCheckedChange={(checked) =>
                            updateForm("isAdministrator", checked === true)
                          }
                        />
                      </div>
                    </div>
                  </FieldSet>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="valid-from">
                      Valid from (device local time)
                    </FieldLabel>
                    <Input
                      id="valid-from"
                      type="datetime-local"
                      max="2037-12-31T23:59"
                      disabled={form.longTermEffective}
                      value={form.validFrom}
                      onChange={(event) =>
                        updateForm("validFrom", event.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="valid-until">
                      Valid until (device local time)
                    </FieldLabel>
                    <Input
                      id="valid-until"
                      type="datetime-local"
                      max="2037-12-31T23:59"
                      disabled={form.longTermEffective}
                      value={form.validUntil}
                      onChange={(event) =>
                        updateForm("validUntil", event.target.value)
                      }
                    />
                    <FieldDescription>
                      Terminals cap dates at 2037-12-31 23:59.
                    </FieldDescription>
                  </Field>
                </div>
              </div>
            </section>

            <section className="rounded-xl bg-card ring-1 ring-foreground/8">
              <SectionHeading
                title="Credentials"
                description="Face, card and fingerprint enrollment"
                icon={ShieldCheck}
                className="border-b px-5 py-4"
              />
              <div className="grid gap-5 p-5 lg:grid-cols-2">
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="flex items-center gap-1.5 text-sm font-medium">
                        <Camera
                          aria-hidden="true"
                          className="size-4 text-muted-foreground"
                        />
                        Face photo
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        JPEG, PNG, WebP or AVIF. Compressed below 200 KB before
                        enrollment.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {currentPhoto ? (
                      // Plain img: the source is either a blob: preview or a
                      // same-origin API route already sized for display.
                      // biome-ignore lint/performance/noImgElement: blob preview cannot be optimized.
                      <img
                        src={currentPhoto}
                        alt="Face preview"
                        width={72}
                        height={72}
                        className="size-16 rounded-xl bg-background object-cover ring-1 ring-foreground/10"
                      />
                    ) : (
                      <div className="grid size-16 place-items-center rounded-xl border border-dashed bg-background text-muted-foreground">
                        <Camera aria-hidden="true" className="size-5" />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <label
                        htmlFor="face-photo"
                        className="inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted focus-within:ring-3 focus-within:ring-ring/40"
                      >
                        <Camera aria-hidden="true" className="size-4" />
                        Choose image
                        <input
                          id="face-photo"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          className="sr-only"
                          onChange={(event) =>
                            setPhotoFile(event.target.files?.[0] ?? null)
                          }
                        />
                      </label>
                      {photoFile ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {photoFile.name} ·{" "}
                          {(photoFile.size / 1024).toFixed(0)} KB
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Original file stays on your machine until you save.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-1.5 text-sm font-medium">
                        <CreditCard
                          aria-hidden="true"
                          className="size-4 text-muted-foreground"
                        />
                        Cards
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Up to 5 cards per person.
                      </p>
                    </div>
                    <Button
                      type="button"
                      disabled={form.cardNos.length >= 5}
                      onClick={() => {
                        updateForm("cardNos", [
                          ...form.cardNos,
                          { id: `draft-${nextCardFieldId}`, value: "" },
                        ]);
                        setNextCardFieldId((current) => current + 1);
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <Plus data-icon="inline-start" aria-hidden="true" />
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {form.cardNos.map((card, index) => (
                      <div key={card.id} className="flex gap-2">
                        <Input
                          maxLength={32}
                          value={card.value}
                          onChange={(event) =>
                            updateForm(
                              "cardNos",
                              form.cardNos.map((entry, cardIndex) =>
                                cardIndex === index
                                  ? { ...entry, value: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          placeholder={`Card ${index + 1} number`}
                          autoComplete="off"
                          aria-label={`Card ${index + 1} number`}
                          className="min-w-0 flex-1 font-mono"
                        />
                        {form.cardNos.length > 1 ? (
                          <Button
                            type="button"
                            onClick={() =>
                              updateForm(
                                "cardNos",
                                form.cardNos.filter(
                                  (_, cardIndex) => cardIndex !== index,
                                ),
                              )
                            }
                            aria-label={`Remove card ${index + 1}`}
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 lg:col-span-2">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-sm font-medium">
                      <Fingerprint
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                      Fingerprint
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Templates are stored per terminal. Capture starts the
                      selected device&apos;s physical sensor.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field className="min-w-52 flex-1">
                      <FieldLabel>Device</FieldLabel>
                      <Select
                        value={fingerprintDeviceId || null}
                        onValueChange={(value) =>
                          setFingerprintDeviceId(value ?? "")
                        }
                        disabled={devices.length === 0}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              devices.length === 0
                                ? "No configured devices"
                                : "Select a device"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {devices.map((device) => (
                              <SelectItem key={device.id} value={device.id}>
                                {device.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field className="w-36">
                      <FieldLabel>Finger slot</FieldLabel>
                      <Select
                        value={fingerprintNo}
                        onValueChange={(value) => {
                          if (value) {
                            setFingerprintNo(value);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {FINGER_SLOTS.map((slot) => (
                              <SelectItem key={slot} value={String(slot)}>
                                Finger {slot}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Button
                      type="button"
                      onClick={() => void captureFingerprint()}
                      disabled={
                        fingerprintBusy || !editingId || !fingerprintDeviceId
                      }
                      variant="outline"
                    >
                      {fingerprintBusy ? (
                        <LoaderCircle
                          data-icon="inline-start"
                          aria-hidden="true"
                          className="animate-spin"
                        />
                      ) : (
                        <Fingerprint
                          data-icon="inline-start"
                          aria-hidden="true"
                        />
                      )}
                      {fingerprintBusy ? "Waiting for finger…" : "Capture"}
                    </Button>
                    {fingerprintMessage ? (
                      <output className="w-full text-xs text-muted-foreground">
                        {fingerprintMessage}
                      </output>
                    ) : !editingId ? (
                      <p className="w-full text-xs text-muted-foreground">
                        Save the person first to enroll a fingerprint.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl bg-card ring-1 ring-foreground/8">
              <SectionHeading
                title="Authentication"
                description="How the terminal verifies this person"
                icon={ShieldCheck}
                className="border-b px-5 py-4"
              />
              <div className="flex flex-col gap-4 p-5">
                <FieldSet>
                  <FieldLegend variant="label">Authentication type</FieldLegend>
                  <ToggleGroup
                    aria-label="Authentication type"
                    value={[form.authenticationType]}
                    onValueChange={(values) => {
                      const value = values[0];
                      if (value === "sameDevice" || value === "custom") {
                        updateForm("authenticationType", value);
                      }
                    }}
                    variant="outline"
                  >
                    <ToggleGroupItem value="sameDevice">
                      Same as device
                    </ToggleGroupItem>
                    <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
                  </ToggleGroup>
                </FieldSet>
                <Field className="max-w-xl">
                  <FieldLabel htmlFor="authentication-mode">
                    Verification mode
                  </FieldLabel>
                  <Select
                    value={form.authenticationMode}
                    disabled={form.authenticationType !== "custom"}
                    onValueChange={(value) => {
                      if (
                        value &&
                        AUTHENTICATION_MODES.includes(
                          value as AuthenticationMode,
                        )
                      ) {
                        updateForm(
                          "authenticationMode",
                          value as AuthenticationMode,
                        );
                      }
                    }}
                  >
                    <SelectTrigger id="authentication-mode" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {AUTHENTICATION_MODES.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {authenticationLabel(mode)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Same as device leaves the terminal&apos;s own verification
                    mode untouched. Custom sends the selected mode to every
                    terminal.
                  </FieldDescription>
                </Field>
              </div>
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/8">
              <div className="flex items-center gap-3">
                <Avatar
                  name={form.name || "New person"}
                  src={currentPhoto}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {form.name || "Unnamed person"}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {form.employeeNo || "No employee ID"}
                  </p>
                </div>
              </div>
              <dl className="mt-4 flex flex-col gap-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-medium">{TYPE_LABELS[form.userType]}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Cards</dt>
                  <dd className="font-mono font-medium">
                    {form.cardNos.filter((card) => card.value.trim()).length}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Validity</dt>
                  <dd className="font-medium">
                    {form.longTermEffective
                      ? "Long-term"
                      : form.validUntil
                        ? formatDate(form.validUntil)
                        : "Open"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Verification</dt>
                  <dd className="max-w-[9rem] truncate text-right font-medium">
                    {form.authenticationType === "sameDevice"
                      ? "Device default"
                      : authenticationLabel(form.authenticationMode)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/8">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Webcam
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                Sync targets
              </h3>
              {devices.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No terminals configured yet. The person is saved to the master
                  database and synced once a device is added.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {devices.map((device) => (
                    <li
                      key={device.id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-2.5 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            device.status === "online"
                              ? "bg-success"
                              : "bg-muted-foreground/50",
                          )}
                        />
                        <span className="truncate text-xs font-medium">
                          {device.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground capitalize">
                        {device.gateDirection}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
                Every save is pushed to all terminals; per-device results are
                kept in sync history.
              </p>
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-xl lg:border lg:px-5">
          <p className="text-xs text-muted-foreground">
            {devices.length === 0
              ? "No devices configured — the record is saved locally only."
              : `Saving pushes to ${devices.length} device${devices.length === 1 ? "" : "s"}.`}
          </p>
          <div className="flex items-center gap-2">
            <ButtonLink href="/people" variant="outline">
              Cancel
            </ButtonLink>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : null}
              {busy
                ? "Saving and syncing…"
                : editingId
                  ? "Save changes"
                  : "Add person"}
            </Button>
          </div>
        </div>
      </form>
    </PageBody>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
      {value}
    </span>
  );
}
