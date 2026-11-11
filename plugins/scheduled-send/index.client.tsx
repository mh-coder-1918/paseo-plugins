import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installSendLaterPills } from "./client/pills";

export default function contribute(client: PluginClientContext) {
  return installSendLaterPills(client);
}
