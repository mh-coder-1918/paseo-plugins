import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { type LaterEntry, laterEntrySchema } from "../shared/later";

const storedSchema = z.object({ entries: z.array(laterEntrySchema) });

/** Beside Paseo's own state, like the other plugins' data. */
function storePath(): string {
  const home = process.env.PASEO_HOME ?? "~/.paseo";
  const root = home === "~" || home.startsWith("~/") ? join(homedir(), home.slice(1)) : home;
  return join(resolve(root), "plugin-data", "active-projects", "later.json");
}

function isWaiting(entry: LaterEntry, now: number): boolean {
  return entry.until === null || Date.parse(entry.until) > now;
}

function sameChat(entry: LaterEntry, hostId: string, workspaceId: string): boolean {
  return entry.hostId === hostId && entry.workspaceId === workspaceId;
}

/**
 * The set-aside chats, kept in a file on the daemon. Chats whose time has passed are dropped the
 * next time the list changes; until then the app ignores them, so they come back on time anyway.
 */
export function createLaterStore() {
  const path = storePath();
  let entries: LaterEntry[] = [];
  let saving = Promise.resolve();
  const listeners = new Set<(entries: LaterEntry[]) => void>();

  const loaded = (async () => {
    try {
      const parsed = storedSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
      if (parsed.success) entries = parsed.data.entries;
      else console.error("active-projects: ignoring an unreadable later list", parsed.error.message);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("active-projects: reading the later list failed", error);
      }
    }
  })();

  const change = async (next: LaterEntry[]) => {
    const now = Date.now();
    entries = next.filter((entry) => isWaiting(entry, now));
    const snapshot = JSON.stringify({ entries }, null, 2);
    saving = saving
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${process.pid}.tmp`;
        await writeFile(temporary, snapshot);
        await rename(temporary, path);
      })
      .catch((error) => console.error("active-projects: saving the later list failed", error));
    for (const listener of listeners) listener(entries);
    await saving;
    return { entries };
  };

  return {
    async list() {
      await loaded;
      return { entries };
    },

    /** Calls the listener with every change until the returned function is called. */
    watch(listener: (entries: LaterEntry[]) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async setAside(input: { hostId: string; workspaceId: string; until: string | null }) {
      await loaded;
      let until: string | null = null;
      if (input.until !== null) {
        const time = Date.parse(input.until);
        if (Number.isNaN(time)) throw new Error(`Not a time: ${input.until}`);
        until = new Date(time).toISOString();
      }
      const rest = entries.filter((entry) => !sameChat(entry, input.hostId, input.workspaceId));
      const previous = entries.find((entry) => sameChat(entry, input.hostId, input.workspaceId));
      return change([
        ...rest,
        {
          hostId: input.hostId,
          workspaceId: input.workspaceId,
          until,
          since: previous?.since ?? new Date().toISOString(),
        },
      ]);
    },

    async bringBack(input: { hostId: string; workspaceId: string }) {
      await loaded;
      return change(entries.filter((entry) => !sameChat(entry, input.hostId, input.workspaceId)));
    },

    async dispose() {
      listeners.clear();
      await saving;
    },
  };
}
