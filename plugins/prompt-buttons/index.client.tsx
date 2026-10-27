import type { PluginClientContext } from "@getpaseo/plugin/client";
import { CUSTOM_ICONS } from "./client/icons";
import { installPromptPills } from "./client/pills";
import { PROMPT_BUTTONS_SCREEN, PromptButtonsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  const removeSettings = client.addSettingsScreen({
    id: PROMPT_BUTTONS_SCREEN,
    title: "Prompt buttons",
    icon: { svg: CUSTOM_ICONS[0]!.svg },
    Component: PromptButtonsScreen,
  });
  const removePills = installPromptPills(client);
  return () => {
    removePills();
    void removeSettings();
  };
}
