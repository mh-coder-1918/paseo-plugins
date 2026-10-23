import type { PluginTheme } from "@getpaseo/plugin";
import {
  type PluginHostSummary,
  type PluginIconProps,
  type PluginScreenProps,
  type PluginSidebarItemProps,
  useHosts,
} from "@getpaseo/plugin/client";
import { SidebarRow, SidebarSeparator } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import {
  type ActiveChat,
  type HostWorkspacesState,
  type Workspace,
  groupByProject,
  useHostWorkspaces,
} from "./active-projects";

export const OPEN_WORKSPACE_SCREEN = "open-workspace";

function statusColor(theme: PluginTheme, status: Workspace["status"]): string {
  switch (status) {
    case "running":
      return theme.colors.accent;
    case "needs_input":
    case "attention":
      return theme.colors.statusWarning;
    case "failed":
      return theme.colors.statusDanger;
    case "done":
      return theme.colors.foregroundMuted;
  }
}

// One component per color, so rows keep the same icon component across renders.
const statusDots = new Map<string, (props: PluginIconProps) => React.JSX.Element>();

function statusDot(color: string) {
  let StatusDot = statusDots.get(color);
  if (!StatusDot) {
    StatusDot = ({ size }: PluginIconProps) => (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      </View>
    );
    statusDots.set(color, StatusDot);
  }
  return StatusDot;
}

/** Feeds one host's workspaces up to the sidebar item; renders nothing. */
function HostFeed({
  host,
  onChange,
}: {
  host: PluginHostSummary;
  onChange(serverId: string, state: HostWorkspacesState | null): void;
}) {
  const online = host.status === "online";
  const state = useHostWorkspaces(host.serverId, online);
  useEffect(() => {
    onChange(host.serverId, online ? state : null);
  }, [host.serverId, online, state, onChange]);
  useEffect(() => () => onChange(host.serverId, null), [host.serverId, onChange]);
  return null;
}

export function ActiveProjectsSidebarItem({ theme, openScreen }: PluginSidebarItemProps) {
  const hosts = useHosts();
  const [states, setStates] = useState<Record<string, HostWorkspacesState | null>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const onChange = useCallback((serverId: string, state: HostWorkspacesState | null) => {
    setStates((current) => ({ ...current, [serverId]: state }));
  }, []);

  const multiHost = hosts.length > 1;
  const { projects, errors } = useMemo(() => {
    const chats: ActiveChat[] = [];
    const errors: string[] = [];
    for (const host of hosts) {
      const state = states[host.serverId];
      if (state?.status === "ready") {
        for (const workspace of state.workspaces) {
          chats.push({ serverId: host.serverId, hostLabel: host.label, workspace });
        }
      } else if (state?.status === "error") {
        errors.push(`${host.label}: ${state.error}`);
      }
    }
    return { projects: groupByProject(chats), errors };
  }, [hosts, states]);

  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };

  return (
    <>
      {hosts.map((host) => (
        <HostFeed key={host.serverId} host={host} onChange={onChange} />
      ))}
      <SidebarSeparator />
      {errors.map((error) => (
        <SidebarRow key={error} id={`error:${error}`} icon="TriangleAlert" label={error} onPress={() => {}} />
      ))}
      {projects.map((project) => {
        const isCollapsed = collapsed[project.name] ?? false;
        return (
          <View key={project.name}>
            <SidebarRow
              id={`project:${project.name}`}
              icon={isCollapsed ? "Folder" : "FolderOpen"}
              label={project.name}
              trailing={<Text style={muted}>{project.chats.length}</Text>}
              onPress={() => setCollapsed((current) => ({ ...current, [project.name]: !isCollapsed }))}
            />
            {isCollapsed
              ? null
              : project.chats.map(({ serverId, hostLabel, workspace }) => (
                  <SidebarRow
                    key={`${serverId}:${workspace.id}`}
                    id={`chat:${serverId}:${workspace.id}`}
                    icon={statusDot(statusColor(theme, workspace.status))}
                    label={workspace.title || workspace.name}
                    trailing={multiHost ? <Text style={muted}>{hostLabel}</Text> : undefined}
                    onPress={() =>
                      openScreen({
                        screenId: OPEN_WORKSPACE_SCREEN,
                        params: { serverId, workspaceId: workspace.id },
                      })
                    }
                  />
                ))}
          </View>
        );
      })}
    </>
  );
}

/** Sidebar items cannot navigate to a workspace, so a press routes through this screen. */
export function OpenWorkspaceScreen({ params, navigation, theme }: PluginScreenProps) {
  const { serverId, workspaceId } = params;
  const openWorkspace = navigation?.openWorkspace;
  useEffect(() => {
    if (openWorkspace && workspaceId) openWorkspace({ workspaceId, serverId });
  }, [openWorkspace, serverId, workspaceId]);
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: theme.colors.surface0 }}>
      <Text style={{ color: theme.colors.foregroundMuted }}>
        {openWorkspace ? "Opening workspace…" : "This version of Paseo cannot open workspaces from plugins."}
      </Text>
    </View>
  );
}
