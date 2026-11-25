import {
  type PluginHostSummary,
  type PluginSidebarViewProps,
  type WorkspaceRef,
  getPaseoClient,
  useHosts,
} from "@getpaseo/plugin/client";
import { Icon, ScrollView, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
import {
  LATER_OPTIONS,
  type LaterActions,
  type LaterEntry,
  isWaiting,
  laterKey,
  returnsAt,
  setLaterCollapsed,
  useLaterCollapsed,
  useLaterEntries,
} from "./later";
import { type SidebarPalette, shortAge, sidebarPalette } from "./look";
import { SORT_MODES, setSortMode, useSortMode } from "./project-sort";
import { ICON_BOX, ProjectAvatar, WorkspaceStatusIndicator } from "./status-indicator";
import { ContextMenu, type MenuAction, RenameDialog } from "./workspace-menu";

export interface SidebarActions extends LaterActions {
  /** Server id of the daemon this plugin runs on. */
  pluginHostId(): Promise<string>;
  /** Opens a directory on the host this plugin runs on. */
  openInFileManager(path: string): Promise<void>;
}

/** Same shape and key as the refs Paseo hands to plugins. */
function workspaceRef(serverId: string, workspaceId: string): WorkspaceRef {
  return { kind: "workspace", key: JSON.stringify([serverId, workspaceId]), hostId: serverId, id: workspaceId };
}

function isActive(active: WorkspaceRef | null, serverId: string, workspaceId: string): boolean {
  return active?.hostId === serverId && active.id === workspaceId;
}

// Retry delays for asking the daemon for its server id while it is still starting or reconnecting.
const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 30_000;

// The host does not change while the plugin runs, so remounting the view reuses the answer.
let knownPluginHostId: string | null = null;

/**
 * The plugin's own host, or null until the daemon answers. Until then every host gets its badge
 * and Open in file manager is not offered.
 */
function usePluginHostId(actions: SidebarActions): string | null {
  const [hostId, setHostId] = useState<string | null>(knownPluginHostId);
  useEffect(() => {
    if (knownPluginHostId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (delay: number) => {
      actions.pluginHostId().then(
        (id) => {
          knownPluginHostId = id;
          if (!cancelled) setHostId(id);
        },
        () => {
          if (!cancelled) timer = setTimeout(() => load(Math.min(delay * 2, RETRY_MAX_MS)), delay);
        },
      );
    };
    load(RETRY_FIRST_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [actions]);
  return hostId;
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

/** Feeds one host's workspaces up to the view; renders nothing. */
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
  selected = false,
  onPress,
  onContextMenu,
  accessibilityLabel,
  children,
}: {
  palette: SidebarPalette;
  style: object;
  /** Keeps the row filled in while it is the workspace the app is showing. */
  selected?: boolean;
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
        selected && { backgroundColor: palette.hover },
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
  selected,
  trailing,
  detail,
  onOpen,
  onContextMenu,
}: {
  chat: ActiveChat;
  badge: HostBadge | undefined;
  palette: SidebarPalette;
  now: number;
  /** True for the workspace the app is showing. */
  selected: boolean;
  /** Replaces the age on the right, e.g. when a set-aside chat comes back. */
  trailing?: string | null;
  /** Shown under the title before the host badge, e.g. the project of a set-aside chat. */
  detail?: string;
  onOpen(): void;
  onContextMenu(point: Point): void;
}) {
  const { workspace } = chat;
  const title = workspace.title || workspace.name;
  // Like Paseo's rows: time since the workspace entered its current status.
  const age = trailing === undefined ? shortAge(workspace.statusEnteredAt, now) : trailing;
  return (
    <HoverRow
      palette={palette}
      selected={selected}
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
                  opacity: hovered || selected ? 1 : 0.76,
                  fontWeight: selected ? "500" : "400",
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
            {detail || badge ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
                {detail ? (
                  <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, color: palette.foregroundMuted, fontSize: 12 }}>
                    {detail}
                  </Text>
                ) : null}
                {badge ? <HostBadgeView badge={badge} palette={palette} /> : null}
              </View>
            ) : null}
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
  holdsCurrent,
  onToggle,
}: {
  project: ActiveProject;
  collapsed: boolean;
  palette: SidebarPalette;
  /** True when the workspace the app is showing is one of this project's. */
  holdsCurrent: boolean;
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
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              minWidth: 0,
              // Collapsed rows still say which project the open workspace is in.
              color: holdsCurrent && collapsed ? palette.foreground : palette.foregroundMuted,
              fontSize: 14,
            }}
          >
            {project.name}
          </Text>
        </>
      )}
    </HoverRow>
  );
}

function LaterHeaderRow({
  count,
  collapsed,
  palette,
  holdsCurrent,
  onToggle,
}: {
  count: number;
  collapsed: boolean;
  palette: SidebarPalette;
  /** True when the workspace the app is showing is set aside. */
  holdsCurrent: boolean;
  onToggle(): void;
}) {
  return (
    <HoverRow
      palette={palette}
      accessibilityLabel={`${collapsed ? "Show" : "Hide"} chats set aside for later`}
      onPress={onToggle}
      style={{
        minHeight: 36,
        marginTop: 8,
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
            <Icon
              name={hovered ? (collapsed ? "ChevronRight" : "ChevronDown") : "AlarmClock"}
              size={14}
              color={palette.foregroundMuted}
            />
          </View>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              minWidth: 0,
              color: holdsCurrent && collapsed ? palette.foreground : palette.foregroundMuted,
              fontSize: 14,
            }}
          >
            Later
          </Text>
          <Text style={{ color: palette.foregroundExtraMuted, fontSize: 12 }}>{count}</Text>
        </>
      )}
    </HoverRow>
  );
}

const headerButton = {
  width: 24,
  height: 24,
  borderRadius: 6,
  alignItems: "center",
  justifyContent: "center",
} as const;

export function createActiveProjectsView(actions: SidebarActions) {
  return function ActiveProjectsView({ theme, active, navigation }: PluginSidebarViewProps) {
    const hosts = useHosts();
    const toast = useToast();
    const now = useNow(30_000);
    const sort = useSortMode();
    const pluginHostId = usePluginHostId(actions);
    const laterEntries = useLaterEntries(actions);
    const laterCollapsed = useLaterCollapsed();
    const current = active.workspace;
    // Rebuilt every render: the theme can change in place when the app follows the system appearance.
    const palette = sidebarPalette(theme);
    const [states, setStates] = useState<Record<string, HostWorkspacesState | null>>({});
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [menu, setMenu] = useState<{ chat: ActiveChat; point: Point } | null>(null);
    const [laterMenu, setLaterMenu] = useState<{ chat: ActiveChat; point: Point } | null>(null);
    const [sortMenu, setSortMenu] = useState<Point | null>(null);
    const [renaming, setRenaming] = useState<ActiveChat | null>(null);
    const onChange = useCallback((serverId: string, state: HostWorkspacesState | null) => {
      setStates((current) => ({ ...current, [serverId]: state }));
    }, []);

    const badges = useMemo(() => hostBadges(hosts, pluginHostId), [hosts, pluginHostId]);
    const { projects, later, errors } = useMemo(() => {
      const waiting = new Map<string, LaterEntry>();
      for (const entry of laterEntries) {
        if (isWaiting(entry, now)) waiting.set(laterKey(entry.hostId, entry.workspaceId), entry);
      }
      const chats: ActiveChat[] = [];
      const later: { chat: ActiveChat; entry: LaterEntry; project: string }[] = [];
      const errors: string[] = [];
      for (const { serverId, label } of hosts) {
        const state = states[serverId];
        if (state?.status === "ready") {
          for (const workspace of state.workspaces) {
            const viewKey = projectViewKey(serverId, workspace, state.viewKeys);
            const chat = { serverId, hostLabel: label, viewKey, workspace };
            const entry = waiting.get(laterKey(serverId, workspace.id));
            if (entry) {
              later.push({ chat, entry, project: workspace.projectCustomName || workspace.projectDisplayName });
            } else {
              chats.push(chat);
            }
          }
        } else if (state?.status === "error") {
          errors.push(`${label}: ${state.error}`);
        }
      }
      // Soonest back first; chats kept until brought back by hand go last, oldest first.
      later.sort(
        (a, b) =>
          (a.entry.until ?? "\uffff").localeCompare(b.entry.until ?? "\uffff") ||
          a.entry.since.localeCompare(b.entry.since),
      );
      return { projects: groupByProject(chats, sort), later, errors };
    }, [hosts, states, sort, laterEntries, now]);

    const laterKeys = new Set(later.map(({ chat }) => laterKey(chat.serverId, chat.workspace.id)));
    const laterHoldsCurrent = later.some(({ chat }) => isActive(current, chat.serverId, chat.workspace.id));

    const run = (task: () => Promise<unknown>, success?: string) => {
      task().then(
        () => success && toast.show(success),
        (error) => toast.error(errorMessage(error)),
      );
    };

    const laterOptions = (chat: ActiveChat): MenuAction[] =>
      LATER_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        icon: option.icon,
        onSelect: () => {
          const until = option.until(new Date());
          const when = returnsAt(until, Date.now());
          run(
            () => actions.setAside(chat.serverId, chat.workspace.id, until),
            when ? `Back at ${when}` : "Set aside until you bring it back",
          );
        },
      }));

    const menuActions = (chat: ActiveChat, point: Point, setAside: boolean): MenuAction[] => {
      const { serverId, workspace } = chat;
      const path = workspace.workspaceDirectory || workspace.projectRootPath;
      const branch = currentBranch(workspace);
      const items: MenuAction[] = [];
      const openLaterMenu = () => setLaterMenu({ chat, point });
      if (setAside) {
        items.push(
          {
            id: "bring-back",
            label: "Bring back now",
            icon: "Undo2",
            onSelect: () => run(() => actions.bringBack(serverId, workspace.id)),
          },
          { id: "later", label: "Change when it comes back…", icon: "AlarmClock", onSelect: openLaterMenu },
        );
      } else {
        items.push({ id: "later", label: "Set aside for later…", icon: "AlarmClock", onSelect: openLaterMenu });
      }
      items.push({
        id: "copy-path",
        label: "Copy path",
        icon: "Copy",
        onSelect: () => run(() => copyText(path), "Path copied"),
      });
      if (branch) {
        items.push({
          id: "copy-branch",
          label: "Copy branch name",
          icon: "Copy",
          onSelect: () => run(() => copyText(branch), "Branch name copied"),
        });
      }
      items.push({ id: "rename", label: "Rename workspace", icon: "Pencil", onSelect: () => setRenaming(chat) });
      if (serverId === pluginHostId) {
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
      // Fills the sidebar's workspace list slot, with the same side padding as Paseo's own list.
      <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 8 }}>
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sort projects"
              onPress={(event) => setSortMenu(eventPoint(event))}
              style={({ pressed }) => [headerButton, { backgroundColor: pressed ? palette.hover : "transparent" }]}
            >
              <Icon name="ArrowUpDown" size={14} color={palette.foregroundMuted} />
            </Pressable>
          </View>
        </View>
        {projects.length === 0 && errors.length === 0 ? (
          <Text style={{ color: palette.foregroundExtraMuted, fontSize: 12, paddingLeft: 4, paddingBottom: 8 }}>
            {later.length > 0 ? "Everything is set aside for later" : "No open workspaces"}
          </Text>
        ) : null}
        {errors.map((error) => (
          <Text key={error} style={{ color: palette.danger, fontSize: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
            {error}
          </Text>
        ))}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {projects.map((project) => {
            const isCollapsed = collapsed[project.viewKey] ?? false;
            return (
              <View key={project.viewKey}>
                <ProjectRow
                  project={project}
                  collapsed={isCollapsed}
                  palette={palette}
                  holdsCurrent={project.chats.some((chat) =>
                    isActive(current, chat.serverId, chat.workspace.id),
                  )}
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
                        selected={isActive(current, chat.serverId, chat.workspace.id)}
                        onOpen={() => navigation.openWorkspace(workspaceRef(chat.serverId, chat.workspace.id))}
                        onContextMenu={(point) => setMenu({ chat, point })}
                      />
                    ))}
              </View>
            );
          })}
          {later.length > 0 ? (
            <View>
              <LaterHeaderRow
                count={later.length}
                collapsed={laterCollapsed}
                palette={palette}
                holdsCurrent={laterHoldsCurrent}
                onToggle={() => setLaterCollapsed(!laterCollapsed)}
              />
              {laterCollapsed
                ? null
                : later.map(({ chat, entry, project }) => (
                    <WorkspaceRow
                      key={`${chat.serverId}:${chat.workspace.id}`}
                      chat={chat}
                      badge={badges.get(chat.serverId)}
                      palette={palette}
                      now={now}
                      selected={isActive(current, chat.serverId, chat.workspace.id)}
                      trailing={returnsAt(entry.until, now)}
                      detail={project}
                      onOpen={() => navigation.openWorkspace(workspaceRef(chat.serverId, chat.workspace.id))}
                      onContextMenu={(point) => setMenu({ chat, point })}
                    />
                  ))}
            </View>
          ) : null}
        </ScrollView>
        <ContextMenu
          position={sortMenu}
          actions={SORT_MODES.map((mode) => ({
            id: mode.id,
            label: mode.label,
            icon: mode.icon,
            selected: mode.id === sort,
            onSelect: () => setSortMode(mode.id),
          }))}
          palette={palette}
          onClose={() => setSortMenu(null)}
        />
        <ContextMenu
          position={menu?.point ?? null}
          actions={menu ? menuActions(menu.chat, menu.point, laterKeys.has(laterKey(menu.chat.serverId, menu.chat.workspace.id))) : []}
          palette={palette}
          onClose={() => setMenu(null)}
        />
        <ContextMenu
          position={laterMenu?.point ?? null}
          actions={laterMenu ? laterOptions(laterMenu.chat) : []}
          palette={palette}
          onClose={() => setLaterMenu(null)}
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
