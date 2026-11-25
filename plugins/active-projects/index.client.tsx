import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createActiveProjectsView } from "./client/active-projects-view";
import { bringBackRpc, setAsideRpc, watchLaterSubscription } from "./shared/later";
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
      watchLater(onEntries) {
        const subscription = client.subscribe(watchLaterSubscription, {}, ({ entries }) => onEntries(entries));
        return () => void subscription.release();
      },
      async setAside(hostId, workspaceId, until) {
        await client.rpc(setAsideRpc, { hostId, workspaceId, until });
      },
      async bringBack(hostId, workspaceId) {
        await client.rpc(bringBackRpc, { hostId, workspaceId });
      },
    }),
  });
}
