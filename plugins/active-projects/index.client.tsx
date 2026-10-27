import type { PluginClientContext } from "@getpaseo/plugin/client";
import {
  OPEN_WORKSPACE_SCREEN,
  OpenWorkspaceScreen,
  createActiveProjectsSidebarItem,
} from "./client/active-projects-sidebar";
import { installNativeWorkspacesStyle } from "./client/native-workspaces";
import { openInFileManagerRpc } from "./shared/rpc";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: OPEN_WORKSPACE_SCREEN, title: "Opening workspace", Component: OpenWorkspaceScreen });
  client.addSidebarHeaderItem({
    id: "active-projects",
    title: "Active projects",
    Component: createActiveProjectsSidebarItem({
      async openInFileManager(path) {
        await client.rpc(openInFileManagerRpc, { path });
      },
    }),
  });
  return installNativeWorkspacesStyle();
}
