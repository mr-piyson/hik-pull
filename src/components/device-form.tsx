"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type GateDirection, isGateDirection, type PublicDevice } from "@/lib/hik/types";
import { trpc } from "@/trpc/client";
import Link from "next/link";

type FormState = {
  label: string;
  host: string;
  port: string;
  scheme: "http" | "https";
  username: string;
  password: string;
  gateDirection: GateDirection;
};

const EMPTY: FormState = {
  label: "",
  host: "",
  port: "80",
  scheme: "http",
  username: "admin",
  password: "",
  gateDirection: "none",
};

function toFormState(device: PublicDevice): FormState {
  return {
    label: device.label ?? "",
    host: device.host ?? "",
    port: String(device.port ?? 80),
    scheme: device.scheme ?? "http",
    username: device.username ?? "admin",
    password: "",
    gateDirection: device.gateDirection ?? "none",
  };
}

export function DeviceForm({
  mode,
  initialDevice,
}: {
  mode: "create" | "edit";
  initialDevice?: PublicDevice;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    initialDevice ? toFormState(initialDevice) : EMPTY,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        await trpc.devices.create.mutate({
          ...form,
          port: Number(form.port),
        });
        router.push("/devices");
        return;
      }
      if (!initialDevice) {
        throw new Error("Missing device to edit");
      }
      await trpc.devices.update.mutate({
        id: initialDevice.id,
        label: form.label,
        scheme: form.scheme,
        host: form.host,
        port: Number(form.port),
        username: form.username,
        password: form.password.length > 0 ? form.password : undefined,
        gateDirection: form.gateDirection,
      });
      router.push("/devices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the app server.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "create" ? "Add device" : "Edit device";
  const description =
    mode === "create"
      ? "Connect a device on the local network."
      : "Update connection details and configuration.";

  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Infrastructure</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <Link href="/devices">
          <Button variant="outline">Back to devices</Button>
        </Link>
      </header>

      <form onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              Credentials stay on the server and are never shown back in the browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-5">
              <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <Field className="lg:col-span-2">
                  <FieldLabel htmlFor="device-host">IP address / hostname</FieldLabel>
                  <Input
                    id="device-host"
                    required
                    value={form.host}
                    onChange={(event) => update("host", event.target.value)}
                    placeholder="192.168.1.64"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="device-label">Label</FieldLabel>
                  <Input
                    id="device-label"
                    value={form.label}
                    onChange={(event) => update("label", event.target.value)}
                    placeholder="Front door"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="device-direction">Attendance direction</FieldLabel>
                  <Select
                    value={form.gateDirection}
                    onValueChange={(value) => {
                      if (value && isGateDirection(value)) {
                        update("gateDirection", value);
                      }
                    }}
                  >
                    <SelectTrigger id="device-direction" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="in">In</SelectItem>
                        <SelectItem value="out">Out</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="device-username">Username</FieldLabel>
                  <Input
                    id="device-username"
                    required
                    value={form.username}
                    onChange={(event) => update("username", event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="device-password">
                    {mode === "edit" ? "Password (leave blank to keep)" : "Password"}
                  </FieldLabel>
                  <Input
                    id="device-password"
                    required={mode === "create"}
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(event) => update("password", event.target.value)}
                    autoComplete={mode === "create" ? "new-password" : "off"}
                    className="font-mono"
                  />
                </Field>
                <Field className="sm:col-span-2 lg:col-span-3">
                  <FieldLabel>Connection</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Port"
                      value={form.port}
                      onChange={(event) =>
                        update("port", event.target.value.replace(/\D/g, ""))
                      }
                      inputMode="numeric"
                      className="w-24 font-mono"
                    />
                    <Select
                      value={form.scheme}
                      onValueChange={(value) => {
                        if (value === "http" || value === "https") {
                          update("scheme", value);
                        }
                      }}
                    >
                      <SelectTrigger aria-label="Scheme" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="http">http</SelectItem>
                          <SelectItem value="https">https</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Field orientation="horizontal" className="ml-2 items-center">
                      <Checkbox
                        id="show-device-password"
                        checked={showPassword}
                        onCheckedChange={(checked) => setShowPassword(checked === true)}
                      />
                      <FieldLabel htmlFor="show-device-password">Show password</FieldLabel>
                    </Field>
                  </div>
                </Field>
              </FieldGroup>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2">
            <Link href="/devices">
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={busy}>
              {busy
                ? mode === "create"
                  ? "Testing connection…"
                  : "Saving…"
                : mode === "create"
                  ? "Add device"
                  : "Save changes"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </main>
  );
}
