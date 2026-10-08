import { SettingsPanel } from "@/components/settings-panel";
import { getAppSettings, toPublicSettings } from "@/lib/hik/settings-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = toPublicSettings(await getAppSettings());
  return <SettingsPanel initialSettings={settings} />;
}
