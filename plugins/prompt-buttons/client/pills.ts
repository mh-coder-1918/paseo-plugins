import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { type PromptButton, promptButtonsRpc, promptButtonsSettings } from "../shared/settings";
import { resolveIcon } from "./icons";
import { onButtonsSaved } from "./settings-bus";

type PaseoApi = PluginClientContext["paseo"];
type AgentList = Awaited<ReturnType<PaseoApi["agents"]["list"]>>;
type WorkspaceList = Awaited<ReturnType<PaseoApi["workspaces"]["list"]>>;

// The daemon rejects pages larger than 200; later pages are fetched with the cursor.
const PAGE_LIMIT = 200;

/** The buttons this host has configured, or none when they cannot be read. */
export async function readButtons(client: PluginClientContext): Promise<PromptButton[]> {
  try {
    const result = await client.rpc(promptButtonsRpc.read, {});
    if (result.status !== "ready") return [];
    const parsed = promptButtonsSettings.schema.safeParse(result.values);
    return parsed.success ? [...parsed.data.buttons] : [];
  } catch (error) {
    console.error("prompt-buttons: reading the buttons failed", error);
    return [];
  }
}

function pillKey(agentId: string, buttonId: string): string {
  return `${agentId}\u0000${buttonId}`;
}

interface Pill {
  registration: PluginButtonRegistration;
  /** What the pill is drawn with now, so only real changes are pushed to the host. */
  label: string;
  icon: string;
}

/**
 * Keeps one composer pill per configured button per chat. A button scoped to projects only
 * reaches chats whose workspace belongs to one of them.
 */
export function installPromptPills(client: PluginClientContext) {
  const paseo = client.paseo;
  const agentWorkspaces = new Map<string, string>();
  const workspaceProjects = new Map<string, string>();
  const buttons = new Map<string, PromptButton>();
  const pills = new Map<string, Pill>();
  const sending = new Set<string>();
  let disposed = false;
  const stops: (() => void)[] = [];

  const fail = (what: string) => (error: unknown) => {
    if (!disposed) console.error(`prompt-buttons: ${what} failed`, error);
  };

  const send = async (agentId: string, buttonId: string) => {
    const key = pillKey(agentId, buttonId);
    const button = buttons.get(buttonId);
    if (!button || sending.has(key)) return;
    sending.add(key);
    pills.get(key)?.registration.update({ disabled: true });
    try {
      await paseo.agents.ref(agentId).send(button.prompt);
    } catch (error) {
      console.error(`prompt-buttons: sending "${button.label}" failed`, error);
    } finally {
      sending.delete(key);
      pills.get(key)?.registration.update({ disabled: false });
    }
  };

  const appliesTo = (button: PromptButton, workspaceId: string): boolean => {
    if (button.scope.kind === "global") return true;
    const projectId = workspaceProjects.get(workspaceId);
    return projectId !== undefined && button.scope.projectIds.includes(projectId);
  };

  const reconcile = () => {
    if (disposed) return;
    const wanted = new Map<string, { agentId: string; workspaceId: string; button: PromptButton }>();
    for (const [agentId, workspaceId] of agentWorkspaces) {
      for (const button of buttons.values()) {
        if (appliesTo(button, workspaceId)) {
          wanted.set(pillKey(agentId, button.id), { agentId, workspaceId, button });
        }
      }
    }
    for (const [key, pill] of pills) {
      if (wanted.has(key)) continue;
      pill.registration.remove();
      pills.delete(key);
    }
    for (const [key, { agentId, workspaceId, button }] of wanted) {
      const pill = pills.get(key);
      if (!pill) {
        pills.set(key, {
          label: button.label,
          icon: button.icon,
          registration: client.addComposerPill({
            id: button.id,
            workspaceId,
            agentId,
            button: {
              title: button.label,
              label: button.label,
              icon: resolveIcon(button.icon),
              behavior: { kind: "action", onPress: () => send(agentId, button.id) },
            },
          }),
        });
      } else if (pill.label !== button.label || pill.icon !== button.icon) {
        // The press handler reads the prompt when it fires, so only presentation is pushed.
        pill.registration.update({
          title: button.label,
          label: button.label,
          icon: resolveIcon(button.icon),
        });
        pill.label = button.label;
        pill.icon = button.icon;
      }
    }
  };

  const setButtons = (next: readonly PromptButton[]) => {
    buttons.clear();
    for (const button of next) buttons.set(button.id, button);
    reconcile();
  };

  // Chats: which workspace each one belongs to.
  {
    const onError = fail("watching chats");
    let unsubscribe: (() => void) | undefined;
    let release: (() => Promise<void>) | undefined;

    const record = (agent: { id: string; workspaceId?: string }) => {
      if (agent.workspaceId) agentWorkspaces.set(agent.id, agent.workspaceId);
      else agentWorkspaces.delete(agent.id);
    };
    // The subscription snapshot holds the first page only; the rest are read once per snapshot.
    const loadRest = async (cursor: string | null) => {
      while (cursor && !disposed) {
        const page = await paseo.agents.list({ page: { limit: PAGE_LIMIT, cursor } });
        for (const { agent } of page.entries) record(agent);
        cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
      }
    };
    const replace = (snapshot: AgentList) => {
      agentWorkspaces.clear();
      for (const { agent } of snapshot.entries) record(agent);
      reconcile();
      const { hasMore, nextCursor } = snapshot.pageInfo;
      if (hasMore) loadRest(nextCursor).then(reconcile, onError);
    };

    paseo.agents.list({ subscribe: {}, page: { limit: PAGE_LIMIT } }).then((result) => {
      const { subscription } = result;
      release = () => subscription.release();
      if (disposed) {
        void release();
        return;
      }
      replace(result);
      unsubscribe = subscription.subscribe({
        snapshot: replace,
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") record(update.agent);
          else agentWorkspaces.delete(update.agentId);
          reconcile();
        },
        error: onError,
      });
    }, onError);

    stops.push(() => {
      unsubscribe?.();
      void release?.();
    });
  }

  // Workspaces: which project each one belongs to, for project-scoped buttons.
  {
    const onError = fail("watching workspaces");
    let unsubscribe: (() => void) | undefined;
    let release: (() => Promise<void>) | undefined;

    const loadRest = async (cursor: string | null) => {
      while (cursor && !disposed) {
        const page = await paseo.workspaces.list({ page: { limit: PAGE_LIMIT, cursor } });
        for (const workspace of page.entries) workspaceProjects.set(workspace.id, workspace.projectId);
        cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
      }
    };
    const replace = (snapshot: WorkspaceList) => {
      workspaceProjects.clear();
      for (const workspace of snapshot.entries) workspaceProjects.set(workspace.id, workspace.projectId);
      reconcile();
      const { hasMore, nextCursor } = snapshot.pageInfo;
      if (hasMore) loadRest(nextCursor).then(reconcile, onError);
    };

    paseo.workspaces.list({ subscribe: {}, page: { limit: PAGE_LIMIT } }).then((result) => {
      const { subscription } = result;
      release = () => subscription.release();
      if (disposed) {
        void release();
        return;
      }
      replace(result);
      unsubscribe = subscription.subscribe({
        snapshot: replace,
        update: (message) => {
          if (message.type !== "workspace_update") return;
          const update = message.payload;
          if (update.kind === "upsert") workspaceProjects.set(update.workspace.id, update.workspace.projectId);
          else workspaceProjects.delete(update.id);
          reconcile();
        },
        error: onError,
      });
    }, onError);

    stops.push(() => {
      unsubscribe?.();
      void release?.();
    });
  }

  readButtons(client).then(setButtons, fail("reading the buttons"));
  stops.push(onButtonsSaved(setButtons));

  return () => {
    disposed = true;
    for (const stop of stops) stop();
    for (const pill of pills.values()) pill.registration.remove();
    pills.clear();
  };
}
