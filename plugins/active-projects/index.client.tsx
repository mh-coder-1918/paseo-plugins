import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createActiveProjectsView } from "./client/active-projects-view";
import { openInFileManagerRpc, pluginHostRpc } from "./shared/rpc";

export default function contribute(client: PluginClientContext) {
  return client.addSidebarView({
    id: "active-projects",
    title: "Active projects",
    description: "Only projects with open workspaces, from every host",
    Component: createActiveProjectsView({
      async pluginHostId() {
        return (await client.rpc(pluginHostRpc, {})).serverId;
      },
      async openInFileManager(path) {
        await client.rpc(openInFileManagerRpc, { path });
      },
    }),
  });
}
