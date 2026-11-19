import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const openInFileManagerRpc = defineRpc({
  name: "workspace.open-in-file-manager",
  input: z.object({ path: z.string().min(1) }),
  output: z.object({ opened: z.boolean() }),
});

/** The server id of the daemon this plugin runs on. Sidebar views are not told their host. */
export const pluginHostRpc = defineRpc({
  name: "host.self",
  input: z.object({}),
  output: z.object({ serverId: z.string() }),
});
