import type { PluginServerContext } from "@getpaseo/plugin/server";
import { promptButtonsSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(promptButtonsSettings);
  return () => {};
}
