import {
  type PluginHostSummary,
  type PluginScreenProps,
  type PluginSidebarItemProps,
  getPaseoClient,
  useHosts,
} from "@getpaseo/plugin/client";
import { Icon, ScrollView, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, Text, View } from "react-native";
import {
  type ActiveChat,
  type ActiveProject,
  type HostWorkspacesState,
  currentBranch,
  groupByProject,
  projectViewKey,
  useHostWorkspaces,
} from "./active-projects";
import { type HostBadge, hostBadges } from "./host-badges";
import { type SidebarPalette, shortAge, sidebarPalette } from "./look";
import {
  canHideNativeWorkspaces,
  setNativeWorkspacesHidden,
  useListMaxHeight,
  useNativeWorkspacesHidden,
} from "./native-workspaces";
import { ICON_BOX, ProjectAvatar, WorkspaceStatusIndicator } from "./status-indicator";
import { ContextMenu, type MenuAction, RenameDialog } from "./workspace-menu";

export const OPEN_WORKSPACE_SCREEN = "open-workspace";

export interface SidebarActions {
  /** Opens a directory on the host this plugin runs on. */
  openInFileManager(path: string): Promise<void>;
}

type Point = { x: number; y: number };

// react-native-web passes DOM contextmenu events through; React Native's types do not list them.
interface ContextMenuEvent {
  preventDefault(): void;
  nativeEvent: { clientX?: number; clientY?: number; pageX?: number; pageY?: number };
}

function eventPoint(event: ContextMenuEvent | GestureResponderEvent): Point {
  const native = event.nativeEvent as { clientX?: number; clientY?: number; pageX?: number; pageY?: number };
  return { x: native.clientX ?? native.pageX ?? 0, y: native.clientY ?? native.pageY ?? 0 };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Re-renders every interval so relative times stay current. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
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

function HoverRow({
  palette,
  style,
  onPress,
  onContextMenu,
  accessibilityLabel,
  children,
}: {
  palette: SidebarPalette;
  style: object;
  onPress(): void;
  onContextMenu?(point: Point): void;
  accessibilityLabel: string;
  children(hovered: boolean): ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const contextMenuProps = onContextMenu
    ? {
        onContextMenu: (event: ContextMenuEvent) => {
          event.preventDefault();
          onContextMenu(eventPoint(event));
        },
      }
    : {};
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onContextMenu ? (event) => onContextMenu(eventPoint(event)) : undefined}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        style,
        { userSelect: "none" },
        (hovered || pressed) && { backgroundColor: pressed ? palette.pressed : palette.hover },
      ]}
      {...contextMenuProps}
    >
      {children(hovered)}
    </Pressable>
  );
}

function HostBadgeView({ badge, palette }: { badge: HostBadge; palette: SidebarPalette }) {
  const color = badge.color ? palette.identityForeground(badge.color) : palette.foregroundMuted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 }}>
      <Icon name="Server" size={12} color={color} />
      <Text style={{ color, fontSize: 12 }} numberOfLines={1}>
        {badge.label}
      </Text>
    </View>
  );
}

function WorkspaceRow({
  chat,
  badge,
  palette,
  now,
  onOpen,
  onContextMenu,
}: {
  chat: ActiveChat;
  badge: HostBadge | undefined;
  palette: SidebarPalette;
  now: number;
  onOpen(): void;
  onContextMenu(point: Point): void;
}) {
  const { workspace } = chat;
  const title = workspace.title || workspace.name;
  // Like Paseo's rows: time since the workspace entered its current status.
  const age = shortAge(workspace.statusEnteredAt, now);
  return (
    <HoverRow
      palette={palette}
      accessibilityLabel={`Open ${title}`}
      onPress={onOpen}
      onContextMenu={onContextMenu}
      style={{
        minHeight: 36,
        marginBottom: 2,
        paddingVertical: 8,
        paddingLeft: 16,
        paddingRight: 12,
        borderRadius: 8,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      {(hovered) => (
        <>
          <WorkspaceStatusIndicator status={workspace.status} palette={palette} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: palette.foreground,
                  fontSize: 14,
                  lineHeight: 20,
                  opacity: hovered ? 1 : 0.76,
                }}
              >
                {title}
              </Text>
              {age ? (
                <Text style={{ height: 20, color: palette.foregroundExtraMuted, fontSize: 12, lineHeight: 20, flexShrink: 0 }}>
                  {age}
                </Text>
              ) : null}
            </View>
            {badge ? <HostBadgeView badge={badge} palette={palette} /> : null}
          </View>
        </>
      )}
    </HoverRow>
  );
}

function ProjectRow({
  project,
  collapsed,
  palette,
  onToggle,
}: {
  project: ActiveProject;
  collapsed: boolean;
  palette: SidebarPalette;
  onToggle(): void;
}) {
  return (
    <HoverRow
      palette={palette}
      accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${project.name}`}
      onPress={onToggle}
      style={{
        minHeight: 36,
        marginBottom: 4,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      {(hovered) => (
        <>
          <View style={{ width: ICON_BOX, height: 20, alignItems: "center", justifyContent: "center" }}>
            {hovered ? (
              <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={14} color="#9ca3af" />
            ) : (
              <ProjectAvatar viewKey={project.viewKey} name={project.name} />
            )}
          </View>
          <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, color: palette.foregroundMuted, fontSize: 14 }}>
            {project.name}
          </Text>
        </>
      )}
    </HoverRow>
  );
}

export function createActiveProjectsSidebarItem(actions: SidebarActions) {
  return function ActiveProjectsSidebarItem({ theme, host, openScreen }: PluginSidebarItemProps) {
    const hosts = useHosts();
    const toast = useToast();
    const now = useNow(30_000);
    const nativeHidden = useNativeWorkspacesHidden();
    const listRef = useRef<View>(null);
    const { maxHeight, measure } = useListMaxHeight(listRef, nativeHidden);
    // Rebuilt every render: the theme can change in place when the app follows the system appearance.
    const palette = sidebarPalette(theme);
    const [states, setStates] = useState<Record<string, HostWorkspacesState | null>>({});
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [menu, setMenu] = useState<{ chat: ActiveChat; point: Point } | null>(null);
    const [renaming, setRenaming] = useState<ActiveChat | null>(null);
    const onChange = useCallback((serverId: string, state: HostWorkspacesState | null) => {
      setStates((current) => ({ ...current, [serverId]: state }));
    }, []);

    const badges = useMemo(() => hostBadges(hosts, host.id), [hosts, host.id]);
    const { projects, errors } = useMemo(() => {
      const chats: ActiveChat[] = [];
      const errors: string[] = [];
      for (const { serverId, label } of hosts) {
        const state = states[serverId];
        if (state?.status === "ready") {
          for (const workspace of state.workspaces) {
            const viewKey = projectViewKey(serverId, workspace, state.viewKeys);
            chats.push({ serverId, hostLabel: label, viewKey, workspace });
          }
        } else if (state?.status === "error") {
          errors.push(`${label}: ${state.error}`);
        }
      }
      return { projects: groupByProject(chats), errors };
    }, [hosts, states]);

    const run = (task: () => Promise<unknown>, success?: string) => {
      task().then(
        () => success && toast.show(success),
        (error) => toast.error(errorMessage(error)),
      );
    };

    const menuActions = (chat: ActiveChat): MenuAction[] => {
      const { serverId, workspace } = chat;
      const path = workspace.workspaceDirectory || workspace.projectRootPath;
      const branch = currentBranch(workspace);
      const items: MenuAction[] = [
        { id: "copy-path", label: "Copy path", icon: "Copy", onSelect: () => run(() => copyText(path), "Path copied") },
      ];
      if (branch) {
        items.push({
          id: "copy-branch",
          label: "Copy branch name",
          icon: "Copy",
          onSelect: () => run(() => copyText(branch), "Branch name copied"),
        });
      }
      items.push({ id: "rename", label: "Rename workspace", icon: "Pencil", onSelect: () => setRenaming(chat) });
      if (serverId === host.id) {
        items.push({
          id: "open-in-file-manager",
          label: "Open in file manager",
          icon: "FolderOpen",
          onSelect: () => run(() => actions.openInFileManager(path)),
        });
      }
      items.push({
        id: "archive",
        label: "Archive",
        icon: "Archive",
        onSelect: () =>
          run(async () => {
            const result = await getPaseoClient(serverId).workspaces.archive(workspace.id);
            if (result.error) throw new Error(result.error);
          }),
      });
      return items;
    };

    return (
      // Same side padding as Paseo's workspace list content.
      <View style={{ paddingHorizontal: 8 }}>
        {hosts.map((summary) => (
          <HostFeed key={summary.serverId} host={summary} onChange={onChange} />
        ))}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 4,
            paddingTop: 12,
            paddingBottom: 8,
          }}
        >
          <Text style={{ color: palette.foregroundMuted, fontSize: 12 }}>Active projects</Text>
          {canHideNativeWorkspaces ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={nativeHidden ? "Show Workspaces list" : "Hide Workspaces list"}
              onPress={() => setNativeWorkspacesHidden(!nativeHidden)}
              style={({ pressed }) => ({
                width: 24,
                height: 24,
                borderRadius: 6,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? palette.hover : "transparent",
              })}
            >
              <Icon name={nativeHidden ? "Eye" : "EyeOff"} size={14} color={palette.foregroundMuted} />
            </Pressable>
          ) : null}
        </View>
        {projects.length === 0 && errors.length === 0 ? (
          <Text style={{ color: palette.foregroundExtraMuted, fontSize: 12, paddingLeft: 4, paddingBottom: 8 }}>
            No open workspaces
          </Text>
        ) : null}
        {errors.map((error) => (
          <Text key={error} style={{ color: palette.danger, fontSize: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
            {error}
          </Text>
        ))}
        <View ref={listRef} onLayout={measure}>
          <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false}>
            {projects.map((project) => {
              const isCollapsed = collapsed[project.viewKey] ?? false;
              return (
                <View key={project.viewKey}>
                  <ProjectRow
                    project={project}
                    collapsed={isCollapsed}
                    palette={palette}
                    onToggle={() => setCollapsed((current) => ({ ...current, [project.viewKey]: !isCollapsed }))}
                  />
                  {isCollapsed
                    ? null
                    : project.chats.map((chat) => (
                        <WorkspaceRow
                          key={`${chat.serverId}:${chat.workspace.id}`}
                          chat={chat}
                          badge={badges.get(chat.serverId)}
                          palette={palette}
                          now={now}
                          onOpen={() =>
                            openScreen({
                              screenId: OPEN_WORKSPACE_SCREEN,
                              params: { serverId: chat.serverId, workspaceId: chat.workspace.id },
                            })
                          }
                          onContextMenu={(point) => setMenu({ chat, point })}
                        />
                      ))}
                </View>
              );
            })}
          </ScrollView>
        </View>
        <ContextMenu
          position={menu?.point ?? null}
          actions={menu ? menuActions(menu.chat) : []}
          palette={palette}
          onClose={() => setMenu(null)}
        />
        {renaming ? (
          <RenameDialog
            initialTitle={renaming.workspace.title ?? null}
            palette={palette}
            onClose={() => setRenaming(null)}
            onSave={async (title) => {
              try {
                await getPaseoClient(renaming.serverId).workspaces.ref(renaming.workspace.id).setTitle(title || null);
              } catch (error) {
                toast.error(errorMessage(error));
                throw error;
              }
            }}
          />
        ) : null}
      </View>
    );
  };
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
