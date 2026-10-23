import type { PluginClientContext } from "@getpaseo/plugin/client";
import {
  ActiveProjectsSidebarItem,
  OPEN_WORKSPACE_SCREEN,
  OpenWorkspaceScreen,
} from "./client/active-projects-sidebar";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: OPEN_WORKSPACE_SCREEN, title: "Opening workspace", Component: OpenWorkspaceScreen });
  client.addSidebarHeaderItem({
    id: "active-projects",
    title: "Active projects",
    Component: ActiveProjectsSidebarItem,
  });
  return () => {};
}
