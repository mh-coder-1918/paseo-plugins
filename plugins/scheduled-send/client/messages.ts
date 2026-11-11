import type { PluginClientContext } from "@getpaseo/plugin/client";
import { cancelRpc, createRpc, listRpc, type ScheduledMessage } from "../shared/schedule";

// Sent messages leave the daemon's list on their own, so the app re-reads it on a timer.
const POLL_MS = 30_000;
// Retry delays for the first read while the daemon is still starting or reconnecting.
const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 30_000;

type Listener = () => void;

/** The scheduled messages this host holds, kept fresh for the pills and their popovers. */
export function createMessageStore(client: PluginClientContext) {
  let messages: readonly ScheduledMessage[] = [];
  const listeners = new Set<Listener>();
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const publish = (next: readonly ScheduledMessage[]) => {
    if (disposed) return;
    messages = next;
    for (const listener of listeners) listener();
  };

  const refresh = async (): Promise<boolean> => {
    try {
      publish((await client.rpc(listRpc, {})).messages);
      return true;
    } catch (error) {
      if (!disposed) console.error("scheduled-send: reading the queue failed", error);
      return false;
    }
  };

  const poll = async (delay: number) => {
    const ok = await refresh();
    if (disposed) return;
    const next = ok ? POLL_MS : delay;
    timer = setTimeout(() => void poll(ok ? RETRY_FIRST_MS : Math.min(delay * 2, RETRY_MAX_MS)), next);
  };
  void poll(RETRY_FIRST_MS);

  return {
    forAgent(agentId: string): readonly ScheduledMessage[] {
      return messages.filter((message) => message.agentId === agentId);
    },

    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async create(input: { agentId: string; text: string; sendAt: Date }) {
      const result = await client.rpc(createRpc, {
        agentId: input.agentId,
        text: input.text,
        sendAt: input.sendAt.toISOString(),
      });
      publish(result.messages);
    },

    async cancel(id: string) {
      publish((await client.rpc(cancelRpc, { id })).messages);
    },

    dispose() {
      disposed = true;
      clearTimeout(timer);
      listeners.clear();
    },
  };
}

export type MessageStore = ReturnType<typeof createMessageStore>;
