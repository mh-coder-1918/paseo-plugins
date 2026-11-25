import { defineRpc, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

// Chats set aside for later. They leave the project list and wait in the Later section until
// their time comes or they are brought back by hand. The list lives on the plugin's daemon, so
// every app connected to it sees the same one.

export const laterEntrySchema = z.object({
  /** Server id of the host the workspace is on. */
  hostId: z.string().min(1),
  workspaceId: z.string().min(1),
  /** ISO time the chat comes back on its own, or null to keep it until brought back by hand. */
  until: z.string().nullable(),
  /** ISO time it was set aside. */
  since: z.string(),
});

export type LaterEntry = z.infer<typeof laterEntrySchema>;

const entriesEvent = z.object({ entries: z.array(laterEntrySchema) });

/** The current list now and again after every change. */
export const watchLaterSubscription = defineSubscription({
  name: "later.watch",
  input: z.object({}),
  event: entriesEvent,
});

/** Sets a chat aside, or changes when an already set-aside chat comes back. */
export const setAsideRpc = defineRpc({
  name: "later.set-aside",
  input: z.object({ hostId: z.string().min(1), workspaceId: z.string().min(1), until: z.string().nullable() }),
  output: entriesEvent,
});

/** Brings a chat back to the project list now. */
export const bringBackRpc = defineRpc({
  name: "later.bring-back",
  input: z.object({ hostId: z.string().min(1), workspaceId: z.string().min(1) }),
  output: entriesEvent,
});
