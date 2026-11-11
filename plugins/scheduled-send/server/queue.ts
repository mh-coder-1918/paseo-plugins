import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { type ScheduledMessage, scheduledMessageSchema } from "../shared/schedule";

type PaseoApi = PluginHandlerContext["paseo"];

// Due messages are found by comparing clocks on every tick rather than with one long timer: a
// sleeping Mac pauses timers, and the message should still go out as soon as it wakes.
const TICK_MS = 15_000;
const RETRY_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 3;

const storedSchema = z.object({ messages: z.array(scheduledMessageSchema) });

/** Beside Paseo's own state, so each daemon keeps the messages for its own chats. */
function storePath(): string {
  const home = process.env.PASEO_HOME ?? "~/.paseo";
  const root = home === "~" || home.startsWith("~/") ? join(homedir(), home.slice(1)) : home;
  return join(resolve(root), "plugin-data", "scheduled-send", "messages.json");
}

function bySendAt(a: ScheduledMessage, b: ScheduledMessage): number {
  return a.sendAt.localeCompare(b.sendAt);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Holds the scheduled messages on the daemon and sends each one when its time comes, whether or
 * not any app is connected.
 */
export function createQueue() {
  const path = storePath();
  let messages: ScheduledMessage[] = [];
  let paseo: PaseoApi | null = null;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = Promise.resolve();
  const attempts = new Map<string, number>();
  const retryAt = new Map<string, number>();

  const loaded = (async () => {
    try {
      const parsed = storedSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
      if (!parsed.success) {
        console.error("scheduled-send: ignoring an unreadable store", parsed.error.message);
        return;
      }
      // A message caught mid-send by a restart may or may not have arrived. Sending it again
      // could post it twice, so it is left for the user to check.
      messages = parsed.data.messages.map((message) =>
        message.status === "sending"
          ? { ...message, status: "failed", error: "Paseo restarted while sending. Check the chat before sending it again." }
          : message,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("scheduled-send: reading the store failed", error);
      }
    }
  })();

  const save = () => {
    const snapshot = JSON.stringify({ messages }, null, 2);
    saving = saving.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, snapshot);
      await rename(temporary, path);
    }).catch((error) => console.error("scheduled-send: saving the store failed", error));
    return saving;
  };

  const snapshot = () => ({ messages: [...messages].sort(bySendAt) });

  const update = (id: string, patch: Partial<ScheduledMessage>) => {
    messages = messages.map((message) => (message.id === id ? { ...message, ...patch } : message));
  };

  const deliver = async (api: PaseoApi, message: ScheduledMessage) => {
    update(message.id, { status: "sending" });
    await save();
    try {
      await api.agents.ref(message.agentId).send(message.text);
      messages = messages.filter((entry) => entry.id !== message.id);
      attempts.delete(message.id);
      retryAt.delete(message.id);
    } catch (error) {
      const tries = (attempts.get(message.id) ?? 0) + 1;
      console.error(`scheduled-send: sending ${message.id} failed (attempt ${tries})`, error);
      if (tries >= MAX_ATTEMPTS) {
        attempts.delete(message.id);
        retryAt.delete(message.id);
        update(message.id, { status: "failed", error: describe(error) });
      } else {
        attempts.set(message.id, tries);
        retryAt.set(message.id, Date.now() + RETRY_DELAY_MS);
        update(message.id, { status: "pending", error: describe(error) });
      }
    }
    await save();
  };

  const tick = async () => {
    timer = undefined;
    if (disposed) return;
    await loaded;
    // Paseo hands the plugin its API only with a request or a hook. After a daemon restart,
    // nothing can be sent until an app connects or a chat on this host takes a turn.
    const api = paseo;
    if (api) {
      const now = Date.now();
      const due = messages.filter(
        (message) =>
          message.status === "pending" &&
          Date.parse(message.sendAt) <= now &&
          (retryAt.get(message.id) ?? 0) <= now,
      );
      // One at a time, in order, so two messages for the same chat arrive as they were meant to.
      for (const message of due.sort(bySendAt)) {
        if (disposed) return;
        await deliver(api, message);
      }
    }
    if (!disposed) timer = setTimeout(() => void tick(), TICK_MS);
  };

  void tick();

  return {
    attach(context: PluginHandlerContext) {
      paseo = context.paseo;
    },

    async list() {
      await loaded;
      return snapshot();
    },

    async create(input: { agentId: string; text: string; sendAt: string }) {
      await loaded;
      const sendAt = Date.parse(input.sendAt);
      if (Number.isNaN(sendAt)) throw new Error(`Not a time: ${input.sendAt}`);
      messages.push({
        id: randomUUID(),
        agentId: input.agentId,
        text: input.text,
        sendAt: new Date(sendAt).toISOString(),
        createdAt: new Date().toISOString(),
        status: "pending",
        error: null,
      });
      await save();
      return snapshot();
    },

    async cancel(id: string) {
      await loaded;
      const message = messages.find((entry) => entry.id === id);
      if (message?.status === "sending") throw new Error("This message is being sent right now.");
      messages = messages.filter((entry) => entry.id !== id);
      attempts.delete(id);
      retryAt.delete(id);
      await save();
      return snapshot();
    },

    async dispose() {
      disposed = true;
      clearTimeout(timer);
      await saving;
    },
  };
}
