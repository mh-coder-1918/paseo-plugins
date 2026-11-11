import type {
  PluginButtonContentProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { createMessageStore } from "./messages";
import { SendLaterPopover } from "./popover";

type AgentList = Awaited<ReturnType<PluginClientContext["paseo"]["agents"]["list"]>>;

// The daemon rejects pages larger than 200; later pages are fetched with the cursor.
const PAGE_LIMIT = 200;
const PILL_ID = "send-later";
const ICON = "AlarmClock";

function labelFor(count: number): string {
  return count === 0 ? "Send later" : `${count} scheduled`;
}

interface Pill {
  registration: PluginButtonRegistration;
  /** What the pill is labelled now, so only real changes are pushed to the host. */
  label: string;
}

/** Keeps a "Send later" pill in every chat on this host, labelled with what is waiting. */
export function installSendLaterPills(client: PluginClientContext) {
  const paseo = client.paseo;
  const store = createMessageStore(client);
  const agentWorkspaces = new Map<string, string>();
  const pills = new Map<string, Pill>();
  let disposed = false;
  const stops: (() => void)[] = [];

  const fail = (what: string) => (error: unknown) => {
    if (!disposed) console.error(`scheduled-send: ${what} failed`, error);
  };

  const reconcile = () => {
    if (disposed) return;
    for (const [agentId, pill] of pills) {
      if (agentWorkspaces.has(agentId)) continue;
      pill.registration.remove();
      pills.delete(agentId);
    }
    for (const [agentId, workspaceId] of agentWorkspaces) {
      const label = labelFor(store.forAgent(agentId).length);
      const pill = pills.get(agentId);
      if (!pill) {
        const Content = (props: PluginButtonContentProps) => (
          <SendLaterPopover {...props} client={client} store={store} agentId={agentId} />
        );
        pills.set(agentId, {
          label,
          registration: client.addComposerPill({
            id: PILL_ID,
            workspaceId,
            agentId,
            button: { title: "Send later", label, icon: ICON, behavior: { kind: "popover", Content } },
          }),
        });
      } else if (pill.label !== label) {
        pill.registration.update({ label });
        pill.label = label;
      }
    }
  };

  stops.push(store.subscribe(reconcile));

  // Chats: which workspace each one belongs to.
  {
    const onError = fail("watching chats");
    let unsubscribe: (() => void) | undefined;
    let release: (() => Promise<void>) | undefined;

    const record = (agent: { id: string; workspaceId?: string | null }) => {
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

  return () => {
    disposed = true;
    for (const stop of stops) stop();
    store.dispose();
    for (const pill of pills.values()) pill.registration.remove();
    pills.clear();
  };
}
