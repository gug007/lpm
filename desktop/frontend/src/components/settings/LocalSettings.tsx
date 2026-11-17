import type { ReactNode } from "react";
import { LOCAL_MACHINE } from "../../settingsMachine";
import type { View } from "../../store/app";
import { SettingsLayout } from "./SettingsLayout";
import { useLocalSettingsTarget } from "./useLocalSettingsTarget";

export function LocalSettings({
  picker,
  subpage,
  onNavigate,
}: {
  picker: ReactNode;
  subpage?: ReactNode;
  onNavigate: (view: View) => void;
}) {
  const target = useLocalSettingsTarget();
  return <SettingsLayout machine={LOCAL_MACHINE} target={target} picker={picker} subpage={subpage} onNavigate={onNavigate} />;
}
